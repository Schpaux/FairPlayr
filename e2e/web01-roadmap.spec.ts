import { expect, test } from "@playwright/test";
import { getWebsiteRoadmap, hasMilestonePreview } from "../src/lib/marketing/roadmap";

for (const theme of ["light", "dark"] as const) {
  for (const locale of ["no", "en"] as const) {
    test(`${locale} roadmap in ${theme}: public copy, release evidence, navigation and SEO`, async ({ page, context }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (/MISSING_MESSAGE|IntlError/.test(message.text())) errors.push(message.text()); });
      await context.clearCookies();
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      const path = locale === "no" ? "/no/roadmap" : "/roadmap";
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      await expect(page.getByTestId("roadmap-page")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText("Roadmap");
      const main = page.locator("main");
      const data = getWebsiteRoadmap(locale);
      for (const item of [...data.developing, ...data.planned, ...data.released]) {
        await expect(main.getByRole("heading", { name: item.title, exact: true }).first()).toBeVisible();
      }
      const history = page.locator("#history");
      await expect(history.getByRole("list")).toHaveCount(1);
      await expect(history.locator("time")).toHaveCount(data.released.filter((item) => item.date).length);
      await expect(history.locator('[data-state="upcoming"] time')).toHaveCount(0);
      expect(await main.innerText()).not.toMatch(/Modern Sideline|WEB-01|P[0-3]|committed|implemented|roadmap\.roadmap/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://fairplayr.app${path}`);
      await expect(page.locator('link[hreflang="nb"]')).toHaveAttribute("href", "https://fairplayr.app/no/roadmap");
      await expect(page.locator('link[hreflang="en"]')).toHaveAttribute("href", "https://fairplayr.app/roadmap");
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `https://fairplayr.app${path}`);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
      const nav = page.getByRole("navigation", { name: locale === "no" ? "Nettstedet" : "Website" });
      await expect(nav.getByRole("link", { name: "Roadmap", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(page.locator('a[href$="/play"]')).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /^(Under utvikling|På planen|In development|Planned)$/ })).toHaveCount(0);
      if (hasMilestonePreview(data.latest)) {
        await expect(page.getByTestId("roadmap-share-demo")).toBeVisible();
      } else {
        await expect(page.locator('[data-preview="static"]')).toBeVisible();
        await expect(page.getByTestId("roadmap-share-demo")).toHaveCount(0);
        await expect(page.getByRole("heading", { name: data.latest!.title, level: 2, exact: true })).toBeVisible();
      }
      await expect(history.locator('[data-state="upcoming"]')).toHaveCount(data.upcoming.length);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(theme);
      expect(errors).toEqual([]);
      await nav.locator('a[hreflang]').click();
      await expect(page).toHaveURL(locale === "no" ? /\/roadmap$/ : /\/no\/roadmap$/);
      await expect(page.locator("html")).toHaveAttribute("lang", locale === "no" ? "en" : "no");
    });
  }
}

test("home navigation discovers the roadmap, then returns to the home page", async ({ page }) => {
  await page.goto("/no");
  await page.getByRole("navigation", { name: "Nettstedet" }).getByRole("link", { name: "Roadmap", exact: true }).click();
  await expect(page).toHaveURL(/\/no\/roadmap$/);
  await page.getByRole("link", { name: "Til forsiden", exact: true }).first().click();
  await expect(page).toHaveURL(/\/no$/);
  await expect(page.getByTestId("marketing-page")).toBeVisible();
});

test.describe("server-rendered roadmap", () => {
  test.use({ javaScriptEnabled: false });
  test("content, localised navigation and date labels work without JavaScript", async ({ page }) => {
    await page.goto("/no/roadmap");
    await expect(page.getByRole("heading", { name: "Roadmap", exact: true })).toBeVisible();
    await expect(page.locator("#history")).toContainText("Tilgjengelig senest");
    if (hasMilestonePreview(getWebsiteRoadmap("no").latest)) {
      await expect(page.getByTestId("roadmap-share-demo").locator(".fp-live-pulse")).toHaveCSS("animation-play-state", "paused");
      await expect(page.getByRole("button", { name: "Spill av demonstrasjonen" })).toBeDisabled();
    } else {
      await expect(page.locator('[data-preview="static"]')).toBeVisible();
      await expect(page.getByTestId("roadmap-share-demo")).toHaveCount(0);
    }
    await page.getByRole("link", { name: "Se tidslinjen", exact: true }).click();
    await expect(page).toHaveURL(/#history$/);
    await expect(page.locator("#history-title")).toBeInViewport();
  });
});


test("the milestone demo stays local, respects reduced motion, and keeps score and goals together", async ({ page }) => {
  test.skip(!hasMilestonePreview(getWebsiteRoadmap("no").latest), "The latest milestone uses the static fallback; keep this check for a supported featured demo.");
  const reads: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/public/")) reads.push(request.url()); });
  await page.goto("/no/roadmap");
  const demo = page.getByTestId("roadmap-share-demo");
  await demo.scrollIntoViewIfNeeded();
  const clock = demo.getByTestId("public-match-clock");
  await expect(clock).toHaveText("16:48");
  await page.waitForTimeout(1100);
  await expect(clock).toHaveText("16:48");
  await page.clock.install();
  await demo.getByRole("button", { name: "Spill av demonstrasjonen" }).click();
  await page.clock.runFor(13_000);
  await expect(demo.getByTestId("public-match-score")).toHaveText(/2\s*–\s*0/);
  await expect(demo.getByTestId("roadmap-demo-goals").getByRole("listitem")).toHaveCount(2);
  await demo.getByRole("button", { name: "Sett demonstrasjonen på pause" }).click();
  const pausedTime = await clock.innerText();
  await page.clock.runFor(3000);
  await expect(clock).toHaveText(pausedTime);
  await expect(demo.locator(".fp-live-pulse")).toHaveCSS("animation-play-state", "paused");
  expect(reads).toEqual([]);
});
