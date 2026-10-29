import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { Device, net, swStatus, waitForServiceWorker } from "./support/offline";

// Actual pre-fix worker bundled from a06f1d2 with an empty asset manifest.
// Stored as a fixture so this regression also runs in shallow checkouts.
// No new registrar/controllerchange handler runs in the stale document.
const legacyScript = readFileSync(path.join(process.cwd(), "e2e/offline/support/legacy-marketing-sw.txt"), "utf8");

for (const active of [false, true]) {
  test(`legacy cached website migrates without page JS; active match=${active} (WEB-01m)`, async ({}, info) => {
    const device = new Device(info);
    try {
      await net.on();
      await fetch("http://127.0.0.1:3221/sw-variant", {
        method: "POST", body: JSON.stringify({ script: legacyScript }),
      });
      const page = await device.page();
      await page.goto("/no");
      await page.evaluate(async () => {
        await navigator.serviceWorker.register("/serwist/sw.js", { scope: "/", updateViaCache: "none" });
      });
      await waitForServiceWorker(page);
      await page.evaluate(async (active) => {
        localStorage.setItem("fp-migration-sentinel", "match and settings must survive");
        const db = await new Promise<IDBDatabase>((resolve) => {
          const request = indexedDB.open("fp-migration-sentinel", 1);
          request.onupgradeneeded = () => request.result.createObjectStore("data");
          request.onsuccess = () => resolve(request.result);
        });
        await new Promise<void>((resolve) => {
          const tx = db.transaction("data", "readwrite");
          tx.objectStore("data").put("keep match data", "match");
          tx.oncomplete = () => resolve();
        });
        db.close();
        const cache = await caches.open("fp-precache-legacy");
        for (const url of ["/", "/no"]) await cache.put(url, new Response("<h1>Old cached website</h1>", { headers: { "Content-Type": "text/html" } }));
        const meta = await caches.open("fp-meta");
        await meta.put("/__fp-sw/meta/last-locale", new Response("no"));
        await meta.put("/__fp-sw/meta/match-active", new Response(active ? "1" : "0"));
      }, active);
      await page.goto("/no");
      await expect(page.getByRole("heading", { name: "Old cached website" })).toBeVisible();
      await net.swVariant(null);
      // Browser navigation checks the registered script, even though this HTML
      // has no JS to register/check/apply an update.
      await page.reload();
      if (active) {
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
        await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.installing))).toBe(false);
        expect((await swStatus(page)).buildId).toBe("legacy");
        await expect(page.getByRole("heading", { name: "Old cached website" })).toBeVisible();
        // The legacy app's existing match-ended protocol and update check.
        await page.evaluate(async () => {
          const registration = await navigator.serviceWorker.ready;
          await new Promise<void>((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve();
            registration.active!.postMessage({ type: "FP_SET_MATCH_ACTIVE", active: false }, [channel.port2]);
          });
          await registration.update();
        });
      }
      await expect(page.getByTestId("marketing-page")).toBeVisible({ timeout: 60_000 });
      expect((await swStatus(page)).buildId).not.toBe("legacy");
      expect(await page.evaluate(() => localStorage.getItem("fp-migration-sentinel"))).toBe("match and settings must survive");
      expect(await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const request = indexedDB.open("fp-migration-sentinel");
          request.onsuccess = () => resolve(request.result);
        });
        const value = await new Promise((resolve) => {
          const request = db.transaction("data").objectStore("data").get("match");
          request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return value;
      })).toBe("keep match data");

      // Poison both website entries: online must ignore them, offline keeps
      // their fallback. App shells remain cache-first in sw-cache-policy.
      await page.evaluate(async () => {
        const name = (await caches.keys()).find((name) => name.startsWith("fp-precache-") && name !== "fp-precache-legacy")!;
        for (const url of ["/", "/no"]) await (await caches.open(name)).put(url, new Response("<h1>Offline fallback</h1>", { headers: { "Content-Type": "text/html" } }));
      });
      for (const url of ["/", "/no"]) {
        await page.goto(url);
        await expect(page.getByTestId("marketing-page")).toBeVisible();
      }
      await device.goOffline();
      await page.goto("/no");
      await expect(page.getByRole("heading", { name: "Offline fallback" })).toBeVisible();
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Offline fallback" })).toBeVisible();
    } finally {
      await device.dispose();
    }
  });
}
