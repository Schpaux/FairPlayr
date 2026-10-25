import { expect, test } from "@playwright/test";
import { Device, THEMES, endHalf, goalUs, hideDevOverlay, live, openLive, removeLastGoalUs, scoreIs, storedMatch, substitute } from "./support/offline";
import { eventHistory, firstVisitGuest, startMatchFromSetup, waitForUndoToClose } from "./support/flows";

// OFF-01a acceptance 3: every match action works offline after a cold start
// and survives another reload offline; scoreboard, stored events and the
// event history agree after the corrections (goal undo, substitution undo).

for (const theme of THEMES) {
  test(`offline actions after a cold start survive a reload offline (${theme})`, async ({}, info) => {
    const device = new Device(info);
    try {
      let { page } = await firstVisitGuest(device, theme);
      await startMatchFromSetup(page);
      // Online history: one goal, one substitution.
      await goalUs(page);
      await substitute(page, "p5", "p8");
      await waitForUndoToClose(page);
      await scoreIs(page, 1, 0);

      await device.goOffline();
      await device.restart(1000);
      page = await device.page();
      const response = await openLive(page);
      expect(response?.fromServiceWorker()).toBe(true);
      await hideDevOverlay(page);
      await scoreIs(page, 1, 0);

      // Goal, then undo the last goal (via the menu, with confirmation).
      await goalUs(page);
      await scoreIs(page, 2, 0);
      await removeLastGoalUs(page);
      await scoreIs(page, 1, 0);

      // A substitution undone within 5 s, then a kept one.
      await substitute(page, "p6", "p9");
      await live.button(page, /Angre bytte/).click();
      await expect(live.token(page, "p6")).toBeVisible();
      await expect(live.bench(page, "p9")).toBeVisible();
      await substitute(page, "p4", "p9");
      await waitForUndoToClose(page);

      // Pause and resume, then half-time.
      await page.getByRole("button", { name: /^Stopp klokka/ }).click();
      await page.getByRole("button", { name: /^Start klokka/ }).click();
      await endHalf(page);

      const before = await storedMatch(page);
      expect(before.phase).toBe("half_time");
      expect(before.teamScore).toBe(1);
      expect(before.events.filter((event) => event.type === "goal")).toHaveLength(1);
      expect(before.onFieldPlayerIds).toEqual(expect.arrayContaining(["p8", "p9", "p6"]));
      expect(before.benchPlayerIds).toEqual(expect.arrayContaining(["p4", "p5"]));
      const historyBefore = await eventHistory(page);

      // Reload offline: everything is still there.
      const reloaded = await page.reload({ waitUntil: "domcontentloaded" });
      expect(reloaded?.fromServiceWorker()).toBe(true);
      await expect(live.root(page)).toBeVisible({ timeout: 30_000 });
      await hideDevOverlay(page);
      const after = await storedMatch(page);
      expect(after.events).toEqual(before.events);
      expect(after.phase).toBe("half_time");
      expect(after.onFieldPlayerIds).toEqual(before.onFieldPlayerIds);
      expect(after.benchPlayerIds).toEqual(before.benchPlayerIds);
      await scoreIs(page, 1, 0);
      await expect(live.strip(page)).toHaveAttribute("data-strip", "halfTime");

      // Event history matches the scoreboard: one goal, two kept substitutions.
      const history = await eventHistory(page);
      expect(history).toEqual(historyBefore);
      // Rows carry the spoken text (C6 EventTimeline): "mål for oss: …", "bytte: … inn, … ut".
      expect(history.filter((row) => /mål for oss/.test(row))).toHaveLength(1);
      expect(history.filter((row) => /bytte: .+ inn, .+ ut/.test(row))).toHaveLength(2);

      // Second half starts offline too.
      await live.button(page, "Start 2. omgang").click();
      await expect(page.getByTestId("live-clock")).toContainText("2. omgang");
      expect((await storedMatch(page)).phase).toBe("second_half");
    } finally {
      await device.dispose();
    }
  });
}
