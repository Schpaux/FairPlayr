import { expect, test, type Page } from "@playwright/test";

// Foundation smoke tests: every main screen renders in both themes at the
// supported mobile viewports, uses the Modern Sideline palette and type, and
// never scrolls horizontally. These do not exercise match logic.

const THEMES = {
  light: { canvas: "rgb(249, 250, 248)", surface: "rgb(255, 255, 255)" },
  dark: { canvas: "rgb(18, 27, 22)", surface: "rgb(26, 38, 32)" },
} as const;

const ROUTES = [
  { name: "home", path: "/no/play" },
  { name: "team", path: "/no/team" },
  { name: "match setup", path: "/no/match/setup" },
  { name: "settings", path: "/no/settings" },
  { name: "home (en)", path: "/play" },
  // The website (WEB-01d): no app shell, the same palette and type.
  { name: "website", path: "/no" },
  { name: "website (en)", path: "/" },
];

async function openWithTheme(page: Page, path: string, theme: keyof typeof THEMES) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript((t) => {
    try {
      window.localStorage.setItem("theme", t);
    } catch {
      // Storage can be unavailable; the test then fails on the theme check.
    }
  }, theme);
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `HTTP status for ${path}`).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
  return errors;
}

for (const theme of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
  test.describe(`${theme} theme`, () => {
    for (const route of ROUTES) {
      test(`${route.name} renders without errors or horizontal overflow`, async ({ page }) => {
        const errors = await openWithTheme(page, route.path, theme);

        await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
        await expect(page.locator("main")).toBeVisible();

        const layout = await page.evaluate(() => ({
          bg: getComputedStyle(document.body).backgroundColor,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        }));
        expect(layout.bg).toBe(THEMES[theme].canvas);
        expect(layout.overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
        expect(errors, "uncaught page errors").toEqual([]);
      });
    }

    test("palette tokens resolve to the Modern Sideline values", async ({ page }) => {
      await openWithTheme(page, "/no/play", theme);
      const tokens = await page.evaluate(() => {
        const probe = document.createElement("div");
        document.body.appendChild(probe);
        const read = (cssVar: string) => {
          probe.style.backgroundColor = `var(${cssVar})`;
          return getComputedStyle(probe).backgroundColor;
        };
        const out = {
          canvas: read("--fp-canvas"),
          surface: read("--fp-surface"),
          card: read("--card"),
          lime: read("--fp-lime"),
          club: read("--fp-club"),
        };
        probe.remove();
        return out;
      });
      expect(tokens.canvas).toBe(THEMES[theme].canvas);
      expect(tokens.surface).toBe(THEMES[theme].surface);
      expect(tokens.card).toBe(THEMES[theme].surface);
      expect(tokens.lime).toBe("rgb(159, 232, 112)");
      expect(tokens.club).toBe("rgb(14, 77, 51)");
    });
  });
}

test.describe("typography", () => {
  test("UI text and headings use Inter, not Urbanist", async ({ page }) => {
    await openWithTheme(page, "/no/play", "light");
    const fonts = await page.evaluate(() => ({
      body: getComputedStyle(document.body).fontFamily,
      heading: getComputedStyle(document.querySelector("h1, h2") ?? document.body).fontFamily,
    }));
    expect(fonts.body).toMatch(/Inter/);
    expect(fonts.heading).toMatch(/Inter/);
    expect(fonts.heading).not.toMatch(/Urbanist/);
  });

  test("Barlow Condensed is bundled locally and loads for match numerals", async ({ page }) => {
    const fontRequests: string[] = [];
    page.on("request", (req) => {
      if (req.resourceType() === "font") fontRequests.push(req.url());
    });
    await openWithTheme(page, "/no/play", "light");

    const result = await page.evaluate(async () => {
      const el = document.createElement("span");
      el.className = "font-num";
      el.textContent = "2 – 1 16:20";
      document.body.appendChild(el);
      // next/font names the face after the loader variable (e.g. "barlowCondensed").
      const family = getComputedStyle(el).fontFamily;
      const primary = family.split(",")[0].trim();
      await document.fonts.load(`600 40px ${primary}`, "0123456789:");
      const faces = [...document.fonts].filter((f) => f.family.replace(/"/g, "") === primary.replace(/"/g, ""));
      el.remove();
      return { primary, statuses: faces.map((f) => f.status) };
    });

    expect(result.primary).toMatch(/barlow/i);
    expect(result.statuses).toContain("loaded");
    expect(fontRequests.some((url) => /\.woff2(\?|$)/.test(url))).toBe(true);
    // Every font is served from the app origin; nothing from Google Fonts at runtime.
    for (const url of fontRequests) {
      expect(new URL(url).host, url).toBe(new URL(page.url()).host);
    }
  });
});
