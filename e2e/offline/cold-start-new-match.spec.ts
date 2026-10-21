import { expect, test } from "@playwright/test";
import { Device, THEMES, goalUs, hideDevOverlay, live, scoreIs, storedMatch, substitute } from "./support/offline";
import { firstVisitGuest, startMatchFromSetup, waitForUndoToClose } from "./support/flows";

// OFF-01a acceptance 1 and 3 (guest, no match yet): after one online visit
// (worker installed, team on the device, no match), the app cold-starts with
// the network cut and a new match is set up, started and played offline.

for (const theme of THEMES) {
  test(`guest starts and plays a new match offline from a cold start (${theme})`, async ({}, info) => {
    const device = new Device(info);
    try {
      await firstVisitGuest(device, theme, { withSetup: false });

      await device.goOffline();
      await device.restart(500);
      const page = await device.page();
      const home = await page.goto("/no", { waitUntil: "domcontentloaded" });
      expect(home?.fromServiceWorker()).toBe(true);
      await hideDevOverlay(page);

      await startMatchFromSetup(page, { pickSquad: true });
      const started = await storedMatch(page);
      const [outA, outB] = started.onFieldPlayerIds.slice(-2);
      const [inA, inB] = started.benchPlayerIds;
      await goalUs(page);
      await scoreIs(page, 1, 0);
      await substitute(page, outA, inA);
      await live.button(page, /Angre bytte/).click();
      await expect(live.token(page, outA)).toBeVisible();
      await substitute(page, outB, inB);
      await waitForUndoToClose(page);
      await page.getByRole("button", { name: /^Stopp klokka/ }).click();
      await expect(page.getByRole("button", { name: /^Start klokka/ })).toBeVisible();

      const before = await storedMatch(page);
      expect(before.clock.isRunning).toBe(false);

      const reloaded = await page.reload({ waitUntil: "domcontentloaded" });
      expect(reloaded?.fromServiceWorker()).toBe(true);
      await expect(live.root(page)).toBeVisible({ timeout: 30_000 });
      const after = await storedMatch(page);
      expect(after.id).toBe(before.id);
      expect(after.events).toEqual(before.events);
      expect(after.onFieldPlayerIds).toEqual(before.onFieldPlayerIds);
      expect(after.clock).toEqual(before.clock);
      await scoreIs(page, 1, 0);
      await expect(live.token(page, inB)).toBeVisible();
      await expect(live.bench(page, outB)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Start klokka/ })).toBeVisible();
    } finally {
      await device.dispose();
    }
  });
}
