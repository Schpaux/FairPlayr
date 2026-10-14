import { expect, test, type Page } from "@playwright/test";

// FP-MATCH-001: first half → half-time → second half → full time in the
// existing live view, with match actions taken offline and a reload during the
// second half. The reload itself runs with the network re-enabled (there is no
// service worker yet), so this does NOT prove offline cold start; it proves the
// match state survives a reload from device storage. Seeds a
// guest team and an active 2×15 setup in localStorage and reads the stored
// live match back to check what was persisted. The match is guest/local-only
// (no server id), so ending it shows the "saved on this device" state.

const NOW = "2026-10-14T10:00:00.000Z";
const MIN = 60_000;

function seed() {
  const players = ["Frida", "Ida", "Selma", "Vilde", "Maja", "Nora", "Emma"].map((name, index) => ({
    id: `p${index + 1}`,
    name,
    number: index + 1,
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: NOW,
    updatedAt: NOW,
  }));
  const starters = players.slice(0, 5).map((player) => player.id);

  return {
    workspace: {
      version: 2,
      teams: [{ id: "team-e2e", name: "Lyn G12", players, createdAt: NOW, updatedAt: NOW }],
      activeTeamId: "team-e2e",
    },
    setup: {
      version: 2,
      status: "active",
      serverMatchId: null,
      config: {
        id: "setup-e2e-halves",
        teamId: "team-e2e",
        format: "5v5",
        reportEnabled: false,
        formationId: "5v5-2-2",
        duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
        selectedPlayerIds: players.map((player) => player.id),
        startingPlayerIds: starters,
        slotAssignments: Object.fromEntries(starters.map((id, index) => [`5v5-${index + 1}`, id])),
        createdAt: NOW,
        updatedAt: NOW,
      },
    },
  };
}

async function storedLiveMatch(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("fairplayr.liveMatch.v1");
    return raw ? (JSON.parse(raw) as { liveMatch: Record<string, unknown> }).liveMatch : null;
  });
}

/**
 * page.clock.fastForward() issued just after a reload is sometimes lost while
 * the fake clock is re-installed in the new document. Advance only what is
 * still missing until the page's own Date.now() has moved by `ms`.
 */
async function fastForwardAfterReload(page: Page, ms: number) {
  const pageNow = () => page.evaluate(() => Date.now());
  const from = await pageNow();
  await expect(async () => {
    const remaining = from + ms - (await pageNow());
    if (remaining > 0) await page.clock.fastForward(remaining);
    expect((await pageNow()) - from).toBeGreaterThanOrEqual(ms);
  }).toPass({ timeout: 10_000 });
}

test("plays both halves with offline actions and keeps the second half across a reload", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());

  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript((data) => {
    if (sessionStorage.getItem("fp-e2e-seeded")) return;
    sessionStorage.setItem("fp-e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("fairplayr.teams.v2", JSON.stringify(data.workspace));
    localStorage.setItem("fairplayr.matchSetup.v1", JSON.stringify(data.setup));
  }, seed());

  await page.goto("/no/match/live", { waitUntil: "domcontentloaded" });
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  await expect(button("Start kamp")).toBeVisible({ timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await context.setOffline(true);

  await button("Start kamp").click();
  await page.clock.fastForward(15 * MIN);
  await button("Avslutt omgang").click();
  await expect(button("Start 2. omgang")).toBeVisible();
  expect(await storedLiveMatch(page)).toMatchObject({ phase: "half_time", status: "paused" });

  await page.clock.fastForward(10 * MIN);
  await button("Start 2. omgang").click();
  await expect(page.getByText("2. omgang", { exact: true })).toBeVisible();
  expect(await storedLiveMatch(page)).toMatchObject({ phase: "second_half", currentHalf: 2, status: "running" });

  await page.clock.fastForward(5 * MIN);
  await button("Pause").click();
  expect(await storedLiveMatch(page)).toMatchObject({ phase: "second_half", status: "paused" });
  await button("Fortsett").click();

  // Reload mid-half. The network is re-enabled for the reload because the app
  // cannot yet cold-start offline (no service worker; see FP-004 N-1). Only the
  // match state is under test here: it must come back from device storage.
  await context.setOffline(false);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("2. omgang", { exact: true })).toBeVisible({ timeout: 30_000 });
  await context.setOffline(true);
  expect(await storedLiveMatch(page)).toMatchObject({ phase: "second_half", status: "running" });

  await fastForwardAfterReload(page, 12 * MIN);
  await button("Avslutt omgang").click();
  await expect(page.getByText("Resultat, hendelser og spilletid er lagret på enheten.")).toBeVisible();
  const ended = await storedLiveMatch(page);
  expect(ended).toMatchObject({ phase: "full_time", status: "ended", currentHalf: 2 });
  const clock = ended?.clock as { startedAtMs: number; pausedAtMs: number; accumulatedPausedMs: number };
  // 15 + 5 + 12 played minutes; the 10-minute break is not counted. The
  // installed clock also advances with real time between steps.
  const playedMs = clock.pausedAtMs - clock.startedAtMs - clock.accumulatedPausedMs;
  expect(playedMs).toBeGreaterThanOrEqual(32 * MIN);
  expect(playedMs).toBeLessThan(33 * MIN);
  expect(errors).toEqual([]);
});
