import { expect, test, type Locator, type Page } from "@playwright/test";

// FP-MS2.1-B1-F1: substitution undo reverses only the substitution. A goal,
// a pause or half-time made inside the 5 s window must survive it, by tap and
// by drag alike, online and offline.
// Seeds like live-position-swap.spec.ts (guest team, active 7v7 setup, flag on).

type Theme = "light" | "dark";

const NAMES = [
  "Frida Berg", "Ida Ruud", "Selma Lie", "Vilde Moe", "Maja Dahl", "Nora Hagen", "Emma Hansen",
  "Thea Strand", "Ingrid Lund", "Sofie Bakke", "Mathilde Vik",
];
const LIVE_KEY = "fairplayr.liveMatch.v1";
const RESTING = /^(idle|suggestion)$/;

function seed() {
  const now = "2026-10-14T10:00:00.000Z";
  const players = NAMES.map((name, index) => ({
    id: `p${index + 1}`,
    name,
    number: index + 1,
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: now,
    updatedAt: now,
  }));
  const ids = players.map((player) => player.id);
  const starters = ids.slice(0, 7);
  return {
    workspace: {
      version: 2,
      teams: [{ id: "team-e2e", name: "Lyn G12", players, createdAt: now, updatedAt: now }],
      activeTeamId: "team-e2e",
    },
    setup: {
      version: 2,
      status: "active",
      serverMatchId: null,
      config: {
        id: "setup-e2e-sub-undo",
        teamId: "team-e2e",
        format: "7v7",
        reportEnabled: false,
        formationId: "7v7-2-3-1",
        duration: { mode: "preset", presetId: "2x20", halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
        selectedPlayerIds: ids,
        startingPlayerIds: starters,
        slotAssignments: Object.fromEntries(starters.map((id, index) => [`7v7-${index + 1}`, id])),
        createdAt: now,
        updatedAt: now,
      },
    },
  };
}

async function openLive(page: Page, theme: Theme = "light") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-14T10:00:00.000Z") });
  await page.addInitScript(
    ({ data, theme }) => {
      if (sessionStorage.getItem("fp-e2e-seeded")) return;
      sessionStorage.setItem("fp-e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem("theme", theme);
      localStorage.setItem("fairplayr.liveUi", "sideline");
      localStorage.setItem("fairplayr.teams.v2", JSON.stringify(data.workspace));
      localStorage.setItem("fairplayr.matchSetup.v1", JSON.stringify(data.setup));
    },
    { data: seed(), theme }
  );
  await page.goto("/no/match/live", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

  // Kick off and play 6 minutes, so everyone has minutes and a running stint.
  await page.getByRole("button", { name: "Avspark", exact: true }).click();
  await page.clock.fastForward("06:00");
  return errors;
}

interface StoredMatch {
  liveSlotAssignments: Record<string, string | null>;
  onFieldPlayerIds: string[];
  benchPlayerIds: string[];
  playerAccumulatedMs: Record<string, number>;
  onFieldStartedAtElapsedMs: Record<string, number | null>;
  events: { type: string }[];
  teamScore: number;
  status: string;
  phase: string;
}

/** The persisted live match (written on every change, offline too). */
async function stored(page: Page): Promise<StoredMatch> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), LIVE_KEY);
  return (JSON.parse(raw!) as { liveMatch: StoredMatch }).liveMatch;
}

/** What a substitution and its undo change. */
function lineup(match: StoredMatch) {
  return {
    liveSlotAssignments: match.liveSlotAssignments,
    onFieldPlayerIds: match.onFieldPlayerIds,
    benchPlayerIds: match.benchPlayerIds,
    playerAccumulatedMs: match.playerAccumulatedMs,
    onFieldStartedAtElapsedMs: match.onFieldStartedAtElapsedMs,
  };
}

const token = (page: Page, playerId: string) => page.locator(`[data-player-id="${playerId}"]`);
const benchTile = (page: Page, playerId: string) => page.locator(`[data-bench-player-id="${playerId}"]`);
const strip = (page: Page) => page.getByTestId("live-strip");
const undoButton = (page: Page) => strip(page).getByRole("button", { name: /Angre bytte/ });

type Point = { x: number; y: number };

async function center(locator: Locator): Promise<Point> {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A real touch drag (touchstart → moves → touchend) through the DevTools protocol. */
async function touchDrag(page: Page, from: Point, to: Point) {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from.x, from.y) });
  const steps = 10;
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: point(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps),
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function substitute(page: Page, how: "tap" | "drag", out: string, incoming: string) {
  if (how === "tap") {
    await token(page, out).click();
    await benchTile(page, incoming).click();
  } else {
    await touchDrag(page, await center(benchTile(page, incoming)), await center(token(page, out).locator(":scope > span").first()));
  }
  await expect(strip(page)).toHaveAttribute("data-strip", "undo");
}

for (const theme of ["light", "dark"] as const) {
  test(`undo reverses only the substitution, not a goal scored inside the window (${theme})`, async ({ page }) => {
    const errors = await openLive(page, theme);
    const before = lineup(await stored(page));

    await substitute(page, "tap", "p2", "p8");
    expect((await stored(page)).onFieldPlayerIds).toContain("p8");

    await page.getByRole("button", { name: "Mål for oss", exact: true }).click();
    await expect(page.getByTestId("live-score")).toHaveAttribute("aria-label", "Stilling: oss 1, dem 0");
    await undoButton(page).click();
    await expect(strip(page)).toHaveAttribute("data-strip", RESTING);

    const after = await stored(page);
    expect(lineup(after)).toEqual(before);
    expect(after.teamScore).toBe(1);
    expect(after.events.filter((event) => event.type === "goal")).toHaveLength(1);
    expect(after.events.some((event) => event.type === "substitution")).toBe(false);
    await expect(page.getByTestId("live-score")).toHaveAttribute("aria-label", "Stilling: oss 1, dem 0");
    await expect(token(page, "p2")).toHaveAttribute("data-slot-id", "7v7-2");
    expect(errors).toEqual([]);
  });
}

test("a drag substitution undoes the same way and keeps a pause made inside the window", async ({ page }) => {
  await openLive(page);
  const before = lineup(await stored(page));

  await substitute(page, "drag", "p3", "p9");
  expect((await stored(page)).liveSlotAssignments["7v7-3"]).toBe("p9");

  await page.getByTestId("live-clock").click();
  await expect.poll(async () => (await stored(page)).status).toBe("paused");
  await undoButton(page).click();
  await expect(strip(page)).not.toHaveAttribute("data-strip", "undo");

  const after = await stored(page);
  expect(lineup(after)).toEqual(before);
  expect(after.status).toBe("paused");
  expect(after.events.some((event) => event.type === "substitution")).toBe(false);
});

test("half-time ended inside the window survives the undo", async ({ page }) => {
  await openLive(page);
  const before = lineup(await stored(page));

  await substitute(page, "tap", "p4", "p8");
  await page.getByRole("button", { name: "Kampmeny" }).click();
  await page.getByRole("button", { name: "Avslutt omgang" }).click();
  await page.getByRole("button", { name: "Ja, avslutt omgangen" }).click();
  await expect.poll(async () => (await stored(page)).phase).toBe("half_time");

  await undoButton(page).click();
  await expect.poll(async () => (await stored(page)).onFieldPlayerIds).toEqual(before.onFieldPlayerIds);
  const after = await stored(page);
  expect(lineup(after)).toEqual(before);
  expect(after.phase).toBe("half_time");
  expect(after.status).toBe("paused");
});

test("works offline, and the substitution stays once the window has passed", async ({ page, context }) => {
  await openLive(page);
  await context.setOffline(true);
  const before = lineup(await stored(page));

  await substitute(page, "tap", "p2", "p8");
  await page.getByRole("button", { name: "Mål for oss", exact: true }).click();
  await undoButton(page).click();
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
  let match = await stored(page);
  expect(lineup(match)).toEqual(before);
  expect(match.teamScore).toBe(1);

  // A new substitution after the undo, left alone past the 5 s window.
  await substitute(page, "tap", "p5", "p9");
  await page.clock.fastForward("00:06");
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
  await expect(undoButton(page)).toHaveCount(0);
  match = await stored(page);
  expect(match.onFieldPlayerIds).toContain("p9");
  expect(match.events.filter((event) => event.type === "substitution")).toHaveLength(1);
  await context.setOffline(false);
});
