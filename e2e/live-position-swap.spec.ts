import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

// FP-MS2.1-B1: two players on the pitch swap positions, by tap ("Bytt plass")
// and by drag (touch and mouse). Both paths must produce the same stored
// state, never a substitution event, never a change in minutes, and offer the
// same targeted 5 s undo. Bench substitutions must keep working.
// Seeds like live-sideline.spec.ts (guest team, active 7v7 setup, flag on).

type Theme = "light" | "dark";

const NAMES = [
  "Frida Berg", "Ida Ruud", "Selma Lie", "Vilde Moe", "Maja Dahl", "Nora Hagen", "Emma Hansen",
  "Thea Strand", "Ingrid Lund", "Sofie Bakke", "Mathilde Vik",
];
const LIVE_KEY = "fairplayr.liveMatch.v1";
/** Nothing in progress: idle, or (until A2's 4′ threshold) a suggestion. */
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
        id: "setup-e2e-swap",
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
}

/** The persisted live match (written on every change, offline too). */
async function stored(page: Page): Promise<StoredMatch> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), LIVE_KEY);
  const parsed = JSON.parse(raw!);
  return parsed.liveMatch as StoredMatch;
}

/** Everything a position swap must not touch, plus the slots it does change. */
function domain(match: StoredMatch) {
  return {
    liveSlotAssignments: match.liveSlotAssignments,
    onFieldPlayerIds: match.onFieldPlayerIds,
    benchPlayerIds: match.benchPlayerIds,
    playerAccumulatedMs: match.playerAccumulatedMs,
    onFieldStartedAtElapsedMs: match.onFieldStartedAtElapsedMs,
    events: match.events,
    teamScore: match.teamScore,
  };
}

const token = (page: Page, playerId: string) => page.locator(`[data-player-id="${playerId}"]`);
const strip = (page: Page) => page.getByTestId("live-strip");

/** Slot ids and minutes as shown on the pitch. */
async function pitchState(page: Page) {
  return page.locator("[data-player-id]").evaluateAll((tokens) =>
    Object.fromEntries(
      tokens.map((el) => [
        el.getAttribute("data-player-id"),
        { slot: el.getAttribute("data-slot-id"), minutes: el.lastElementChild?.lastElementChild?.textContent },
      ])
    )
  );
}

async function discCenter(locator: Locator) {
  const box = (await locator.locator(":scope > span").first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A real touch drag (touchstart → moves → touchend) through the DevTools protocol. */
type Point = { x: number; y: number };

/**
 * A real touch drag (touchstart → moves → touchend) through the DevTools
 * protocol, via each waypoint in turn. Without `release`, the finger stays down.
 */
async function touchDrag(page: Page, from: Point, ...waypoints: Point[]) {
  await touchHold(page, from, ...waypoints).then((release) => release());
}

async function touchHold(page: Page, from: Point, ...waypoints: Point[]) {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from.x, from.y) });
  let at = from;
  for (const to of waypoints) {
    const steps = 10;
    for (let step = 1; step <= steps; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: point(at.x + ((to.x - at.x) * step) / steps, at.y + ((to.y - at.y) * step) / steps),
      });
    }
    at = to;
  }
  return async () => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  };
}

async function mouseDrag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

/** Strip height and any strip line cut with an ellipsis (as in live-sideline.spec.ts). */
async function stripLayout(page: Page) {
  await page.waitForTimeout(300); // the 220ms strip transition
  return page.getByTestId("live-strip").evaluate((strip) => {
    const clipped = [...strip.querySelectorAll<HTMLElement>("small, b")].filter((line) => {
      const range = document.createRange();
      range.selectNodeContents(line);
      return range.getBoundingClientRect().width > line.getBoundingClientRect().width + 0.25;
    });
    return { height: Math.round(strip.getBoundingClientRect().height), cut: clipped.map((line) => line.textContent) };
  });
}

async function snap(page: Page, testInfo: TestInfo, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/live-position-swap/${testInfo.project.name}-${name}.png` });
}

for (const theme of ["light", "dark"] as const) {
  test(`tap and drag swap positions identically, without minutes or events changing (${theme})`, async ({ page }, testInfo) => {
    const errors = await openLive(page, theme);
    const before = await stored(page);
    const pitchBefore = await pitchState(page);
    // p3 stands in 7v7-3 and p6 in 7v7-6 (seeded in order).
    expect(pitchBefore.p3.slot).toBe("7v7-3");
    expect(pitchBefore.p6.slot).toBe("7v7-6");

    // ── Tap: select → "Bytt plass" → tap the other player.
    await token(page, "p3").click();
    await expect(strip(page)).toHaveAttribute("data-strip", "selection");
    const resting = await stripLayout(page);
    expect(resting.cut, "selection strip").toEqual([]);
    // "Bytt plass" leads; the compact ✕ cancel sits after it, at the 44px touch size.
    const swapButton = (await strip(page).getByRole("button", { name: "Bytt plass", exact: true }).boundingBox())!;
    const cancelIcon = (await strip(page).getByRole("button", { name: "Avbryt valget av Selma L", exact: true }).boundingBox())!;
    expect(cancelIcon.x).toBeGreaterThan(swapButton.x);
    expect([Math.round(cancelIcon.width), Math.round(cancelIcon.height)]).toEqual([44, 44]);
    await snap(page, testInfo, `${theme}-1-selected`);
    await strip(page).getByRole("button", { name: "Bytt plass" }).click();
    await expect(strip(page)).toHaveAttribute("data-strip", "positionSwap");
    // Every other pitch player is a valid target; the bench is not.
    await expect(page.locator('[data-player-id][data-target="true"]')).toHaveCount(6);
    await expect(token(page, "p3")).toHaveAttribute("data-target", "false");
    expect(await stripLayout(page), "position-swap strip").toEqual(resting);
    await snap(page, testInfo, `${theme}-2-choose-target`);
    await token(page, "p6").click();

    await expect(strip(page)).toHaveAttribute("data-strip", "positionUndo");
    await expect(strip(page)).toContainText("Byttet plass");
    const afterTap = await stored(page);
    const pitchAfterTap = await pitchState(page);
    expect(pitchAfterTap.p3).toEqual({ slot: "7v7-6", minutes: pitchBefore.p3.minutes });
    expect(pitchAfterTap.p6).toEqual({ slot: "7v7-3", minutes: pitchBefore.p6.minutes });
    expect(afterTap.liveSlotAssignments).toMatchObject({ "7v7-3": "p6", "7v7-6": "p3" });
    expect({ ...domain(afterTap), liveSlotAssignments: null }).toEqual({ ...domain(before), liveSlotAssignments: null });
    expect(afterTap.events.some((event) => event.type === "substitution")).toBe(false);
    expect(await stripLayout(page), "position-undo strip").toEqual(resting);
    await snap(page, testInfo, `${theme}-3-undo`);

    // ── Undo restores exactly the starting positions.
    await strip(page).getByRole("button", { name: /Angre plassbytte/ }).click();
    await expect(strip(page)).not.toHaveAttribute("data-strip", "positionUndo");
    expect(domain(await stored(page))).toEqual(domain(before));

    // ── Drag (real touch): the dragged player follows the finger, the target lights up.
    const from = await discCenter(token(page, "p3"));
    const to = await discCenter(token(page, "p6"));
    const release = await touchHold(page, from, to);
    await expect(strip(page)).toHaveAttribute("data-strip", "draggingPosition");
    await expect(page.getByTestId("live-ghost")).toBeVisible();
    const ghost = (await page.getByTestId("live-ghost").boundingBox())!;
    expect(Math.abs(ghost.x + ghost.width / 2 - to.x)).toBeLessThan(2);
    expect(Math.abs(ghost.y + ghost.height / 2 - to.y)).toBeLessThan(2);
    await expect(token(page, "p6")).toHaveAttribute("data-drop", "true");
    expect(await stripLayout(page), "dragging strip").toEqual(resting);
    await snap(page, testInfo, `${theme}-4-dragging`);
    await release();

    await expect(strip(page)).toHaveAttribute("data-strip", "positionUndo");
    const afterDrag = await stored(page);
    // Same domain operation: identical state to the tap path.
    expect(domain(afterDrag)).toEqual(domain(afterTap));
    expect(await pitchState(page)).toEqual(pitchAfterTap);
    // The release did not also select a player.
    await expect(page.locator('[data-player-id][aria-pressed="true"]')).toHaveCount(0);

    expect(errors).toEqual([]);
  });
}

test("a mouse drag swaps positions too", async ({ page }) => {
  await openLive(page);
  const before = await stored(page);
  await mouseDrag(page, await discCenter(token(page, "p2")), await discCenter(token(page, "p7")));
  await expect(strip(page)).toHaveAttribute("data-strip", "positionUndo");
  const after = await stored(page);
  expect(after.liveSlotAssignments).toMatchObject({ "7v7-2": "p7", "7v7-7": "p2" });
  expect({ ...domain(after), liveSlotAssignments: null }).toEqual({ ...domain(before), liveSlotAssignments: null });
});

test("an invalid or cancelled drag leaves the lineup unchanged and selects nobody", async ({ page }) => {
  await openLive(page);
  const before = domain(await stored(page));
  const p3 = await discCenter(token(page, "p3"));
  const pitch = (await page.getByRole("group", { name: "Banen" }).boundingBox())!;
  const tile = (await page.locator('[data-bench-player-id="p8"]').boundingBox())!;

  // A small jitter under the drag threshold is still a tap: it selects, then deselects.
  await touchDrag(page, p3, { x: p3.x + 5, y: p3.y + 4 });
  await expect(strip(page)).toHaveAttribute("data-strip", "selection");
  await touchDrag(page, p3, { x: p3.x - 4, y: p3.y + 5 });
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
  expect(domain(await stored(page))).toEqual(before);

  const targets = {
    // Empty grass at the left touchline, level with the halfway line.
    grass: { x: pitch.x + 14, y: pitch.y + pitch.height / 2 },
    // A bench tile: pitch → bench is not a substitution path.
    bench: { x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 },
  };
  for (const [name, target] of Object.entries(targets)) {
    await touchDrag(page, p3, target);
    await expect(strip(page), name).toHaveAttribute("data-strip", RESTING);
    await expect(page.locator('[data-player-id][aria-pressed="true"]'), name).toHaveCount(0);
    expect(domain(await stored(page)), name).toEqual(before);
  }

  // Dragged away and brought back to its own slot.
  await touchDrag(page, p3, { x: p3.x + 60, y: p3.y + 40 }, p3);
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
  expect(domain(await stored(page))).toEqual(before);

  // The same with a mouse.
  await mouseDrag(page, p3, targets.grass);
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
  expect(domain(await stored(page))).toEqual(before);
});

test("swapping with the keeper moves the keeper badge; undo moves it back", async ({ page }, testInfo) => {
  await openLive(page);
  const before = domain(await stored(page));
  await expect(token(page, "p1")).toHaveAttribute("aria-label", /keeper/);

  await touchDrag(page, await discCenter(token(page, "p4")), await discCenter(token(page, "p1")));
  await expect(strip(page)).toHaveAttribute("data-strip", "positionUndo");
  await expect(token(page, "p4")).toHaveAttribute("aria-label", /keeper/);
  await expect(token(page, "p1")).not.toHaveAttribute("aria-label", /keeper/);
  await expect(token(page, "p4")).toHaveAttribute("data-slot-id", "7v7-1");
  await snap(page, testInfo, "keeper-swap");

  await strip(page).getByRole("button", { name: /Angre plassbytte/ }).click();
  await expect(token(page, "p1")).toHaveAttribute("aria-label", /keeper/);
  expect(domain(await stored(page))).toEqual(before);

  // Tap path into the keeper slot.
  await token(page, "p5").click();
  await strip(page).getByRole("button", { name: "Bytt plass" }).click();
  await token(page, "p1").click();
  await expect(token(page, "p5")).toHaveAttribute("data-slot-id", "7v7-1");
  await expect(token(page, "p5")).toHaveAttribute("aria-label", /keeper/);
});

test("undo reverses only the swap, not a goal scored inside the undo window", async ({ page }) => {
  await openLive(page);
  const before = domain(await stored(page));
  await token(page, "p2").click();
  await strip(page).getByRole("button", { name: "Bytt plass" }).click();
  await token(page, "p5").click();
  await expect(strip(page)).toHaveAttribute("data-strip", "positionUndo");

  await page.getByRole("button", { name: "Mål for oss", exact: true }).click();
  await expect(page.getByTestId("live-score")).toHaveAttribute("aria-label", "Stilling: oss 1, dem 0");
  await strip(page).getByRole("button", { name: /Angre plassbytte/ }).click();

  const after = await stored(page);
  expect(after.liveSlotAssignments).toEqual(before.liveSlotAssignments);
  expect(after.teamScore).toBe(1);
  expect(after.events.filter((event) => event.type === "goal")).toHaveLength(1);
  await expect(page.getByTestId("live-score")).toHaveAttribute("aria-label", "Stilling: oss 1, dem 0");
});

test("cancelling a tap swap, and the undo window expiring, keep the right lineup", async ({ page }) => {
  await openLive(page);
  const before = domain(await stored(page));

  // Selection → the compact ✕ cancels, with the player named in its label.
  await token(page, "p3").click();
  await expect(strip(page)).toHaveAttribute("data-strip", "selection");
  await strip(page).getByRole("button", { name: "Avbryt valget av Selma L", exact: true }).click();
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
  await expect(page.locator('[data-player-id][aria-pressed="true"]')).toHaveCount(0);

  // "Bytt plass" → Avbryt: nothing changes.
  await token(page, "p3").click();
  await strip(page).getByRole("button", { name: "Bytt plass" }).click();
  await strip(page).getByRole("button", { name: "Avbryt" }).click();
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
  // Tapping the bench while choosing a position does not substitute.
  await token(page, "p3").click();
  await strip(page).getByRole("button", { name: "Bytt plass" }).click();
  await page.locator('[data-bench-player-id="p8"]').click();
  await expect(strip(page)).toHaveAttribute("data-strip", "positionSwap");
  // Tapping the source again leaves the swap.
  await token(page, "p3").click();
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);
  expect(domain(await stored(page))).toEqual(before);

  // The swap stays once the 5 s window has passed.
  await token(page, "p3").click();
  await strip(page).getByRole("button", { name: "Bytt plass" }).click();
  await token(page, "p4").click();
  await page.clock.fastForward("00:06");
  await expect(strip(page)).not.toHaveAttribute("data-strip", "positionUndo");
  expect((await stored(page)).liveSlotAssignments).toMatchObject({ "7v7-3": "p4", "7v7-4": "p3" });
});

test("works offline and is stored on the device", async ({ page, context }) => {
  await openLive(page);
  await context.setOffline(true);
  await touchDrag(page, await discCenter(token(page, "p2")), await discCenter(token(page, "p3")));
  await expect(strip(page)).toHaveAttribute("data-strip", "positionUndo");
  expect((await stored(page)).liveSlotAssignments).toMatchObject({ "7v7-2": "p3", "7v7-3": "p2" });
  await context.setOffline(false);
});

test("bench substitutions still work by tap and by drag after a position swap", async ({ page }) => {
  await openLive(page);
  await touchDrag(page, await discCenter(token(page, "p2")), await discCenter(token(page, "p3")));
  await expect(strip(page)).toHaveAttribute("data-strip", "positionUndo");
  await page.clock.fastForward("00:06");
  await expect(strip(page)).toHaveAttribute("data-strip", RESTING);

  // Tap: field → bench. p2 now stands in 7v7-3, and p8 takes that slot.
  await token(page, "p2").click();
  await page.locator('[data-bench-player-id="p8"]').click();
  await expect(strip(page)).toHaveAttribute("data-strip", "undo");
  let match = await stored(page);
  expect(match.liveSlotAssignments["7v7-3"]).toBe("p8");
  expect(match.events.filter((event) => event.type === "substitution")).toHaveLength(1);
  await page.clock.fastForward("00:06");

  // Drag: bench → pitch onto p3 (now in 7v7-2).
  const tile = (await page.locator('[data-bench-player-id="p9"]').boundingBox())!;
  await touchDrag(page, { x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 }, await discCenter(token(page, "p3")));
  await expect(strip(page)).toHaveAttribute("data-strip", "undo");
  match = await stored(page);
  expect(match.liveSlotAssignments["7v7-2"]).toBe("p9");
  expect(match.benchPlayerIds).toContain("p3");
  expect(match.events.filter((event) => event.type === "substitution")).toHaveLength(2);
});
