import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Device, SHOTS_DIR, THEMES, hideDevOverlay, net, waitForServiceWorker } from "./support/offline";
import { firstVisitGuest } from "./support/flows";

// OFF-01a acceptance 4: no /api, auth, RSC or Supabase response is ever served
// from (or stored in) a service worker cache; precached shells were fetched
// without cookies; unknown routes offline show the offline page; `/` offline
// opens the last used locale. Network cut at the proxy.

const SHELLS = ["/", "/match/setup", "/match/live", "/team", "/offline", "/no", "/no/match/setup", "/no/match/live", "/no/team", "/no/offline"];

async function cachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) out.push(`${name} ${request.url}`);
    }
    return out;
  });
}

/** Runs fetch() in the page; resolves "error" when the request fails. */
async function probe(page: Page, url: string, init?: RequestInit): Promise<{ status: number | "error"; fromSw: boolean | null }> {
  const responsePromise = page
    .waitForResponse((response) => response.url().startsWith(new URL(url, page.url()).toString().split("#")[0]), { timeout: 8000 })
    .catch(() => null);
  const status = await page.evaluate(
    async ({ url, init }) => {
      try {
        return (await fetch(url, init)).status;
      } catch {
        return "error" as const;
      }
    },
    { url, init }
  );
  const response = status === "error" ? null : await responsePromise;
  return { status, fromSw: response ? response.fromServiceWorker() : null };
}

for (const theme of THEMES) {
  test(`cache policy, offline page and / fallback (${theme})`, async ({}, info) => {
    const device = new Device(info);
    try {
      await net.clearLog();
      const context = await device.start();
      // A cookie the shells must never be fetched with.
      await context.addCookies([{ name: "fp-e2e-user", value: "coach", url: "http://localhost:3220" }]);
      let { page } = await firstVisitGuest(device, theme);

      // ── The worker script is never cached by the browser, no source map. ──
      const sw = await fetch("http://localhost:3220/serwist/sw.js");
      expect(sw.headers.get("cache-control")).toContain("no-store");
      expect(sw.headers.get("service-worker-allowed")).toBe("/");
      expect((await fetch("http://localhost:3220/serwist/sw.js.map")).ok).toBe(false);

      // ── Precache requests: every shell, none with a cookie. ────────────────
      const precached = (await net.log()).filter((entry) => entry.precache !== null);
      const shellRequests = precached.filter((entry) => SHELLS.includes(entry.url.split("?")[0]));
      expect(new Set(shellRequests.map((entry) => entry.url))).toEqual(new Set(SHELLS));
      expect(shellRequests.filter((entry) => entry.hasCookie)).toEqual([]);
      // ...while the page's own requests did carry the cookie.
      expect((await net.log()).some((entry) => entry.precache === null && entry.hasCookie)).toBe(true);

      // ── Online: API, RSC, POST and Supabase are not answered by the worker. ─
      for (const [url, init] of [
        ["/api/home/summary", undefined],
        ["/no/match/live", { headers: { RSC: "1" } }],
        ["/no/match/live?_rsc=abc", undefined],
        ["http://localhost:3229/rest/v1/teams", { headers: { apikey: "dummy-anon-key" } }],
        ["http://localhost:3229/auth/v1/user", undefined],
      ] as const) {
        const result = await probe(page, url, init as RequestInit | undefined);
        expect(result.fromSw, `${url} not from the worker`).not.toBe(true);
      }
      await probe(page, "/no", { method: "POST", body: "x" });

      const cached = await cachedUrls(page);
      expect(cached.length).toBeGreaterThan(10);
      for (const entry of cached) {
        const url = new URL(entry.split(" ")[1]);
        expect(url.origin, entry).toBe("http://localhost:3220");
        const allowed =
          url.pathname.startsWith("/_next/static/") ||
          SHELLS.includes(url.pathname) ||
          url.pathname === "/manifest.webmanifest" ||
          url.pathname === "/favicon.ico" ||
          url.pathname === "/apple-icon.png" ||
          url.pathname.startsWith("/icons/") ||
          url.pathname.startsWith("/__fp-sw/meta/");
        expect(allowed, `unexpected cache entry ${entry}`).toBe(true);
        expect(url.search, entry).toBe("");
      }
      expect(cached.some((entry) => /woff2/.test(entry)), "fonts precached").toBe(true);

      // The last page shown in English sets the locale for `/`.
      await page.goto("/team", { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "en");

      // ── Cut the network; cold start. ───────────────────────────────────────
      await device.goOffline();
      await expect(fetch("http://localhost:3220/no")).rejects.toThrow();
      await device.restart();
      page = await device.page();

      // `/` → English Home (last locale en), served by the worker.
      const root = await page.goto("/", { waitUntil: "domcontentloaded" });
      expect(root?.fromServiceWorker()).toBe(true);
      await expect(page).toHaveURL("http://localhost:3220/");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");

      // A Norwegian page switches the last locale: `/` → /no.
      await page.goto("/no/team", { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "no");
      await page.waitForTimeout(500);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/no$/);

      // Unknown or non-shell routes → the offline page, never an error page.
      for (const [url, lang, title] of [
        ["/no/historikk", "no", "Denne siden trenger nett"],
        ["/no/match/00000000-0000-4000-8000-000000000000", "no", "Denne siden trenger nett"],
        ["/settings", "en", "This page needs a connection"],
      ] as const) {
        const response = await page.goto(url, { waitUntil: "domcontentloaded" });
        expect(response?.fromServiceWorker(), url).toBe(true);
        expect(response?.status(), url).toBe(200);
        await expect(page.getByTestId("offline-page")).toBeVisible();
        await expect(page.getByRole("heading", { name: title })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", lang);
      }

      // Offline page screenshot (Norwegian, 375×667 is the reference).
      await page.goto("/no/historikk", { waitUntil: "domcontentloaded" });
      await hideDevOverlay(page);
      await expect(page.getByRole("link", { name: "Til forsiden" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Prøv igjen" })).toBeVisible();
      if (info.project.name === "iphone-se-375x667") {
        mkdirSync(SHOTS_DIR, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS_DIR, `offline-page-${theme}-375x667.png`) });
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      // Offline, API and RSC requests fail instead of coming from a cache.
      expect((await probe(page, "/api/home/summary")).status).toBe("error");
      expect((await probe(page, "/no/match/live", { headers: { RSC: "1" } })).status).toBe("error");
      expect((await probe(page, "/no/match/live?_rsc=1")).status).toBe("error");
      expect((await probe(page, "http://localhost:3229/rest/v1/teams")).status).toBe("error");

      // The worker never stored a navigation at runtime.
      const after = await cachedUrls(page);
      expect(after.filter((entry) => /historikk|00000000|settings/.test(entry))).toEqual([]);
      await waitForServiceWorker(page);
    } finally {
      await device.dispose();
    }
  });
}
