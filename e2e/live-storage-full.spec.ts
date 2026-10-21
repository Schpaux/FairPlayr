import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

// OFF-01a (stream A): local restore and storage.
// 1. A full device during a live match: the scoreboard meta line says
//    «Ikke lagret» (glyph + words) and the menu's first row explains it, for
//    as long as it lasts; the full error band shows only where it covers no
//    player token (any of them) or control, is never auto-dismissed, and
//    after the coach hides it the meta line and menu keep speaking. The match
//    keeps working from memory.
// 2. A reload restores the match from the device with the same score,
//    scorers, pitch, bench and minutes (network on; offline is stream B).
// 3. After the app was closed for minutes with the clock running, a
//    discreet notice says so where it fits, and the menu says it for the
//    session either way; the clock is not adjusted.
// 4. Data from a newer build shows "Oppdatering kreves" even mid-match.
// Seeds like live-substitution-undo.spec.ts (guest team, active setup, flag on).

type Theme = "light" | "dark";
const THEMES: Theme[] = ["light", "dark"];

const NAMES = ["Frida Berg", "Ida Ruud", "Selma Lie", "Vilde Moe", "Maja Dahl", "Nora Hagen", "Emma Hansen", "Thea Strand", "Ingrid Lund"];
const LIVE_KEY = "fairplayr.liveMatch.v1";
const T0 = "2026-10-20T10:00:00.000Z";

const SHOTS_DIR = process.env.FP_A2_SHOTS_DIR;

function seed() {
  const players = NAMES.map((name, index) => ({
    id: `p${index + 1}`,
    name,
    number: index + 1,
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: T0,
    updatedAt: T0,
  }));
  const ids = players.map((player) => player.id);
  const starters = ids.slice(0, 7);
  return {
    workspace: {
      version: 2,
      teams: [{ id: "team-e2e", name: "Lyn G12", players, createdAt: T0, updatedAt: T0 }],
      activeTeamId: "team-e2e",
    },
    setup: {
      version: 2,
      status: "active",
      serverMatchId: null,
      config: {
        id: "setup-e2e-storage",
        teamId: "team-e2e",
        format: "7v7",
        reportEnabled: false,
        formationId: "7v7-2-3-1",
        duration: { mode: "preset", presetId: "2x20", halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
        selectedPlayerIds: ids,
        startingPlayerIds: starters,
        slotAssignments: Object.fromEntries(starters.map((id, index) => [`7v7-${index + 1}`, id])),
        createdAt: T0,
        updatedAt: T0,
      },
    },
  };
}

async function seedPage(page: Page, theme: Theme, time: Date | string = T0) {
  await page.clock.install({ time: new Date(time) });
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
}

async function gotoLive(page: Page) {
  await page.goto("/no/match/live", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

async function kickoff(page: Page, minutes: string) {
  await page.getByRole("button", { name: "Avspark", exact: true }).click();
  await page.clock.fastForward(minutes);
}

interface StoredMatch {
  id: string;
  teamScore: number;
  opponentScore: number;
  onFieldPlayerIds: string[];
  benchPlayerIds: string[];
  liveSlotAssignments: Record<string, string | null>;
  playerAccumulatedMs: Record<string, number>;
  onFieldStartedAtElapsedMs: Record<string, number | null>;
  clock: { startedAtMs: number | null; isRunning: boolean; accumulatedPausedMs: number };
  events: { id: string; type: string; scorerPlayerId?: string | null }[];
}

async function stored(page: Page): Promise<StoredMatch> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), LIVE_KEY);
  return (JSON.parse(raw!) as { liveMatch: StoredMatch }).liveMatch;
}

const score = (page: Page) => page.getByTestId("live-score");
const token = (page: Page, playerId: string) => page.locator(`[data-player-id="${playerId}"]`);
const benchTile = (page: Page, playerId: string) => page.locator(`[data-bench-player-id="${playerId}"]`);

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function box(locator: Locator): Promise<Box> {
  const value = await locator.boundingBox();
  expect(value, "element has a box").not.toBeNull();
  return value!;
}

/** Whether the band is shown (it fits) rather than only laid out, hidden. */
async function bandFits(band: Locator): Promise<boolean> {
  return (await band.getAttribute("data-fits")) === "true";
}

/**
 * A shown band covers no critical control and no player token at all
 * (DESIGN.md §5.6). Measured on what the band shows (its notice), not its
 * full-width, pointer-transparent container.
 */
async function expectBandClearOfControls(page: Page, band: Locator) {
  const entries = await band.locator(":scope > *").all();
  const entryBoxes = (await Promise.all(entries.map((entry) => entry.boundingBox()))).filter(
    (value): value is Box => value !== null && value.width > 1 && value.height > 1
  );
  expect(entryBoxes.length, "band shows something").toBeGreaterThan(0);

  const board = await box(page.getByTestId("live-sideline").locator("header"));
  const strip = await box(page.getByTestId("live-strip"));
  const tiles = await Promise.all((await page.locator("[data-bench-player-id]").all()).map((tile) => box(tile)));
  const tokens = await Promise.all((await page.locator("[data-player-id]").all()).map((item) => box(item)));

  for (const entry of entryBoxes) {
    expect(overlaps(entry, board), "band vs scoreboard").toBe(false);
    expect(overlaps(entry, strip), "band vs strip").toBe(false);
    for (const tile of tiles) expect(overlaps(entry, tile), "band vs bench tile").toBe(false);
    for (const item of tokens) expect(overlaps(entry, item), "band vs a player token").toBe(false);
  }
}

/** A band that does not fit is not shown and takes no taps. */
async function expectBandHidden(band: Locator) {
  await expect(band).toHaveAttribute("data-fits", "false");
  await expect(band).toBeHidden();
}

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Kampmeny", exact: true }).click();
  const menu = page.getByTestId("live-menu");
  await expect(menu).toBeVisible();
  return menu;
}

async function closeMenu(page: Page) {
  const menu = page.getByTestId("live-menu");
  await menu.getByRole("button", { name: "Lukk", exact: true }).click();
  await expect(menu).toHaveCount(0);
}

async function shot(page: Page, name: string) {
  if (!SHOTS_DIR) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
}

for (const theme of THEMES) {
  test.describe(`live storage (${theme})`, () => {
    test("a full device: persistent error notice, match keeps working, nothing critical covered", async ({ page }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await seedPage(page, theme);
      await gotoLive(page);
      await kickoff(page, "03:00");

      await page.evaluate(() => {
        Storage.prototype.setItem = function () {
          throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        };
      });
      await page.getByRole("button", { name: "Mål for oss", exact: true }).click();

      const meta = page.getByTestId("live-meta");
      const band = page.getByTestId("live-notice-band");
      const notice = page.getByTestId("storage-error-notice");
      // Always: glyph + words in the scoreboard meta line, announced once.
      await expect(meta).toHaveText("Ikke lagret");
      await expect(meta.locator("svg")).toBeVisible();
      await expect(page.getByRole("alert").filter({ hasText: "Kampen lagres ikke på enheten." })).toHaveCount(1);
      await expect(score(page)).toHaveAttribute("aria-label", "Stilling: oss 1, dem 0");
      // No wordless cue any more.
      await expect(page.getByTestId("storage-error-cue")).toHaveCount(0);

      await expect(band).toHaveAttribute("data-fits", /true|false/);
      const fits = await bandFits(band);
      if (fits) {
        // The full band where it fits: glyph, title and body, over grass only.
        await expect(notice).toBeVisible();
        await expect(notice).toContainText("Lagringen er full eller blokkert.");
        await expectBandClearOfControls(page, band);
      } else {
        // Where it would cover a token, no band: meta line and menu only.
        await expectBandHidden(band);
      }
      await shot(page, `storage-error-${theme}-${info.project.name}`);

      // The menu's first row explains it.
      let menu = await openMenu(page);
      await expect(menu.locator("p").first()).toContainText("Kampen lagres ikke på enheten.");
      await expect(menu.locator("p").first()).toContainText("Lagringen er full eller blokkert.");
      await shot(page, `storage-error-menu-${theme}-${info.project.name}`);
      await closeMenu(page);

      // Never auto-dismissed.
      await page.clock.fastForward("00:20");
      await expect(meta).toHaveText("Ikke lagret");
      if (fits) await expect(notice).toBeVisible();

      // Every critical control still works from memory.
      await page.getByRole("button", { name: "Mål for dem", exact: true }).click();
      await expect(score(page)).toHaveAttribute("aria-label", "Stilling: oss 1, dem 1");
      await token(page, "p5").click();
      await benchTile(page, "p8").click();
      await expect(token(page, "p8")).toBeVisible();
      await expect(meta).toHaveText("Ikke lagret");
      if (await bandFits(band)) await expectBandClearOfControls(page, band);

      if (await bandFits(band)) {
        // Hidden by the coach: the band goes, the meta line and menu stay.
        await notice.getByRole("button", { name: "Skjul meldingen om lagring" }).click();
        await expect(notice).toHaveCount(0);
        await expect(meta).toHaveText("Ikke lagret");
        menu = await openMenu(page);
        await expect(menu.locator("p").first()).toContainText("Kampen lagres ikke på enheten.");
        await closeMenu(page);
      }

      expect(errors).toEqual([]);
    });

    test("a reload restores score, scorers, pitch, bench and minutes from the device", async ({ page }) => {
      await seedPage(page, theme);
      await gotoLive(page);
      await kickoff(page, "02:00");

      await page.getByRole("button", { name: "Mål for oss", exact: true }).click();
      await page.clock.fastForward("01:00");
      await token(page, "p5").click();
      await benchTile(page, "p8").click();
      await expect(token(page, "p8")).toBeVisible();
      await page.clock.fastForward("00:10"); // past the undo window
      await page.getByRole("button", { name: "Mål for dem", exact: true }).click();
      await page.clock.fastForward("00:10");
      await page.getByRole("button", { name: "Mål for oss", exact: true }).click();
      await page.clock.fastForward("00:10");

      const before = await stored(page);
      const minutesBefore = await token(page, "p1").innerText();
      expect(before.teamScore).toBe(2);
      expect(before.onFieldPlayerIds).toContain("p8");

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });

      await expect(score(page)).toHaveAttribute("aria-label", "Stilling: oss 2, dem 1");
      await expect(token(page, "p8")).toBeVisible();
      await expect(benchTile(page, "p5")).toBeVisible();
      expect(await token(page, "p1").innerText()).toBe(minutesBefore);

      const after = await stored(page);
      expect(after.id).toBe(before.id);
      expect(after.events).toEqual(before.events);
      expect(after.onFieldPlayerIds).toEqual(before.onFieldPlayerIds);
      expect(after.benchPlayerIds).toEqual(before.benchPlayerIds);
      expect(after.liveSlotAssignments).toEqual(before.liveSlotAssignments);
      expect(after.playerAccumulatedMs).toEqual(before.playerAccumulatedMs);
      expect(after.onFieldStartedAtElapsedMs).toEqual(before.onFieldStartedAtElapsedMs);
      expect(after.clock).toEqual(before.clock);
      await expect(page.getByTestId("restored-match-notice")).toHaveCount(0);
    });

    test("after the app was closed for 7 min, a discreet notice; the clock already includes the gap", async ({ page, context }, info) => {
      await seedPage(page, theme);
      await gotoLive(page);
      await kickoff(page, "01:00");
      const closedAtMs = await page.evaluate(() => Date.now());
      const before = await stored(page);
      await page.close(); // pagehide writes the heartbeat

      const reopened = await context.newPage();
      await reopened.clock.install({ time: new Date(closedAtMs + 7 * 60_000) });
      await gotoLive(reopened);

      const message = "Appen var lukket i 7 min – klokken gikk videre";
      const notice = reopened.getByTestId("restored-match-notice");
      const band = reopened.getByTestId("live-notice-band");
      await expect(band).toHaveAttribute("data-fits", /true|false/);
      // Announced once, whether the band is shown or not.
      await expect(reopened.getByRole("status").filter({ hasText: message })).toHaveCount(1);
      if (await bandFits(band)) {
        await expect(notice).toBeVisible();
        await expect(notice).toContainText(message);
        await expectBandClearOfControls(reopened, band);
      } else {
        await expectBandHidden(band);
      }
      expect((await stored(reopened)).clock).toEqual(before.clock);
      // 1 min before closing + 7 min closed.
      await expect(reopened.getByTestId("live-clock")).toContainText("08:");
      await shot(reopened, `restored-notice-${theme}-${info.project.name}`);

      // Passive info: the band goes after 8 s; the menu keeps it for the session.
      await reopened.clock.fastForward("00:09");
      await expect(notice).toHaveCount(0);
      const menu = await openMenu(reopened);
      await expect(menu.getByTestId("live-menu-note-restoredMatch")).toContainText(message);
      await shot(reopened, `restored-menu-${theme}-${info.project.name}`);
      await closeMenu(reopened);
    });

    test("data from a newer build asks for a reload, also mid-match", async ({ page }, info) => {
      await seedPage(page, theme);
      await gotoLive(page);
      await kickoff(page, "01:00");

      await page.evaluate((key) => {
        const envelope = JSON.parse(localStorage.getItem(key)!);
        localStorage.setItem(key, JSON.stringify({ ...envelope, version: 99 }));
      }, LIVE_KEY);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

      const sheet = page.getByTestId("update-required-sheet");
      await expect(sheet).toBeVisible({ timeout: 30_000 });
      await expect(sheet).toContainText("Oppdatering kreves");
      await expect(sheet.getByRole("button", { name: "Last inn på nytt" })).toBeVisible();
      // This build never wrote over the newer record.
      expect(JSON.parse((await page.evaluate((key) => localStorage.getItem(key), LIVE_KEY))!).version).toBe(99);
      await shot(page, `update-required-${theme}-${info.project.name}`);
    });
  });
}
