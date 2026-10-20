import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";

// FP-MS2.1-B3 (DESIGN.md D3): consecutive substitutions without waiting.
// Starting a new substitution inside the 5 s undo window confirms the
// previous one at once; the first touch of the new one is never lost; only
// the most recent change can be undone, with its own 5 s window. Tap and drag
// in every order, a goal in between, position swaps, a scrolled 15-sub rail
// (whose swipe must not confirm the undo) and offline. All input is real
// touch through Chromium's gesture pipeline (CDP), not synthetic DOM events.

type Theme = "light" | "dark";

const FIELD = ["Frida Berg", "Ida Ruud", "Selma Lie", "Vilde Moe", "Maja Dahl", "Nora Hagen", "Emma Hansen"];
const BENCH = [
  "Thea Strand", "Ingrid Lund", "Sofie Bakke", "Mathilde Vik", "Marie-Louise Berg", "Emma Haugen",
  "Henriette Solberg", "Mathilde Karlsen", "Kristiane Johannessen", "Ingeborg Nilsen", "Aurora Sand", "Tiril Holm",
  "Live Brekke", "Anne-Kathrine Lie", "Sofie Berg",
];
const LIVE_KEY = "fairplayr.liveMatch.v1";
const RESTING = /^(idle|suggestion)$/;

function seed(subs: number) {
  const now = "2026-10-14T10:00:00.000Z";
  const players = [...FIELD, ...BENCH.slice(0, subs)].map((name, index) => ({
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
        id: `setup-e2e-consecutive-${subs}`,
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

/** Seed, open the live screen, kick off and play 6 minutes. */
async function openLive(page: Page, subs: number, theme: Theme = "light") {
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
    { data: seed(subs), theme }
  );
  await page.goto("/no/match/live", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
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
  events: { type: string; outPlayerId?: string; inPlayerId?: string }[];
  teamScore: number;
  opponentScore: number;
}

async function stored(page: Page): Promise<StoredMatch> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), LIVE_KEY);
  return (JSON.parse(raw!) as { liveMatch: StoredMatch }).liveMatch;
}

/** Substitution events as "out>in", in order. */
const subs = async (page: Page) =>
  (await stored(page)).events
    .filter((event) => event.type === "substitution")
    .map((event) => `${event.outPlayerId}>${event.inPlayerId}`);

const token = (page: Page, playerId: string) => page.locator(`[data-player-id="${playerId}"]`);
const disc = (page: Page, playerId: string) => token(page, playerId).locator(":scope > span").first();
const tile = (page: Page, playerId: string) => page.locator(`[data-bench-player-id="${playerId}"]`);
const bench = (page: Page) => page.getByTestId("live-bench");
const strip = (page: Page) => page.getByTestId("live-strip");
const undoButton = (page: Page) => strip(page).getByRole("button", { name: /Angre bytte/ });

type Point = { x: number; y: number };

async function center(locator: Locator): Promise<Point> {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A real touch tap at the centre of an element. */
async function touchTap(page: Page, locator: Locator) {
  const { x, y } = await center(locator);
  await page.touchscreen.tap(x, y);
}

/** A real touch gesture (touchStart → moves → touchEnd). */
async function touchMove(page: Page, cdp: CDPSession, from: Point, to: Point, steps = 12) {
  const point = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from.x, from.y) });
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: point(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps),
    });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(120);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
}

async function tapSub(page: Page, out: string, incoming: string) {
  await touchTap(page, disc(page, out));
  await expect(strip(page)).toHaveAttribute("data-strip", "selection");
  await tile(page, incoming).scrollIntoViewIfNeeded();
  await touchTap(page, tile(page, incoming));
  await expect(strip(page)).toHaveAttribute("data-strip", "undo");
}

async function dragSub(page: Page, cdp: CDPSession, out: string, incoming: string) {
  await tile(page, incoming).scrollIntoViewIfNeeded();
  await touchMove(page, cdp, await center(tile(page, incoming)), await center(disc(page, out)));
  await expect(strip(page)).toHaveAttribute("data-strip", "undo");
}

/** Bench ids in visual order (column-major: by x, then y). */
function shownOrder(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="live-bench"] [data-bench-player-id]')]
      .map((el) => ({ id: el.dataset.benchPlayerId!, r: el.getBoundingClientRect() }))
      .sort((a, b) => a.r.left - b.r.left || a.r.top - b.r.top)
      .map((entry) => entry.id)
  );
}

const scrollLeft = (page: Page) => bench(page).evaluate((el) => el.scrollLeft);

for (const theme of ["light", "dark"] as const) {
  test(`tap and drag substitutions back to back, in every order, without waiting (${theme})`, async ({ page }) => {
    const errors = await openLive(page, 4, theme);
    const cdp = await page.context().newCDPSession(page);

    // Tap → immediate tap. No clock time passes: the window is wide open.
    await tapSub(page, "p2", "p8");
    await tapSub(page, "p3", "p9");
    expect(await subs(page)).toEqual(["p2>p8", "p3>p9"]);

    // Tap → immediate drag.
    await dragSub(page, cdp, "p4", "p10");
    // Drag → immediate drag.
    await dragSub(page, cdp, "p5", "p11");
    // Drag → immediate tap.
    await tapSub(page, "p6", "p2");
    expect(await subs(page)).toEqual(["p2>p8", "p3>p9", "p4>p10", "p5>p11", "p6>p2"]);

    const match = await stored(page);
    expect(match.onFieldPlayerIds.sort()).toEqual(["p1", "p10", "p11", "p2", "p7", "p8", "p9"].sort());
    expect(match.liveSlotAssignments).toMatchObject({
      "7v7-2": "p8",
      "7v7-3": "p9",
      "7v7-4": "p10",
      "7v7-5": "p11",
      "7v7-6": "p2",
    });

    // The last one has a full window of its own, and only it is undone.
    await page.clock.fastForward(4000);
    await expect(undoButton(page)).toBeVisible();
    await undoButton(page).click();
    await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
    expect(await subs(page)).toEqual(["p2>p8", "p3>p9", "p4>p10", "p5>p11"]);
    expect((await stored(page)).liveSlotAssignments["7v7-6"]).toBe("p6");
    await expect(undoButton(page)).toHaveCount(0);
    await cdp.detach();
    expect(errors).toEqual([]);
  });
}

test("a new selection leaves the old undo at once; undoing the second keeps the first and a goal between", async ({
  page,
}) => {
  await openLive(page, 4);
  await tapSub(page, "p2", "p8");
  const afterFirst = await stored(page);

  await page.getByRole("button", { name: "Mål for oss", exact: true }).click();
  await expect(page.getByTestId("live-score")).toHaveAttribute("aria-label", "Stilling: oss 1, dem 0");
  await expect(strip(page)).toHaveAttribute("data-strip", "undo");

  // The tap on a pitch player both confirms and selects.
  await touchTap(page, disc(page, "p3"));
  await expect(strip(page)).toHaveAttribute("data-strip", "selection");
  await expect(undoButton(page)).toHaveCount(0);
  await touchTap(page, tile(page, "p9"));
  await expect(strip(page)).toHaveAttribute("data-strip", "undo");

  await undoButton(page).click();
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
  const after = await stored(page);
  expect(after.liveSlotAssignments).toEqual(afterFirst.liveSlotAssignments);
  expect(after.onFieldPlayerIds).toEqual(afterFirst.onFieldPlayerIds);
  expect(after.playerAccumulatedMs).toEqual(afterFirst.playerAccumulatedMs);
  expect(after.onFieldStartedAtElapsedMs).toEqual(afterFirst.onFieldStartedAtElapsedMs);
  expect(await subs(page)).toEqual(["p2>p8"]);
  expect(after.teamScore).toBe(1);
  expect(after.events.filter((event) => event.type === "goal")).toHaveLength(1);
});

test("position swaps and substitutions follow each other without waiting", async ({ page }) => {
  await openLive(page, 4);
  const cdp = await page.context().newCDPSession(page);
  const slotOf = (id: string) => token(page, id).getAttribute("data-slot-id");

  // Substitution → immediate "Bytt plass" swap → its own undo reverses only the swap.
  await tapSub(page, "p2", "p8");
  const [s3, s4] = [await slotOf("p3"), await slotOf("p4")];
  await touchTap(page, disc(page, "p3"));
  await strip(page).getByRole("button", { name: "Bytt plass" }).click();
  await touchTap(page, disc(page, "p4"));
  await expect(strip(page)).toHaveAttribute("data-strip", "positionUndo");
  expect([await slotOf("p3"), await slotOf("p4")]).toEqual([s4, s3]);
  await strip(page).getByRole("button", { name: /Angre plassbytte/ }).click();
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
  expect([await slotOf("p3"), await slotOf("p4")]).toEqual([s3, s4]);
  expect(await subs(page)).toEqual(["p2>p8"]);

  // Substitution → immediate field drag swap; then a substitution right after the swap.
  await tapSub(page, "p5", "p9");
  const [s6, s7] = [await slotOf("p6"), await slotOf("p7")];
  await touchMove(page, cdp, await center(disc(page, "p6")), await center(disc(page, "p7")));
  await expect(strip(page)).toHaveAttribute("data-strip", "positionUndo");
  expect([await slotOf("p6"), await slotOf("p7")]).toEqual([s7, s6]);
  await dragSub(page, cdp, "p6", "p10");
  expect(await subs(page)).toEqual(["p2>p8", "p5>p9", "p6>p10"]);
  // The swap was confirmed: p10 stands where p6 had moved to.
  expect(await slotOf("p10")).toBe(s7);

  // Cancelling a selection inside the window keeps the window (background tap).
  const pitch = page.getByRole("group").filter({ has: token(page, "p1") });
  await pitch.click({ position: { x: 6, y: 6 } });
  await expect(strip(page)).toHaveAttribute("data-strip", "undo");
  await cdp.detach();
});

test("15 substitutes on a scrolled rail: the order holds, a swipe never confirms the undo, re-sorts once after", async ({
  page,
}) => {
  const errors = await openLive(page, 15);
  const cdp = await page.context().newCDPSession(page);
  const initial = await shownOrder(page);

  // Scroll to the end of the rail and substitute the last tile by tap.
  await page.getByTestId("bench-jump-end").click();
  await expect.poll(() => scrollLeft(page)).toBeGreaterThan(0);
  const last = initial.at(-1)!;
  await tapSub(page, "p2", last);
  const scrolled = await scrollLeft(page);
  expect(scrolled).toBeGreaterThan(0);
  expect(await shownOrder(page)).toEqual([...initial.slice(0, -1), "p2"]);

  // A sideways swipe on the rail inside the window: it scrolls, the undo stays.
  const box = (await bench(page).boundingBox())!;
  await touchMove(page, cdp, { x: box.x + box.width * 0.3, y: box.y + 20 }, { x: box.x + box.width * 0.3 + 140, y: box.y + 20 });
  await expect(strip(page)).toHaveAttribute("data-strip", "undo");
  expect(await scrollLeft(page)).toBeLessThan(scrolled);
  expect(await subs(page)).toEqual([`p2>${last}`]);

  // Immediate second substitution, by tap, from the middle of the rail.
  const middle = initial[Math.floor(initial.length / 2)];
  await tapSub(page, "p3", middle);
  expect(await shownOrder(page)).toEqual(
    [...initial.slice(0, -1), "p2"].map((id) => (id === middle ? "p3" : id))
  );

  // Immediate third, by drag from the rail.
  const third = initial[1];
  await dragSub(page, cdp, "p4", third);
  const held = [...initial.slice(0, -1), "p2"].map((id) => (id === middle ? "p3" : id === third ? "p4" : id));
  expect(await shownOrder(page)).toEqual(held);
  expect(await subs(page)).toEqual([`p2>${last}`, `p3>${middle}`, `p4>${third}`]);

  // Window over: one re-sort, least-played first (the three who came off have 6′).
  await page.clock.fastForward(6000);
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
  // Back at the start. Bench treats ≤ 1px as the start (no fade, no "‹ N"):
  // with fractional tile widths, scroll snapping can leave 1px (FP follow-up).
  await expect.poll(() => scrollLeft(page)).toBeLessThanOrEqual(1);
  const resorted = await shownOrder(page);
  expect(resorted.slice(-3).sort()).toEqual(["p2", "p3", "p4"]);
  await cdp.detach();
  expect(errors).toEqual([]);
});

/** A real mouse drag (pointerdown → moves → pointerup) through Chromium's input pipeline. */
async function mouseDrag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

test("the stray click after a mouse drag never confirms the undo that drag opened", async ({ page }) => {
  const errors = await openLive(page, 4);

  // Bench → pitch by mouse. The browser's click after the release lands on
  // the pitch or bench; it must not count as a new selection.
  await tile(page, "p8").scrollIntoViewIfNeeded();
  await mouseDrag(page, await center(tile(page, "p8")), await center(disc(page, "p2")));
  await expect(strip(page)).toHaveAttribute("data-strip", "undo");
  await page.waitForTimeout(150);
  await expect(strip(page)).toHaveAttribute("data-strip", "undo");
  await undoButton(page).click();
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
  expect(await subs(page)).toEqual([]);

  // Pitch → pitch by mouse (position swap): its own undo stays open too.
  await mouseDrag(page, await center(disc(page, "p3")), await center(disc(page, "p4")));
  await expect(strip(page)).toHaveAttribute("data-strip", "positionUndo");
  await page.waitForTimeout(150);
  await expect(strip(page)).toHaveAttribute("data-strip", "positionUndo");
  await strip(page).getByRole("button", { name: /Angre plassbytte/ }).click();
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);

  // The guard is short: a deliberate click right after still selects, and
  // consecutive mouse drags still substitute without waiting.
  await mouseDrag(page, await center(tile(page, "p9")), await center(disc(page, "p5")));
  await expect(strip(page)).toHaveAttribute("data-strip", "undo");
  await page.waitForTimeout(500);
  await disc(page, "p6").click();
  await expect(strip(page)).toHaveAttribute("data-strip", "selection");
  await tile(page, "p10").click();
  await expect(strip(page)).toHaveAttribute("data-strip", "undo");
  expect(await subs(page)).toEqual(["p5>p9", "p6>p10"]);
  expect(errors).toEqual([]);
});

test("works offline: consecutive substitutions persist locally and the last can be undone", async ({ page, context }) => {
  await openLive(page, 4);
  await context.setOffline(true);
  const cdp = await page.context().newCDPSession(page);

  await tapSub(page, "p2", "p8");
  await dragSub(page, cdp, "p3", "p9");
  await tapSub(page, "p4", "p10");
  expect(await subs(page)).toEqual(["p2>p8", "p3>p9", "p4>p10"]);
  await undoButton(page).click();
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
  expect(await subs(page)).toEqual(["p2>p8", "p3>p9"]);
  // Persisted on the device: both confirmed substitutions, by id.
  const match = await stored(page);
  expect(match.liveSlotAssignments).toMatchObject({ "7v7-2": "p8", "7v7-3": "p9", "7v7-4": "p4" });
  expect(match.benchPlayerIds).toEqual(expect.arrayContaining(["p2", "p3", "p10"]));
  await cdp.detach();
  await context.setOffline(false);
});
