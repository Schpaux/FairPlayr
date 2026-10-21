import { expect, test, type Page } from "@playwright/test";
import {
  Device,
  SETUP_KEY,
  TEAMS_KEY,
  THEMES,
  draftSetup,
  elapsedMs,
  goalUs,
  guestTeam,
  hideDevOverlay,
  live,
  minutesByPlayer,
  openLive,
  scoreIs,
  seedDevice,
  storedMatch,
  substitute,
  waitForServiceWorker,
} from "./support/offline";

// OFF-01a acceptance 1–2 (guest): after one online visit, a match started
// online is restored after the browser was closed and reopened with the
// network cut outside the browser (the proxy refuses every connection).

const IDS = guestTeam().teams[0].players.map((player) => player.id);
const CLOSED_MS = 4000;

async function clockSeconds(page: Page): Promise<number> {
  const text = (await page.getByTestId("live-clock").locator("b").textContent()) ?? "";
  const [minutes, seconds] = text.trim().split(":").map(Number);
  return minutes * 60 + seconds;
}

for (const [index, theme] of THEMES.entries()) {
  // Light keeps the clock running while closed; dark pauses it first.
  const paused = index === 1;

  test(`guest: cold start offline restores a ${paused ? "paused" : "running"} match (${theme})`, async ({}, info) => {
    const device = new Device(info);
    try {
      // ── First online visit: the worker installs and precaches. ─────────────
      let page = await device.page();
      await page.goto("/no", { waitUntil: "domcontentloaded" });
      await seedDevice(page, theme, { [TEAMS_KEY]: guestTeam(), [SETUP_KEY]: draftSetup("team-e2e", IDS) });
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForServiceWorker(page);

      // ── Start the match online: setup → live, goal, substitution. ──────────
      await page.goto("/no/match/setup", { waitUntil: "domcontentloaded" });
      await hideDevOverlay(page);
      const start = page.getByRole("button", { name: /Start kamp/ });
      await expect(start).toBeEnabled({ timeout: 30_000 });
      await start.click();
      await expect(page).toHaveURL(/\/no\/match\/live/, { timeout: 30_000 });
      await expect(live.root(page)).toBeVisible({ timeout: 30_000 });
      await live.button(page, "Avspark").click();
      await page.waitForTimeout(1500);
      await goalUs(page);
      await scoreIs(page, 1, 0);
      await substitute(page, "p5", "p8");
      // Let the 5 s undo window close so the substitution is final.
      await expect(live.strip(page)).not.toHaveAttribute("data-strip", "undo", { timeout: 10_000 });
      if (paused) {
        await page.getByRole("button", { name: /^Stopp klokka/ }).click();
        await expect(page.getByRole("button", { name: /^Start klokka/ })).toBeVisible();
      }

      const before = await storedMatch(page);
      const beforeAt = Date.now();
      const beforeClock = await clockSeconds(page);
      expect(before.teamScore).toBe(1);
      expect(before.onFieldPlayerIds).toContain("p8");
      expect(before.benchPlayerIds).toContain("p5");
      expect(before.clock.isRunning).toBe(!paused);

      // ── Cut the network, close the browser, wait, reopen. ──────────────────
      await device.goOffline();
      await device.restart(CLOSED_MS);
      page = await device.page();
      const response = await openLive(page);
      expect(response?.fromServiceWorker(), "live shell from the worker").toBe(true);
      await hideDevOverlay(page);

      const after = await storedMatch(page);
      const now = Date.now();
      expect(after.id).toBe(before.id);
      expect(after.events).toEqual(before.events);
      expect(after.onFieldPlayerIds).toEqual(before.onFieldPlayerIds);
      expect(after.benchPlayerIds).toEqual(before.benchPlayerIds);
      expect(after.liveSlotAssignments).toEqual(before.liveSlotAssignments);
      expect(after.clock.isRunning).toBe(!paused);
      await scoreIs(page, 1, 0);
      await expect(live.token(page, "p8")).toBeVisible();
      await expect(live.bench(page, "p5")).toBeVisible();

      const minutesBefore = minutesByPlayer(before, now);
      const minutesAfter = minutesByPlayer(after, now);
      for (const id of IDS) expect(Math.abs((minutesAfter[id] ?? 0) - (minutesBefore[id] ?? 0)), `minutes ${id}`).toBeLessThanOrEqual(1000);

      const gap = now - beforeAt;
      expect(gap).toBeGreaterThanOrEqual(CLOSED_MS);
      if (paused) {
        expect(elapsedMs(after, now)).toBe(elapsedMs(before, beforeAt));
        await expect(page.getByRole("button", { name: /^Start klokka/ })).toBeVisible();
        expect(await clockSeconds(page)).toBe(beforeClock);
      } else {
        // The clock kept running while the app was closed (wall clock).
        expect(elapsedMs(after, now)).toBeGreaterThanOrEqual(elapsedMs(before, beforeAt) + CLOSED_MS);
        expect(await clockSeconds(page)).toBeGreaterThanOrEqual(beforeClock + CLOSED_MS / 1000 - 1);
        await expect(page.getByRole("button", { name: /^Stopp klokka/ })).toBeVisible();
      }
      // The offline glyph replaces the status dot (DESIGN.md §6.5).
      await expect(page.getByRole("img", { name: "Frakoblet, lagres på telefonen" })).toBeVisible();

      // ── The other shells open offline too, with the match intact. ──────────
      for (const url of ["/no", "/", "/no/match/setup"]) {
        const other = await device.page();
        const res = await other.goto(url, { waitUntil: "domcontentloaded" });
        expect(res?.fromServiceWorker(), `${url} from the worker`).toBe(true);
        if (url === "/") await expect(other).toHaveURL(/\/no\/?$/); // last used locale
        await expect(other.getByRole("link", { name: /Kamp pågår/ }).first()).toBeVisible({ timeout: 30_000 });
        expect((await storedMatch(other)).events).toEqual(before.events);
        await other.close();
      }
    } finally {
      await device.dispose();
    }
  });
}
