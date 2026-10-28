import { expect, test, type Page } from "@playwright/test";
import { Device, THEMES, goalUs, guestTeam, hideDevOverlay, net, openLive, scoreIs, seedDevice, storedMatch, swStatus, waitForServiceWorker, TEAMS_KEY } from "./support/offline";
import { firstVisitGuest, startMatchFromSetup } from "./support/flows";

// WEB-01A language regression: an installed app launches at the manifest's
// own start_url and opens Home in the coach's language, online and offline.
// With `/play?source=pwa` as start_url the worker served the English Home
// from its cache on a Norwegian device. A fresh install here; an install from
// before WEB-01d (another build) is in the two-builds test (FP-WEB-01A §7.3).

const LANGUAGES = [
  { device: "nb-NO", home: "/no/play", landing: /localhost:\d+\/no\/play\?source=pwa$/, lang: "no", tab: "Hjem", nav: "Hovedmeny", site: /\/no$/ },
  { device: "en-US", home: "/play", landing: /localhost:\d+\/play\?source=pwa$/, lang: "en", tab: "Home", nav: "Main menu", site: /localhost:\d+\/$/ },
] as const;

async function manifestStartUrl(page: Page): Promise<string> {
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  return manifest.start_url;
}

for (const language of LANGUAGES) {
  for (const theme of THEMES) {
    test(`new install, ${language.device} device with ${language.lang} chosen: the start_url opens Home in ${language.lang}, online and offline (${theme})`, async ({}, info) => {
      const device = new Device(info, language.device);
      try {
        let page = await device.page();
        const startUrl = await manifestStartUrl(page);
        expect(startUrl).toBe("/?source=pwa");

        const expectHome = async (label: string) => {
          await expect(page, label).toHaveURL(language.landing);
          await expect(page.locator("html"), label).toHaveAttribute("lang", language.lang);
          await hideDevOverlay(page);
          await expect(page.getByTestId("home-fixture-panel"), label).toBeVisible({ timeout: 30_000 });
          await expect(page.getByRole("navigation", { name: language.nav }).getByRole("link", { name: language.tab }), label).toHaveAttribute("aria-current", "page");
        };
        const expectWebsite = async (label: string) => {
          await expect(page, label).toHaveURL(language.site);
          await expect(page.getByTestId("marketing-page"), label).toBeVisible();
          await expect(page.locator("html"), label).toHaveAttribute("lang", language.lang);
        };

        // ── First launch right after installing: no worker yet, the server decides. ─
        await page.goto(startUrl, { waitUntil: "domcontentloaded" });
        await expectHome("first launch, online");

        // The coach uses the app in their language; the worker installs and learns it.
        await seedDevice(page, theme, { [TEAMS_KEY]: guestTeam() });
        await page.goto(language.home, { waitUntil: "domcontentloaded" });
        await waitForServiceWorker(page);
        await expect.poll(async () => (await swStatus(page)).lastLocale, { timeout: 15_000 }).toBe(language.lang);

        // ── Online, worker in control. ───────────────────────────────────────
        await device.restart(500);
        page = await device.page();
        expect((await page.goto(startUrl, { waitUntil: "domcontentloaded" }))?.fromServiceWorker()).toBe(true);
        await expectHome("launch, online");
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await expectWebsite("/ online");

        // ── Offline cold start. ──────────────────────────────────────────────
        await device.goOffline();
        await device.restart(500);
        page = await device.page();
        expect((await page.goto(startUrl, { waitUntil: "domcontentloaded" }))?.fromServiceWorker()).toBe(true);
        await expectHome("launch, offline");
        expect((await page.goto("/", { waitUntil: "domcontentloaded" }))?.fromServiceWorker()).toBe(true);
        await expectWebsite("/ offline");
      } finally {
        await device.dispose();
      }
    });
  }
}

test("active match, worker pinned to the build the match started with: the start_url opens the Norwegian Home offline, match intact", async ({}, info) => {
  const device = new Device(info);
  try {
    let { page } = await firstVisitGuest(device, "dark");
    const startUrl = await manifestStartUrl(page);
    expect(startUrl).toBe("/?source=pwa");
    const first = await swStatus(page);

    // An update installs while no match runs; the coach picks «Senere».
    await net.swVariant({ suffix: "-next" });
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
    await expect
      .poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting)), { timeout: 30_000 })
      .toBe(true);
    await page.getByRole("button", { name: "Senere" }).click();
    await startMatchFromSetup(page);
    await goalUs(page);
    const before = await storedMatch(page);

    // The app is closed mid-match, offline: the browser activates the new worker, pinned to the old build.
    await device.goOffline();
    await device.restart(500);
    page = await device.page();
    expect((await page.goto(startUrl, { waitUntil: "domcontentloaded" }))?.fromServiceWorker()).toBe(true);
    await expect(page).toHaveURL(/\/no\/play\?source=pwa$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "no");
    await hideDevOverlay(page);
    await expect(page.getByTestId("home-fixture-panel")).toHaveAttribute("data-state", "live", { timeout: 30_000 });
    const pinned = await swStatus(page);
    expect(pinned.buildId).toBe(`${first.buildId}-next`);
    expect(pinned.servedBuildId).toBe(first.buildId);

    await openLive(page);
    await hideDevOverlay(page);
    await scoreIs(page, 1, 0);
    const after = await storedMatch(page);
    expect(after.id).toBe(before.id);
    expect(after.events).toEqual(before.events);
  } finally {
    await device.dispose();
  }
});
