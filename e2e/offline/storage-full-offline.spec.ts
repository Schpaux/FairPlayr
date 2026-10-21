import { expect, test, type Page } from "@playwright/test";
import { Device, THEMES, goalUs, hideDevOverlay, openLive, scoreIs, storedMatch } from "./support/offline";
import { firstVisitGuest, startMatchFromSetup } from "./support/flows";

// Stream A's storage failure stays visible in the production build served by
// the worker, offline after a cold start (mirrors e2e/live-storage-full.spec.ts):
// the scoreboard meta line says «Ikke lagret» for as long as saving fails,
// the menu's first row explains it, the band shows the full notice only
// where it covers no token (`data-fits`), and the match keeps working from
// memory.

for (const theme of THEMES) {
  test(`a full device offline: the storage error stays visible (${theme})`, async ({}, info) => {
    const device = new Device(info);
    try {
      let { page } = await firstVisitGuest(device, theme);
      await startMatchFromSetup(page);
      await device.goOffline();
      await device.restart(500);
      page = await device.page();
      expect((await openLive(page))?.fromServiceWorker()).toBe(true);
      await hideDevOverlay(page);
      const before = await storedMatch(page);

      await page.evaluate(() => {
        Storage.prototype.setItem = function () {
          throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        };
      });
      await goalUs(page);
      await scoreIs(page, 1, 0);

      // Always: «Ikke lagret» (glyph + words) in the scoreboard meta line, announced once.
      const meta = page.getByTestId("live-meta");
      await expect(meta).toHaveText("Ikke lagret");
      await expect(meta.locator("svg")).toBeVisible();
      await expect(page.getByRole("alert").filter({ hasText: "Kampen lagres ikke på enheten." })).toHaveCount(1);
      await expect(page.getByTestId("storage-error-cue")).toHaveCount(0);

      // The full band only where it covers no token; otherwise hidden (the
      // sr-only live region above still speaks).
      const band = page.getByTestId("live-notice-band");
      await expect(band).toHaveAttribute("data-fits", /true|false/);
      const fits = (await band.getAttribute("data-fits")) === "true";
      const notice = page.getByTestId("storage-error-notice");
      if (fits) {
        await expect(notice).toBeVisible();
        await expect(notice).toContainText("Lagringen er full eller blokkert.");
      } else {
        await expect(band).toBeHidden();
      }

      // The menu's first row explains it.
      await page.getByRole("button", { name: "Kampmeny", exact: true }).click();
      const menu = page.getByTestId("live-menu");
      await expect(menu.locator("p").first()).toContainText("Kampen lagres ikke på enheten.");
      await menu.getByRole("button", { name: "Lukk", exact: true }).click();
      await expect(menu).toHaveCount(0);

      // Never auto-dismissed.
      await page.waitForTimeout(9000);
      await expect(meta).toHaveText("Ikke lagret");
      if (fits) await expect(notice).toBeVisible();
      // The match keeps working from memory; the device still holds the last good state.
      await goalThemStillWorks(page);
      expect((await storedMatch(page)).events).toEqual(before.events);
    } finally {
      await device.dispose();
    }
  });
}

async function goalThemStillWorks(page: Page) {
  await page.getByRole("button", { name: "Mål for dem", exact: true }).click();
  await scoreIs(page, 1, 1);
}
