import { expect, test, type Page } from "@playwright/test";
import { Device, THEMES, goalUs, hideDevOverlay, live, openLive, scoreIs, storedMatch, substitute } from "./support/offline";
import { firstVisitGuest, startMatchFromSetup } from "./support/flows";

// WEB-01d (FP-WEB-01A §7.2): an installed app cold-starts offline, mid-match,
// at the start_url from before WEB-01d (`/no?source=pwa`, `/?source=pwa`) and
// at the new one (`/no/play?source=pwa`). Each opens the app's Home from the
// worker; the device's data is untouched and the match (clock, substitutions,
// goals) is intact. Without the marker, `/no` is the website, also offline.

/** Every `fairplayr.*` key on the device, as stored. */
async function deviceData(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)!;
      if (key.startsWith("fairplayr.")) out[key] = localStorage.getItem(key)!;
    }
    return out;
  });
}

/** Without what the live screen itself writes as it runs and closes (match, setup, heartbeat). */
function notWrittenByLive(data: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !["fairplayr.liveMatch.v1", "fairplayr.matchSetup.v1", "fairplayr.liveHeartbeat.v1"].includes(key))
  );
}

for (const theme of THEMES) {
  test(`installed app: offline cold start at the old and new start_url opens the app, match intact (${theme})`, async ({}, info) => {
    const device = new Device(info);
    try {
      // ── Online: install the worker, start a match, a goal and a substitution. ─
      let { page } = await firstVisitGuest(device, theme);
      await startMatchFromSetup(page);
      await goalUs(page);
      await scoreIs(page, 1, 0);
      await substitute(page, "p5", "p8");
      await expect(live.strip(page)).not.toHaveAttribute("data-strip", "undo", { timeout: 10_000 });
      // Paused, so the stored match must not change at all while closed.
      await page.getByRole("button", { name: /^Stopp klokka/ }).click();
      await expect(page.getByRole("button", { name: /^Start klokka/ })).toBeVisible();
      const before = await storedMatch(page);
      const dataBefore = await deviceData(page);
      expect(Object.keys(dataBefore)).toEqual(expect.arrayContaining(["fairplayr.liveMatch.v1", "fairplayr.teams.v2"]));

      await device.goOffline();
      // Byte-identical from the first launch on: launches and the website write nothing.
      let launched: Record<string, string> | null = null;
      for (const [url, landing] of [
        ["/no?source=pwa", /\/no\/play\?source=pwa$/],
        ["/?source=pwa", /\/no\/play\?source=pwa$/],
        ["/no/play?source=pwa", /\/no\/play\?source=pwa$/],
      ] as const) {
        // ── Close the app; reopen it offline at this start_url. ──────────────
        await device.restart(500);
        page = await device.page();
        const response = await page.goto(url, { waitUntil: "domcontentloaded" });
        expect(response?.fromServiceWorker(), `${url} from the worker`).toBe(true);
        await expect(page, url).toHaveURL(landing);
        await hideDevOverlay(page);
        await expect(page.getByTestId("home-fixture-panel"), url).toBeVisible({ timeout: 30_000 });
        const data = await deviceData(page);
        expect(notWrittenByLive(data), `${url}: device data unchanged`).toEqual(notWrittenByLive(dataBefore));
        if (launched === null) launched = data;
        else expect(data, `${url}: byte-identical to the first launch`).toEqual(launched);
      }

      // The website without the marker, offline: the front page, no app shell.
      const site = await page.goto("/no", { waitUntil: "domcontentloaded" });
      expect(site?.fromServiceWorker()).toBe(true);
      await expect(page.getByTestId("marketing-page")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Hovedmeny" })).toHaveCount(0);
      expect(await deviceData(page)).toEqual(launched);

      // ── Back to the match: clock, substitution and goal as they were. ───────
      await openLive(page);
      await hideDevOverlay(page);
      const after = await storedMatch(page);
      expect(after.id).toBe(before.id);
      expect(after.events).toEqual(before.events);
      expect(after.onFieldPlayerIds).toEqual(before.onFieldPlayerIds);
      expect(after.benchPlayerIds).toEqual(before.benchPlayerIds);
      expect(after.clock).toEqual(before.clock);
      await scoreIs(page, 1, 0);
      await expect(live.token(page, "p8")).toBeVisible();
      await expect(live.bench(page, "p5")).toBeVisible();
      expect(notWrittenByLive(await deviceData(page))).toEqual(notWrittenByLive(dataBefore));
    } finally {
      await device.dispose();
    }
  });
}
