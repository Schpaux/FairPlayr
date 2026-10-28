import { expect, test, type Page } from "@playwright/test";

// WEB-01 phase 0: the website's technical foundation. Only its own messages
// reach the browser (none yet), it carries its search metadata behind
// noindex, and the app and the public match page keep all their messages.
// Routing and the installed app's launch: e2e/web01-routing.spec.ts. The
// session (no Supabase round trip on the website) and the service worker:
// e2e/offline/web01-website.spec.ts.

const THEMES = ["light", "dark"] as const;

async function open(page: Page, path: string, theme: (typeof THEMES)[number] = "dark") {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (/MISSING_MESSAGE|IntlError/.test(message.text())) problems.push(message.text());
  });
  await page.addInitScript((value) => {
    try {
      window.localStorage.setItem("theme", value);
    } catch {
      // Storage unavailable: the page still renders.
    }
  }, theme);
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  return { response, problems };
}

const mainNav = (page: Page) => page.getByRole("navigation", { name: /^(Hovedmeny|Main menu)$/ });

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    for (const { path, lang, canonical, ogLocale, title } of [
      { path: "/", lang: "en", canonical: "https://fairplayr.app", ogLocale: "en_GB", title: "Fair playing time in grassroots football" },
      { path: "/no", lang: "no", canonical: "https://fairplayr.app/no", ogLocale: "nb_NO", title: "Rettferdig spilletid i barnefotballen" },
    ] as const) {
      test(`${path}: search metadata behind noindex, and no app messages in the page`, async ({ page, context }) => {
        await context.clearCookies();
        const { response, problems } = await open(page, path, theme);
        expect(response?.status()).toBe(200);
        await expect(page.getByTestId("marketing-page")).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", lang);
        await expect(page).toHaveTitle(`${title} — FairPlayr`);

        const head = page.locator("head");
        await expect(head.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
        await expect(head.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical);
        const alternates = await head.locator('link[rel="alternate"][hreflang]').evaluateAll((links) =>
          links.map((link) => `${link.getAttribute("hreflang")} ${link.getAttribute("href")}`)
        );
        expect(alternates).toEqual(["en https://fairplayr.app", "nb https://fairplayr.app/no", "x-default https://fairplayr.app"]);
        await expect(head.locator('meta[property="og:url"]')).toHaveAttribute("content", canonical);
        await expect(head.locator('meta[property="og:locale"]')).toHaveAttribute("content", ogLocale);
        await expect(head.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "FairPlayr");
        // No hreflang Link header from next-intl (it would name this host and `no`).
        expect(response?.headers()["link"] ?? "").not.toContain("hreflang");

        const html = await page.content();
        for (const appNamespace of ["matchPlanner", "matchLive", "matchHistory", "publicMatch", "teamSwitcher", "activeMatchBanner"]) {
          expect(html, appNamespace).not.toContain(appNamespace);
        }
        expect(problems).toEqual([]);
      });
    }

    test("the app and the public match page still get every message", async ({ page }) => {
      // Six page loads on the dev server.
      test.setTimeout(90_000);
      for (const path of ["/no/play", "/no/team", "/no/match/setup", "/team", "/no/settings"]) {
        const { problems } = await open(page, path, theme);
        await expect(mainNav(page), path).toBeVisible({ timeout: 30_000 });
        expect(await page.content(), path).toContain("matchPlanner");
        await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute("content", "noindex, nofollow");
        expect(problems, path).toEqual([]);
      }
      const share = await open(page, "/no/s/unknown-token-web01", theme);
      expect(share.response?.status()).toBe(200);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      expect(await page.content()).toContain("publicMatch");
      expect(share.problems).toEqual([]);
    });
  });
}

test.describe("the website's language", () => {
  test.use({ locale: "nb-NO" });

  test("/ follows a Norwegian device to /no, and the coach's choice wins", async ({ page, context, baseURL }) => {
    await context.clearCookies();
    await open(page, "/");
    await expect(page).toHaveURL(/\/no$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "no");

    await context.clearCookies();
    await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
    await open(page, "/");
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test("the worker's precache requests get a plain 200 (no cookies, no redirect)", async ({ playwright, baseURL }) => {
  // As src/sw/engine.ts installs: credentials omitted, the device's language.
  for (const [path, language] of [
    ["/", "en"],
    ["/", "en-US,en;q=0.9"],
    ["/no", "nb-NO,nb;q=0.9"],
    ["/no", "en"],
  ] as const) {
    const request = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "accept-language": language } });
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), `${path} ${language}`).toBe(200);
    await request.dispose();
  }
});

test("the website's other spellings are redirects, not duplicate pages", async ({ request }) => {
  for (const [path, target] of [
    ["/en", "/"],
    ["/no/", "/no"],
  ] as const) {
    const response = await request.get(path, { maxRedirects: 0, headers: { "accept-language": "en" } });
    expect([307, 308], path).toContain(response.status());
    expect(new URL(response.headers()["location"], "http://x").pathname, path).toBe(target);
  }
});

test("robots.txt names no sitemap and sitemap.xml is empty until launch", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toContain("Disallow: /serwist/");
  expect(robots).not.toContain("Sitemap:");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain("<urlset");
  expect(xml).not.toContain("<url>");
});

test("the Vercel production host answers X-Robots-Tag: noindex, fairplayr.app does not", async ({ request }) => {
  const vercel = await request.get("/no", { headers: { host: "fair-playr.vercel.app" }, maxRedirects: 0 });
  expect(vercel.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const site = await request.get("/no", { headers: { host: "fairplayr.app" }, maxRedirects: 0 });
  expect(site.headers()["x-robots-tag"]).toBeUndefined();
});
