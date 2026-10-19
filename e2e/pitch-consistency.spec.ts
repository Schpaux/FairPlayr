import { expect, test, type Locator, type Page } from "@playwright/test";

// FP-PITCH-01: one pitch through the whole match flow. The setup pitch and the
// live pitch face the same way (own goal at the bottom, attacking upwards),
// share the token placement (`placeTokens`), and every player keeps the slot,
// side and line they were given in setup when the match starts. Setup
// drag-and-drop and tap-to-place keep working. Synthetic guest data only.
//
// Set FP_SHOTS_DIR to also save setup and live screenshots (review evidence).

const NOW = "2026-10-14T10:00:00.000Z";
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];
const FORMATS = {
  "7v7": { formationId: "7v7-2-3-1", onField: 7, keeper: "7v7-1" },
  "11v11": { formationId: "11v11-4-3-3", onField: 11, keeper: "11v11-1" },
} as const;
type Format = keyof typeof FORMATS;

function seed(format: Format) {
  const names = ["Frida", "Ida", "Selma", "Vilde", "Maja", "Nora", "Emma", "Thea", "Ingrid", "Sara", "Linnea", "Hedda", "Oda"];
  const count = FORMATS[format].onField + 2;
  const players = names.slice(0, count).map((name, index) => ({
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

  return {
    workspace: {
      version: 2,
      teams: [{ id: "team-e2e", name: "Lyn G12", players, createdAt: NOW, updatedAt: NOW }],
      activeTeamId: "team-e2e",
    },
    prefs: { "team-e2e": { format, formationId: FORMATS[format].formationId, durationPresetId: "2x20" } },
  };
}

async function openSetup(page: Page, format: Format, theme: Theme) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.addInitScript(
    ({ data, theme }) => {
      if (sessionStorage.getItem("fp-e2e-seeded")) return;
      sessionStorage.setItem("fp-e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem("theme", theme);
      localStorage.setItem("fairplayr.liveUi", "sideline");
      localStorage.setItem("fairplayr.teams.v2", JSON.stringify(data.workspace));
      localStorage.setItem("fairplayr.teamPrefs.v1", JSON.stringify(data.prefs));
    },
    { data: seed(format), theme }
  );

  await page.goto("/no/match/setup", { waitUntil: "domcontentloaded" });
  // `html` scrolls smoothly; Playwright's own scroll-into-view would then still
  // be moving the page while a drag measures its start and end points.
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; } html { scroll-behavior: auto !important; }",
  });
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`), { timeout: 30_000 });
  await page.getByRole("button", { name: "Velg alle" }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Fyll automatisk" }).click();
  return errors;
}

/**
 * The setup pitch. The fallback matches the pre-FP-PITCH-01 markup only so
 * FP_SHOTS_DIR can capture "before" screenshots; the assertions need the new one.
 */
function setupPitch(page: Page): Locator {
  return page.locator('[data-testid="setup-pitch"], div:has(> button[data-slot-id])').first();
}

async function shot(page: Page, target: Locator, name: string) {
  const dir = process.env.FP_SHOTS_DIR;
  if (!dir) return;
  await target.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
  );
  await page.screenshot({ path: `${dir}/${name}-${test.info().project.name}.png` });
}

interface TokenSpot {
  slot: string;
  player: string | null;
  /** Disc centre in % of the token box (0 = top / left). */
  x: number;
  y: number;
}

/** Disc centres of the tokens under `root`, normalised to its token box. */
async function layoutOf(root: Locator): Promise<TokenSpot[]> {
  return root.evaluate((element) => {
    const box = element.querySelector("[data-token-box]")?.getBoundingClientRect() ?? element.getBoundingClientRect();
    return [...element.querySelectorAll<HTMLElement>("[data-slot-id]")].map((token) => {
      const disc = (token.firstElementChild ?? token).getBoundingClientRect();
      return {
        slot: token.dataset.slotId!,
        player: token.dataset.playerId ?? null,
        x: ((disc.left + disc.width / 2 - box.left) / box.width) * 100,
        y: ((disc.top + disc.height / 2 - box.top) / box.height) * 100,
      };
    });
  });
}

const bySlot = (spots: TokenSpot[]) => Object.fromEntries(spots.map((spot) => [spot.slot, spot]));

/** Who is in each slot, read from the setup pitch. */
async function assignments(page: Page) {
  return Object.fromEntries(
    (await layoutOf(page.getByTestId("setup-pitch"))).map((spot) => [spot.slot, spot.player])
  );
}

/** Pointer drag with intermediate moves, so the editor passes its drag threshold. */
async function drag(page: Page, from: Locator, to: Locator) {
  // Centre the midpoint of source and target, so both are on screen and clear
  // of the sticky header and the bottom nav.
  const [fromHandle, toHandle] = [await from.elementHandle(), await to.elementHandle()];
  await page.evaluate(
    ([source, target]) => {
      const a = source!.getBoundingClientRect();
      const b = target!.getBoundingClientRect();
      const mid = (a.top + a.bottom + b.top + b.bottom) / 4;
      window.scrollBy({ top: mid - window.innerHeight / 2, behavior: "instant" });
    },
    [fromHandle, toHandle] as const
  );
  const a = (await from.boundingBox())!;
  // Drop on the target's disc (its first child), not near a neighbour's tag.
  const b = (await to.locator(":scope > :first-child").boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 20, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
}

test.describe("FP-PITCH-01 consistent pitch from setup to live", () => {
  for (const format of Object.keys(FORMATS) as Format[]) {
    for (const theme of THEMES) {
      test(`${format} ${theme}: setup and live share orientation, markings and positions`, async ({ page }) => {
        const errors = await openSetup(page, format, theme);
        const { onField, keeper } = FORMATS[format];
        const setup = setupPitch(page);
        await expect(setup.locator("[data-slot-id]")).toHaveCount(onField);
        await shot(page, setup, `pitch-${format}-${theme}-setup`);
        await expect.soft(setup.locator("[data-slot-id][data-player-id]")).toHaveCount(onField);
        const setupSpots = await layoutOf(setup);
        const setupHadMarkings = (await setup.locator("svg[data-pitch-markings]").count()) === 1;

        await page.getByRole("button", { name: /Start kamp/ }).click();
        await expect(page).toHaveURL(/\/no\/match\/live/, { timeout: 30_000 });
        const live = page.getByTestId("live-sideline");
        await expect(live.locator("[data-slot-id]")).toHaveCount(onField, { timeout: 30_000 });
        await shot(page, live, `pitch-${format}-${theme}-live`);
        const liveSpots = await layoutOf(live);

        // Both views draw the same full-pitch markings (own goal at the bottom).
        expect(setupHadMarkings).toBe(true);
        await expect(page.getByTestId("live-sideline").locator("svg[data-pitch-markings]")).toHaveCount(1);
        expect(setupSpots).toHaveLength(onField);

        const setupBySlot = bySlot(setupSpots);
        const liveBySlot = bySlot(liveSpots);
        expect(Object.keys(liveBySlot).sort()).toEqual(Object.keys(setupBySlot).sort());

        for (const slot of Object.keys(setupBySlot)) {
          // Same player in the same slot: nothing swapped on the way to Live.
          expect(liveBySlot[slot].player, slot).toBe(setupBySlot[slot].player);
          // Same place on the pitch (in % of the token box): not mirrored or shifted.
          expect(Math.abs(liveBySlot[slot].x - setupBySlot[slot].x), `${slot} x`).toBeLessThan(3);
          expect(Math.abs(liveBySlot[slot].y - setupBySlot[slot].y), `${slot} y`).toBeLessThan(4);
        }

        // Own goal at the bottom in both: the keeper is the lowest token.
        for (const spots of [setupSpots, liveSpots]) {
          const lowest = [...spots].sort((a, b) => b.y - a.y)[0];
          expect(lowest.slot).toBe(keeper);
        }

        expect(errors).toEqual([]);
      });
    }
  }

  test("setup pitch: markings, drag-and-drop and tap-to-place still work", async ({ page }) => {
    const errors = await openSetup(page, "7v7", "light");
    const pitch = page.getByTestId("setup-pitch");
    await expect(pitch.locator("[data-slot-id][data-player-id]")).toHaveCount(7);
    await expect(pitch.locator("svg[data-pitch-markings]")).toHaveCount(1);
    const slot = (id: string) => pitch.locator(`[data-slot-id="${id}"]`);
    // The lineup editor (pitch + bench); the squad picker above also lists every name.
    const bench = (name: string) => pitch.locator("..").getByRole("button", { name, exact: true });
    const start = await assignments(page);

    // Bench → slot by drag: Thea (p8) takes slot 3, its player goes to the bench.
    await drag(page, bench("Thea"), slot("7v7-3"));
    await expect(slot("7v7-3")).toHaveAttribute("data-player-id", "p8");
    const displaced = start["7v7-3"]!;

    // A tap right after a drag counts (the dragged chip left the bench, so no
    // trailing click consumed the guard): it selects, and a second tap deselects.
    await slot("7v7-6").click();
    await expect(slot("7v7-6")).toHaveAttribute("aria-pressed", "true");
    await slot("7v7-6").click();
    await expect(pitch.locator('[aria-pressed="true"]')).toHaveCount(0);

    // Slot → slot by drag swaps the two players.
    const beforeSwap = await assignments(page);
    await drag(page, slot("7v7-2"), slot("7v7-4"));
    await expect(slot("7v7-2")).toHaveAttribute("data-player-id", beforeSwap["7v7-4"]!);
    await expect(slot("7v7-4")).toHaveAttribute("data-player-id", beforeSwap["7v7-2"]!);
    // Releasing a drag never also selects a player (the trailing click is swallowed).
    await expect(pitch.locator('[aria-pressed="true"]')).toHaveCount(0);

    // Tap a bench player, then a slot: the displaced player comes back in.
    const benchName = await page.evaluate(
      (id) => JSON.parse(localStorage.getItem("fairplayr.teams.v2")!).teams[0].players.find((p: { id: string }) => p.id === id).name,
      displaced
    );
    await bench(benchName).click();
    await expect(pitch.locator("[data-slot-id]").first()).toBeVisible();
    await slot("7v7-5").click();
    await expect(slot("7v7-5")).toHaveAttribute("data-player-id", displaced);

    // The edited lineup is what Live starts with, slot for slot.
    const finalSetup = await assignments(page);
    await page.getByRole("button", { name: /Start kamp/ }).click();
    await expect(page).toHaveURL(/\/no\/match\/live/, { timeout: 30_000 });
    const live = page.getByTestId("live-sideline");
    await expect(live.locator("[data-slot-id]")).toHaveCount(7, { timeout: 30_000 });
    const liveAssignments = Object.fromEntries((await layoutOf(live)).map((spot) => [spot.slot, spot.player]));
    expect(liveAssignments).toEqual(finalSetup);

    expect(errors).toEqual([]);
  });
});
