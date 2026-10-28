import { expect, test } from "@playwright/test";
import {
  Device,
  PENDING_COMPLETIONS_KEY,
  THEMES,
  endMatch,
  goalUs,
  hideDevOverlay,
  live,
  openLive,
  ringRatio,
  scoreIs,
  signIn,
  storedMatch,
  storedSetupStatus,
  substitute,
  waitForServiceWorker,
} from "./support/offline";
import { firstVisitGuest, startMatchFromSetup, waitForUndoToClose } from "./support/flows";

// OFF-01a follow-ups (A2 fix round, item 10):
// - the ring (time since last rest) survives a cold start, as the number does;
// - the match can be ended offline after a cold start: the result is kept on
//   the device, a signed-in coach's completion waits for the network, and
//   nothing crashes;
// - the live URL with a server match id (`/no/match/live?matchId=…`, what the
//   app opens for a match the server knows) opens offline from the worker.

function collectErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

for (const theme of THEMES) {
  test(`ring and number survive a cold start offline (${theme})`, async ({}, info) => {
    const device = new Device(info);
    try {
      let { page } = await firstVisitGuest(device, theme);
      await startMatchFromSetup(page);
      // Let the starters' rings grow, then bring p8 on: its ring starts over.
      // (p2 is an outfield starter; the keeper is left out of ring checks.)
      await page.waitForTimeout(8000);
      await substitute(page, "p5", "p8");
      await waitForUndoToClose(page);
      await page.waitForTimeout(1500);
      const before = await storedMatch(page);
      expect(before.onFieldStartedAtElapsedMs.p8).toBeGreaterThan(0);
      expect(await ringRatio(page, "p8")).toBeLessThan(await ringRatio(page, "p2"));

      await device.goOffline();
      await device.restart(1000);
      page = await device.page();
      expect((await openLive(page))?.fromServiceWorker()).toBe(true);
      await hideDevOverlay(page);

      const after = await storedMatch(page);
      expect(after.onFieldStartedAtElapsedMs).toEqual(before.onFieldStartedAtElapsedMs);
      expect(after.playerAccumulatedMs).toEqual(before.playerAccumulatedMs);
      // Still drawn from those stints: the fresh player's ring stays behind the starter's.
      await expect.poll(() => ringRatio(page, "p2")).toBeGreaterThan(0);
      expect(await ringRatio(page, "p8")).toBeLessThan(await ringRatio(page, "p2"));
      await expect(live.bench(page, "p5")).toBeVisible();
    } finally {
      await device.dispose();
    }
  });

  test(`guest: end the match offline after a cold start (${theme})`, async ({}, info) => {
    const device = new Device(info);
    try {
      let { page } = await firstVisitGuest(device, theme);
      await startMatchFromSetup(page);
      await goalUs(page);
      await scoreIs(page, 1, 0);

      await device.goOffline();
      await device.restart(1000);
      page = await device.page();
      const errors = collectErrors(page);
      expect((await openLive(page))?.fromServiceWorker()).toBe(true);
      await hideDevOverlay(page);
      await scoreIs(page, 1, 0);

      await endMatch(page);
      await expect.poll(() => storedSetupStatus(page)).toBe("ended");
      const ended = await storedMatch(page);
      expect(ended.status).toBe("ended");
      expect(ended.clock.isRunning).toBe(false);
      expect(ended.teamScore).toBe(1);

      // The ended match stays ended after another offline reload.
      expect((await page.reload({ waitUntil: "domcontentloaded" }))?.fromServiceWorker()).toBe(true);
      await expect.poll(() => storedSetupStatus(page)).toBe("ended");
      expect((await storedMatch(page)).events).toEqual(ended.events);
      expect(errors, "no uncaught errors").toEqual([]);
    } finally {
      await device.dispose();
    }
  });
}

test("signed-in: ending offline keeps the result and queues the completion for later", async ({}, info) => {
  const device = new Device(info);
  try {
    const context = await device.start();
    await signIn(context);
    let page = await device.page();
    await page.goto("/no/play", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForServiceWorker(page);
    await hideDevOverlay(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("fairplayr.cloudTeamMirror.v1") ?? "")).not.toBe("");

    await startMatchFromSetup(page, { pickSquad: true });
    const liveUrl = new URL(page.url());
    const serverMatchId = liveUrl.searchParams.get("matchId");
    info.annotations.push({ type: "live-url", description: `${liveUrl.pathname}${liveUrl.search}` });
    await goalUs(page);

    await device.goOffline();
    await device.restart(1000);
    page = await device.page();
    const errors = collectErrors(page);
    expect((await openLive(page, `${liveUrl.pathname}${liveUrl.search}`))?.fromServiceWorker()).toBe(true);
    await hideDevOverlay(page);
    await scoreIs(page, 1, 0);

    await endMatch(page);
    await expect.poll(() => storedSetupStatus(page)).toBe("ended");
    expect((await storedMatch(page)).status).toBe("ended");

    if (serverMatchId) {
      // Offline: the completion waits on the device for the next connection.
      await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(key) ?? "", PENDING_COMPLETIONS_KEY))
        .toContain(serverMatchId);
    } else {
      info.annotations.push({ type: "note", description: "no server match id: a local-only match has no completion to queue" });
    }
    expect(errors, "no uncaught errors").toEqual([]);
  } finally {
    await device.dispose();
  }
});

test("the live URL with a server match id opens offline from the worker", async ({}, info) => {
  const device = new Device(info);
  try {
    let { page } = await firstVisitGuest(device, "dark");
    await startMatchFromSetup(page);
    await goalUs(page);
    const before = await storedMatch(page);

    await device.goOffline();
    await device.restart(1000);
    page = await device.page();
    // A local setup decides which match this device runs; the query only
    // matters for a server match without one. The shell ignores the query.
    const response = await openLive(page, "/no/match/live?matchId=44444444-4444-4444-8444-444444444444");
    expect(response?.fromServiceWorker()).toBe(true);
    expect(response?.status()).toBe(200);
    await hideDevOverlay(page);
    await scoreIs(page, 1, 0);
    expect((await storedMatch(page)).events).toEqual(before.events);
  } finally {
    await device.dispose();
  }
});
