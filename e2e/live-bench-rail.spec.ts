import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";

// FP-MS2.1-B2: the adaptive substitute bench (approved Alternative C).
// Sorted least-played first, one row → two (three on tall phones) → a
// horizontal rail; names never cut; "+N ›" / "‹ N" jump to the ends; a
// sideways touch swipe scrolls the rail and never drags or drops the pitch
// selection; an upward drag and a tap still substitute, by player id; the
// order holds through selection and undo and re-sorts once afterwards.
// Runs on every project viewport (360×640, 375×667, 390×844) plus 402×750
// (below), in light and dark. Touch goes through Chromium's real gesture
// pipeline (CDP), not synthetic DOM events.

type Theme = "light" | "dark";

const FIELD = ["Ida Ruud", "Selma Lie", "Nora Hagen", "Thea Strand", "Vilde Moe", "Maja Dahl", "Sofie Bakke"];
// Long, hyphenated and near-duplicate names (Mathilde K ×2, Emma H ×3,
// Thea S/Thea Strand, Sofie B/Sofie Bakke), in squad order.
const BENCH = [
  "Mathilde Kristiansen", "Marie-Louise Berg", "Emma Hansen", "Emma Haugen", "Henriette Solberg",
  "Mathilde Karlsen", "Kristiane Johannessen", "Ingeborg Nilsen", "Aurora Sand", "Tiril Holm", "Live Brekke",
  "Anne-Kathrine Lie", "Emma Holm", "Sofie Berg", "Thea Sand",
];
const LIVE_KEY = "fairplayr.liveMatch.v1";

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
        id: `setup-e2e-bench-${subs}`,
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

const token = (page: Page, playerId: string) => page.locator(`[data-player-id="${playerId}"]`);
const tile = (page: Page, playerId: string) => page.locator(`[data-bench-player-id="${playerId}"]`);
const bench = (page: Page) => page.getByTestId("live-bench");
const strip = (page: Page) => page.getByTestId("live-strip");
const jumpEnd = (page: Page) => page.getByTestId("bench-jump-end");
const jumpStart = (page: Page) => page.getByTestId("bench-jump-start");

/**
 * Fast-forwards the fake clock and makes sure page time stays there.
 *
 * A fastForward while the clock flows can overlap one of Playwright's own
 * real-time runs; when that run finishes after the jump it writes its older
 * time back, so page time moves backwards by the jumped amount and every timer
 * and animation frame scheduled since sits that far in the future. Seen in two
 * failed runs (the match clock froze and the rail's "+N ›" cue was never
 * re-measured although the rail was at its end) and in an isolated probe:
 * 54 of 300 two-minute jumps rewound, 0 of 300 with this repair. A rewind
 * comes only from a run already in flight at the jump, which finishes within
 * the short wait; any shortfall is then jumped again, relative to page time.
 *
 * The jump counts only once two consecutive readings are at or past the target
 * and the second is not below the first. Every repair is recorded as a
 * `clock-rewind` annotation on the test, and after MAX_CLOCK_REPAIRS the test
 * fails with every reading taken, so a broken clock is reported, not hidden.
 */
const MAX_CLOCK_REPAIRS = 5;

async function advanceClock(page: Page, by: number | string) {
  const ms = typeof by === "number" ? by : by.split(":").reduce((total, part) => total * 60 + Number(part), 0) * 1000;
  const pageNow = () => page.evaluate(() => Date.now());
  const start = await pageNow();
  const target = start + ms;
  const readings: number[] = [];
  await page.clock.fastForward(ms);
  for (let repairs = 0; ; repairs += 1) {
    await page.waitForTimeout(50);
    const first = await pageNow();
    await page.waitForTimeout(50);
    const second = await pageNow();
    readings.push(first, second);
    if (first >= target && second >= first) {
      if (repairs > 0) {
        test.info().annotations.push({
          type: "clock-rewind",
          description: `fastForward(${ms}) needed ${repairs} repair(s); page time after start (ms): ${readings.map((r) => r - start).join(", ")}`,
        });
      }
      return;
    }
    if (repairs === MAX_CLOCK_REPAIRS) {
      throw new Error(
        `fake clock did not hold fastForward(${ms}) after ${MAX_CLOCK_REPAIRS} repairs; ` +
          `page time after start (ms): ${readings.map((r) => r - start).join(", ")}`,
      );
    }
    const latest = Math.min(first, second);
    if (latest < target) await page.clock.fastForward(target - latest);
  }
}

/**
 * Kick off; with two or more subs, p1 comes off at 4′ and p2 at 8′, so the
 * bench has 0′ ties, a 4′ and an 8′ player. Ends idle at 10:00.
 */
async function openLive(page: Page, subs: number, theme: Theme) {
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

  if (subs >= 2) {
    for (const [out, incoming] of [
      ["p1", "p8"],
      ["p2", "p9"],
    ]) {
      await advanceClock(page, "04:00");
      await token(page, out).click();
      await tile(page, incoming).click();
      await expect(strip(page)).toHaveAttribute("data-strip", "undo");
      await advanceClock(page, 6000);
      await expect(strip(page)).not.toHaveAttribute("data-strip", "undo");
    }
  }
  await advanceClock(page, "02:00");
  return errors;
}

interface StoredMatch {
  onFieldPlayerIds: string[];
  benchPlayerIds: string[];
  events: { type: string }[];
}

async function stored(page: Page): Promise<StoredMatch> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), LIVE_KEY);
  return (JSON.parse(raw!) as { liveMatch: StoredMatch }).liveMatch;
}

const subCount = async (page: Page) => (await stored(page)).events.filter((event) => event.type === "substitution").length;

/** Bench ids in visual order (column-major: by x, then y). */
function shownOrder(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="live-bench"] [data-bench-player-id]')]
      .map((el) => ({ id: el.dataset.benchPlayerId!, r: el.getBoundingClientRect() }))
      .sort((a, b) => a.r.left - b.r.left || a.r.top - b.r.top)
      .map((entry) => entry.id)
  );
}

/**
 * The rail's cues ("+N ›" / "‹ N") are re-measured in a requestAnimationFrame
 * after a scroll, and this spec's fake clock fakes requestAnimationFrame too.
 * Run the frame explicitly instead of waiting for the clock's real-time flow.
 */
const runFrames = (page: Page) => page.clock.runFor(100);
const scrollLeft = (page: Page) => bench(page).evaluate((el) => el.scrollLeft);
const maxScroll = (page: Page) => bench(page).evaluate((el) => el.scrollWidth - el.clientWidth);

/** Fully on screen horizontally inside the rail, clear of the 28px edge fades. */
function fullyVisible(page: Page, playerId: string) {
  return page.evaluate((id) => {
    const rail = document.querySelector<HTMLElement>('[data-testid="live-bench"]')!;
    const el = rail.querySelector<HTMLElement>(`[data-bench-player-id="${id}"]`)!;
    const box = rail.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
    const left = box.left + (rail.scrollLeft > 1 ? 28 : 0);
    const right = Math.min(box.right, innerWidth) - (remaining > 1 ? 28 : 0);
    return r.left >= left - 0.5 && r.right <= right + 0.5;
  }, playerId);
}

type Point = { x: number; y: number };

async function center(locator: Locator): Promise<Point> {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A real touch gesture (touchStart → moves → hold → touchEnd), held still: no fling. */
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

/** A 160px sideways swipe across the rail, starting on a tile. */
async function swipeRail(page: Page, cdp: CDPSession, direction: -1 | 1 = -1) {
  const box = (await bench(page).boundingBox())!;
  const y = box.y + 20;
  const x = direction < 0 ? box.x + box.width * 0.7 : box.x + box.width * 0.3;
  await touchMove(page, cdp, { x, y }, { x: x + direction * 160, y });
}

/** Swipes (not jump buttons) until the rail is at its end. */
async function swipeToEnd(page: Page, cdp: CDPSession) {
  for (let swipes = 0; swipes < 8; swipes += 1) {
    if ((await maxScroll(page)) - (await scrollLeft(page)) <= 1) return swipes;
    await swipeRail(page, cdp);
  }
  throw new Error("rail never reached its end");
}

const tall = (page: Page) => page.viewportSize()!.height >= 780;

function expectedLayout(page: Page, subs: number) {
  const isTall = tall(page);
  const rowH = isTall ? 50 : 44;
  // Measured with the DESIGN §5.2 name ladder (FEAT-NAME-01). The five
  // substitutes ("Mathilde", "Marie-Louise", "Emma Han", "Emma Hau",
  // "Henriette") need two rows at 360 wide.
  if (subs <= 5) return { rows: page.viewportSize()!.width < 375 ? 2 : 1, rail: false, rowH };
  if (subs <= 8) return { rows: 2, rail: false, rowH };
  // Nine of these names fit two rows from about 400px wide (402×750).
  if (subs <= 9 && page.viewportSize()!.width >= 400) return { rows: 2, rail: false, rowH };
  if (subs <= 11) return isTall ? { rows: 3, rail: false, rowH } : { rows: 2, rail: true, rowH };
  return { rows: isTall ? 3 : 2, rail: true, rowH };
}

function layoutTests(viewportNote = "") {
  for (const theme of ["light", "dark"] as const) {
    test(`no substitutes: no bench, the strip says so${viewportNote} (${theme})`, async ({ page }) => {
      const errors = await openLive(page, 0, theme);
      await expect(bench(page)).toHaveCount(0);
      await expect(strip(page)).toContainText("Ingen innbyttere");
      expect(errors).toEqual([]);
    });

    for (const subs of [5, 8, 9, 11, 15]) {
      test(`${subs} substitutes: sorted, readable, reachable, pitch kept${viewportNote} (${theme})`, async ({ page }) => {
        const errors = await openLive(page, subs, theme);
        const expected = expectedLayout(page, subs);
        await expect(bench(page).locator("[data-bench-player-id]")).toHaveCount(subs);

        const m = await page.evaluate(() => {
          const root = document.querySelector<HTMLElement>('[data-testid="live-sideline"]')!;
          const rail = root.querySelector<HTMLElement>('[data-testid="live-bench"]')!;
          const tiles = [...rail.querySelectorAll<HTMLElement>("[data-bench-player-id]")];
          const r = (el: Element) => el.getBoundingClientRect();
          const cut = (el: Element) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return range.getBoundingClientRect().width > r(el).width + 0.25;
          };
          return {
            rows: new Set(tiles.map((t) => Math.round(r(t).top))).size,
            benchH: Math.round(Math.max(...tiles.map((t) => r(t).bottom)) - Math.min(...tiles.map((t) => r(t).top))),
            pitchH: r(root.querySelector('[role="group"]')!).height,
            rail: rail.scrollWidth - rail.clientWidth > 1,
            minW: Math.min(...tiles.map((t) => r(t).width)),
            minH: Math.min(...tiles.map((t) => r(t).height)),
            namesCut: tiles.filter((t) => cut(t.querySelector('[class*="benchName"]')!)).length,
            minutesShown: tiles.every((t) => /^\d+′$/.test(t.querySelector('[class*="benchMinutes"]')?.textContent ?? "")),
            nameFont: parseFloat(getComputedStyle(tiles[0].querySelector('[class*="benchName"]')!).fontSize),
            minutes: tiles.map((t) => parseInt(t.querySelector('[class*="benchMinutes"]')!.textContent!, 10)),
            squad: tiles.map((t) => Number(t.dataset.benchPlayerId!.slice(1))),
            pageScrollsX: document.documentElement.scrollWidth > innerWidth,
            pageScrollsY: document.documentElement.scrollHeight > innerHeight,
          };
        });

        // Layout, as measured for the approved prototype.
        expect(m.rows).toBe(expected.rows);
        expect(m.rail).toBe(expected.rail);
        expect(m.benchH).toBe(expected.rows * expected.rowH + (expected.rows - 1) * 4);
        // The pitch stays dominant: at least 55 % of the screen.
        expect(m.pitchH).toBeGreaterThan(page.viewportSize()!.height * 0.55);
        expect(m.pageScrollsX).toBe(false);
        expect(m.pageScrollsY).toBe(false);

        // Readable: names in full at ≥ 14px, minutes on every tile, 44px targets.
        expect(m.namesCut).toBe(0);
        expect(m.nameFont).toBeGreaterThanOrEqual(14);
        expect(m.minutesShown).toBe(true);
        expect(m.minW).toBeGreaterThanOrEqual(44);
        expect(m.minH).toBeGreaterThanOrEqual(44);

        // Least-played first (DOM order is the visual order), ties in squad order.
        const order = await shownOrder(page);
        expect(order).toEqual(m.squad.map((n) => `p${n}`));
        for (let i = 1; i < m.minutes.length; i += 1) {
          expect(m.minutes[i - 1]).toBeLessThanOrEqual(m.minutes[i]);
          if (m.minutes[i - 1] === m.minutes[i]) expect(m.squad[i - 1]).toBeLessThan(m.squad[i]);
        }
        // Not all ties: the two substitutions made in openLive gave minutes.
        expect(new Set(m.minutes).size).toBeGreaterThan(1);

        // Every substitute is reachable.
        const first = order[0];
        const last = order.at(-1)!;
        expect(await fullyVisible(page, first)).toBe(true);
        if (!expected.rail) {
          await expect(jumpEnd(page)).toHaveCount(0);
          for (const id of order) expect(await fullyVisible(page, id)).toBe(true);
        } else {
          // "+N ›" counts exactly the substitutes that are not one tap away.
          const notReachable = (await Promise.all(order.map((id) => fullyVisible(page, id)))).filter((v) => !v).length;
          await expect(jumpEnd(page)).toHaveText(`+${notReachable}`);
          await expect(jumpStart(page)).toHaveCount(0);
          expect(await fullyVisible(page, last)).toBe(false);

          await jumpEnd(page).click();
          await expect.poll(() => scrollLeft(page)).toBeGreaterThanOrEqual((await maxScroll(page)) - 1);
          expect(await fullyVisible(page, last)).toBe(true);
          await runFrames(page);
          await expect(jumpEnd(page)).toHaveCount(0);
          await expect(jumpStart(page)).toBeVisible();
          await expect(jumpStart(page)).toHaveAccessibleName("Tilbake til de med minst spilletid");

          await jumpStart(page).click();
          await expect.poll(() => scrollLeft(page)).toBe(0);
          expect(await fullyVisible(page, first)).toBe(true);
          await runFrames(page);
          await expect(jumpEnd(page)).toHaveAccessibleName(/^Vis \d+ innbyttere? til, med flest minutter$/);
        }
        expect(errors).toEqual([]);
      });
    }
  }
}

function flowTests(viewportNote = "") {
  for (const theme of ["light", "dark"] as const) {
    test(`rail swipe keeps the selection; tap and drag substitute by id; undo holds the order${viewportNote} (${theme})`, async ({
      page,
    }) => {
      const errors = await openLive(page, 15, theme);
      const cdp = await page.context().newCDPSession(page);
      const initial = await shownOrder(page);

      // 1. Select a pitch player, then swipe the rail sideways on a tile.
      await token(page, "p3").click();
      await expect(strip(page)).toHaveAttribute("data-strip", "selection");
      const swipes = await swipeToEnd(page, cdp);
      expect(swipes).toBeGreaterThan(0);
      await expect(strip(page)).toHaveAttribute("data-strip", "selection");
      await expect(page.getByTestId("live-ghost")).toHaveCount(0);
      expect(await subCount(page)).toBe(2);
      expect(await shownOrder(page)).toEqual(initial);

      // 2. Tap the last (most-played) substitute: it goes on, by id.
      const last = initial.at(-1)!;
      expect(await fullyVisible(page, last)).toBe(true);
      await tile(page, last).click();
      await expect(strip(page)).toHaveAttribute("data-strip", "undo");
      expect((await stored(page)).onFieldPlayerIds).toContain(last);
      expect((await stored(page)).benchPlayerIds).toContain("p3");

      // 3. Inside the undo window nothing moves: p3 sits in the last slot.
      const scrolled = await scrollLeft(page);
      expect(scrolled).toBeGreaterThan(0);
      expect(await shownOrder(page)).toEqual([...initial.slice(0, -1), "p3"]);

      // 4. Undo window over: one re-sort (p3 has 10′, the most), back to the start.
      await advanceClock(page, 6000);
      await expect(strip(page)).not.toHaveAttribute("data-strip", "undo");
      await expect.poll(() => scrollLeft(page)).toBe(0);
      const resorted = await shownOrder(page);
      expect(resorted.at(-1)).toBe("p3");
      expect(resorted.slice(0, -1)).toEqual(initial.slice(0, -1));

      // 5. An upward touch drag from the scrolled rail still substitutes.
      await jumpEnd(page).click();
      await expect.poll(async () => (await maxScroll(page)) - (await scrollLeft(page))).toBeLessThanOrEqual(1);
      const dragged = resorted.at(-2)!;
      await touchMove(page, cdp, await center(tile(page, dragged)), await center(token(page, "p4").locator(":scope > span").first()));
      await expect(strip(page)).toHaveAttribute("data-strip", "undo");
      expect((await stored(page)).onFieldPlayerIds).toContain(dragged);
      expect((await stored(page)).benchPlayerIds).toContain("p4");

      // 6. Undo restores the exact order.
      await strip(page).getByRole("button", { name: /Angre bytte/ }).click();
      await expect(strip(page)).not.toHaveAttribute("data-strip", "undo");
      await advanceClock(page, 1000);
      await expect.poll(() => shownOrder(page)).toEqual(resorted);
      expect((await stored(page)).onFieldPlayerIds).toContain("p4");
      await cdp.detach();
      expect(errors).toEqual([]);
    });

    test(`first, middle and last by tap; mouse drag; position swaps still work beside a rail${viewportNote} (${theme})`, async ({
      page,
    }) => {
      const errors = await openLive(page, 11, theme);
      const order = await shownOrder(page);
      const picks = [order[0], order[Math.floor(order.length / 2)], order.at(-1)!];

      for (const pick of picks) {
        const before = await shownOrder(page);
        await token(page, "p5").click();
        await tile(page, pick).scrollIntoViewIfNeeded();
        await tile(page, pick).click();
        await expect(strip(page)).toHaveAttribute("data-strip", "undo");
        expect((await stored(page)).onFieldPlayerIds).toContain(pick);
        await strip(page).getByRole("button", { name: /Angre bytte/ }).click();
        await expect(strip(page)).not.toHaveAttribute("data-strip", "undo");
        await advanceClock(page, 1000);
        expect((await stored(page)).onFieldPlayerIds).toContain("p5");
        await expect.poll(() => shownOrder(page)).toEqual(before);
      }
      expect(await subCount(page)).toBe(2);

      // Mouse drag (desktop) from the bench onto a pitch player.
      await bench(page).evaluate((el) => (el.scrollLeft = 0));
      const from = await center(tile(page, order[0]));
      const to = await center(token(page, "p6").locator(":scope > span").first());
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 20, from.y - 20, { steps: 4 });
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up();
      await expect(strip(page)).toHaveAttribute("data-strip", "undo");
      expect((await stored(page)).onFieldPlayerIds).toContain(order[0]);
      await advanceClock(page, 6000);
      await expect(strip(page)).not.toHaveAttribute("data-strip", "undo");

      // Position swap by tap ("Bytt plass") and by drag.
      const slotOf = (id: string) => token(page, id).getAttribute("data-slot-id");
      const [s3, s4] = [await slotOf("p3"), await slotOf("p4")];
      await token(page, "p3").click();
      await strip(page).getByRole("button", { name: "Bytt plass" }).click();
      await token(page, "p4").click();
      await expect(strip(page)).toHaveAttribute("data-strip", "positionUndo");
      expect([await slotOf("p3"), await slotOf("p4")]).toEqual([s4, s3]);
      await advanceClock(page, 6000);

      const cdp = await page.context().newCDPSession(page);
      const [s5, s7] = [await slotOf("p5"), await slotOf("p7")];
      await touchMove(page, cdp, await center(token(page, "p5").locator(":scope > span").first()), await center(token(page, "p7").locator(":scope > span").first()));
      await expect(strip(page)).toHaveAttribute("data-strip", "positionUndo");
      expect([await slotOf("p5"), await slotOf("p7")]).toEqual([s7, s5]);
      await cdp.detach();
      expect(await subCount(page)).toBe(3);
      expect(errors).toEqual([]);
    });
  }

  test(`the rail controls work from the keyboard${viewportNote}`, async ({ page }) => {
    await openLive(page, 15, "light");
    await jumpEnd(page).focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await maxScroll(page)) - (await scrollLeft(page))).toBeLessThanOrEqual(1);
    await jumpStart(page).focus();
    await page.keyboard.press("Space");
    await expect.poll(() => scrollLeft(page)).toBe(0);
  });
}

test.describe("adaptive bench", () => {
  layoutTests();
  flowTests();
});

// 402×750 (a common mid-size phone) is not a Playwright project; run it once.
test.describe("adaptive bench at 402×750", () => {
  test.use({ viewport: { width: 402, height: 750 } });
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-se-375x667", "402×750 runs once, in the 375×667 project");
  });
  layoutTests(" at 402×750");
  flowTests(" at 402×750");
});
