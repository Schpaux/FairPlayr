import { expect, test } from "@playwright/test";
import { Device, STUB_TEAM_NAME, STUB_USER, net, signIn, waitForServiceWorker, type LoggedRequest } from "./support/offline";

const WEBSITE = new Set(["/", "/no", "/no/"]);
const pathOf = (url: string) => url.split("?")[0];

/** Supabase calls with no app request (other than the website and static files) before them. */
function unexplained(log: LoggedRequest[]): LoggedRequest[] {
  const appRequests = log.filter((entry) => entry.target === "app" && !WEBSITE.has(pathOf(entry.url)) && !pathOf(entry.url).includes("."));
  return log.filter((entry) => entry.target === "supabase" && !appRequests.some((app) => app.at <= entry.at));
}

// WEB-01 phase 0, in a production build: a signed-in coach visits the
// website. The proxy skips the Supabase session refresh there and the page
// itself never talks to Supabase, so the stub (e2e/offline/support/
// netControl.mjs, which logs the server's and the browser's requests) sees
// nothing for the website's own requests (a prefetch of the app's Home is an
// app request and refreshes as before). «Åpne appen» then opens Home signed
// in, without a new sign-in,
// and the app refreshes the session as before. With the worker installed,
// the website still opens from its precache offline.

test("signed-in coach: the website makes no Supabase request, the app keeps the session", async ({}, info) => {
  const device = new Device(info);
  try {
    const context = await device.start();
    await signIn(context);
    const page = await device.page();

    // The website's own response, with the session cookie: no Supabase call at all.
    await net.clearLog();
    // `/` first and in English: /no sets NEXT_LOCALE=no, after which / redirects there.
    expect((await context.request.get("/", { maxRedirects: 0, headers: { "accept-language": "en" } })).status()).toBe(200);
    expect((await context.request.get("/no", { maxRedirects: 0 })).status()).toBe(200);
    expect((await net.log()).filter((entry) => entry.target === "supabase")).toEqual([]);

    // A real visit: only app requests (the Home link's prefetch) reach Supabase.
    await net.clearLog();
    await page.goto("/no", { waitUntil: "load" });
    await expect(page.getByTestId("marketing-page")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(unexplained(await net.log())).toEqual([]);

    await page.getByRole("link", { name: "Åpne appen" }).click();
    await expect(page).toHaveURL(/\/no\/play$/);
    await expect(page.locator("header").first()).toContainText(STUB_TEAM_NAME, { timeout: 30_000 });
    await page.getByRole("button", { name: "Åpne profilmeny" }).click();
    await expect(page.getByText(STUB_USER.email).first()).toBeVisible();
    await page.keyboard.press("Escape");
    expect((await net.log()).some((entry) => entry.target === "supabase" && entry.url.startsWith("/auth/v1/user"))).toBe(true);

    // With the worker installed, the website is still Supabase-free, online and offline.
    await waitForServiceWorker(page);
    await net.clearLog();
    await page.goto("/no", { waitUntil: "load" });
    await expect(page.getByTestId("marketing-page")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(unexplained(await net.log())).toEqual([]);

    await device.goOffline();
    await page.goto("/no", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("marketing-page")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  } finally {
    await device.dispose();
  }
});
