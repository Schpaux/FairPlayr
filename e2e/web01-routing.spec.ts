import { expect, test, type Page } from "@playwright/test";

// WEB-01d (FP-WEB-01A §7.2): the website is at `/` and `/no`, the app's Home
// at `/play` and `/no/play`. An installed app's launch (`?source=pwa`, old
// and new start_url) opens the app; bookmarks, share links and sign-in are
// unchanged. The offline side is in e2e/offline/web01-launch.spec.ts.

const THEMES = ["light", "dark"] as const;
const CANVAS = { light: "rgb(249, 250, 248)", dark: "rgb(18, 27, 22)" } as const;

async function open(page: Page, path: string, theme: (typeof THEMES)[number] = "dark") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((value) => {
    try {
      window.localStorage.setItem("theme", value);
    } catch {
      // Storage unavailable: the theme check below fails instead.
    }
  }, theme);
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  return { response, errors };
}

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Hovedmeny" });

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test("the website is at / and /no, without the app shell, and not indexed", async ({ page }) => {
      for (const [path, lang, button] of [
        ["/no", "no", "Åpne appen"],
        ["/", "en", "Open the app"],
      ] as const) {
        // A visit to /no sets NEXT_LOCALE, after which / goes to /no (next-intl, as before).
        await page.context().clearCookies();
        const { response, errors } = await open(page, path, theme);
        expect(response?.status(), path).toBe(200);
        await expect(page.getByTestId("marketing-page")).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", lang);
        await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
        await expect(page.getByRole("link", { name: button })).toBeVisible();
        await expect(page.getByRole("img", { name: "FairPlayr" })).toBeVisible();
        await expect(mainNav(page)).toHaveCount(0);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
        const layout = await page.evaluate(() => ({
          bg: getComputedStyle(document.body).backgroundColor,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        }));
        expect(layout.bg).toBe(CANVAS[theme]);
        expect(layout.overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
        expect(errors).toEqual([]);
      }
    });

    test("«Åpne appen» opens the app's Home at /no/play, where Home is the active tab", async ({ page }) => {
      await open(page, "/no", theme);
      await page.getByRole("link", { name: "Åpne appen" }).click();
      await expect(page).toHaveURL(/\/no\/play$/);
      await expect(page.getByTestId("home-fixture-panel")).toBeVisible({ timeout: 30_000 });
      await expect(mainNav(page).getByRole("link", { name: "Hjem" })).toHaveAttribute("aria-current", "page");
      await expect(mainNav(page).getByRole("link", { name: "Hjem" })).toHaveAttribute("href", "/no/play");
      await expect(page.getByRole("banner").getByRole("link").first()).toHaveAttribute("href", "/no/play");
    });
  });
}

test("«Open the app» opens /play in English", async ({ page }) => {
  await open(page, "/");
  await page.getByRole("link", { name: "Open the app" }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("home-fixture-panel")).toBeVisible({ timeout: 30_000 });
});

test.describe("an installed app's launch opens the app's Home", () => {
  test("the old start_url /?source=pwa and /no?source=pwa", async ({ page }) => {
    await open(page, "/?source=pwa");
    await expect(page).toHaveURL(/\/play\?source=pwa$/);
    await expect(page.getByTestId("home-fixture-panel")).toBeVisible({ timeout: 30_000 });

    await open(page, "/no?source=pwa");
    await expect(page).toHaveURL(/\/no\/play\?source=pwa$/);
    await expect(page.getByTestId("home-fixture-panel")).toBeVisible({ timeout: 30_000 });
  });

  test("the new start_url /play?source=pwa keeps the coach's language", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "NEXT_LOCALE", value: "no", url: baseURL! }]);
    await open(page, "/play?source=pwa");
    await expect(page).toHaveURL(/\/no\/play\?source=pwa$/);
    await open(page, "/?source=pwa");
    await expect(page).toHaveURL(/\/no\/play\?source=pwa$/);
  });

  test("an iOS home-screen app that opens the website goes to the app (no marker)", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    });
    await open(page, "/no");
    await expect(page).toHaveURL(/\/no\/play\?source=pwa$/, { timeout: 30_000 });
    await expect(page.getByTestId("home-fixture-panel")).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("everything else is unchanged", () => {
  test("bookmarks to app routes open as before", async ({ page }) => {
    for (const path of ["/no/team", "/no/match/live", "/no/historikk", "/no/lineup", "/no/settings", "/team"]) {
      const { response } = await open(page, path);
      expect(response?.status(), path).toBe(200);
      await expect(mainNav(page), path).toBeVisible({ timeout: 30_000 });
    }
  });

  test("sign-in keeps its next parameter and the share page answers as before", async ({ page }) => {
    const { response } = await open(page, "/no/auth/sign-in?next=/team");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/no\/auth\/sign-in\?next=\/team$/);

    const share = await open(page, "/no/s/unknown-token-web01");
    expect(share.response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/no\/s\/unknown-token-web01$/);
    await expect(mainNav(page)).toHaveCount(0);
  });
});
