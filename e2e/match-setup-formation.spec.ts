import { expect, test, type Page } from "@playwright/test";

// FP-MS2.1-A3 (MS-03, X-06): team defaults own a new match's formation.
// Reproduces the audit: a previous 7v7 match ended in 3-2-1, the coach sets
// the team default to 2-3-1 (Spillere → Laginnstillinger → Kampstandard) and
// opens Kampoppsett. Setup must show 2-3-1, leave the defaults untouched and
// carry 2-3-1 into Live. Synthetic guest data only, no network needed.

const NOW = "2026-10-14T10:00:00.000Z";
const PREFS_KEY = "fairplayr.teamPrefs.v1";
const SETUP_KEY = "fairplayr.matchSetup.v1";
const LIVE_KEY = "fairplayr.liveMatch.v1";

function seed({ withEndedMatch }: { withEndedMatch: boolean }) {
  const players = ["Frida", "Ida", "Selma", "Vilde", "Maja", "Nora", "Emma", "Thea", "Ingrid"].map(
    (name, index) => ({
      id: `p${index + 1}`,
      name,
      number: index + 1,
      source: "manual",
      externalProvider: null,
      externalId: null,
      isManaged: false,
      createdAt: NOW,
      updatedAt: NOW,
    })
  );
  const starters = players.slice(0, 7).map((player) => player.id);

  return {
    workspace: {
      version: 2,
      teams: [{ id: "team-e2e", name: "Lyn G12", players, createdAt: NOW, updatedAt: NOW }],
      activeTeamId: "team-e2e",
    },
    prefs: { "team-e2e": { format: "7v7", formationId: "7v7-3-2-1", durationPresetId: "2x20" } },
    setup: withEndedMatch
      ? {
          version: 2,
          status: "ended",
          serverMatchId: null,
          config: {
            id: "setup-previous",
            teamId: "team-e2e",
            format: "7v7",
            reportEnabled: false,
            formationId: "7v7-3-2-1",
            duration: { mode: "preset", presetId: "2x20", halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
            selectedPlayerIds: players.map((player) => player.id),
            startingPlayerIds: starters,
            slotAssignments: Object.fromEntries(starters.map((id, index) => [`7v7-${index + 1}`, id])),
            createdAt: NOW,
            updatedAt: NOW,
          },
        }
      : null,
  };
}

async function open(page: Page, path: string, options: { withEndedMatch: boolean }) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.addInitScript((data) => {
    if (sessionStorage.getItem("fp-e2e-seeded")) return;
    sessionStorage.setItem("fp-e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("fairplayr.liveUi", "sideline");
    localStorage.setItem("fairplayr.teams.v2", JSON.stringify(data.workspace));
    localStorage.setItem("fairplayr.teamPrefs.v1", JSON.stringify(data.prefs));
    if (data.setup) localStorage.setItem("fairplayr.matchSetup.v1", JSON.stringify(data.setup));
  }, seed(options));

  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  return errors;
}

const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

/** Formation shape shown in setup's compact settings card. */
async function expectSetupFormation(page: Page, shape: string) {
  const card = page.getByText("Kampinnstillinger").locator("..");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(shape, { exact: true })).toBeVisible();
  for (const other of ["2-3-1", "3-2-1", "2-2-2"].filter((s) => s !== shape)) {
    await expect(card.getByText(other, { exact: true })).toHaveCount(0);
  }
}

/** Outfield line sizes on the Live pitch, back to front (keeper excluded). */
async function liveLineCounts(page: Page) {
  const tokens = page.locator('[data-testid="live-sideline"] [data-slot-id]');
  await expect(tokens).toHaveCount(7, { timeout: 30_000 });
  const centres: { slot: string; y: number }[] = [];
  for (const token of await tokens.all()) {
    const box = (await token.boundingBox())!;
    centres.push({ slot: (await token.getAttribute("data-slot-id"))!, y: box.y + box.height / 2 });
  }
  const ys = centres
    .filter((c) => c.slot !== "7v7-1")
    .map((c) => c.y)
    .sort((a, b) => b - a);
  const lines: number[][] = [];
  for (const y of ys) {
    const line = lines.at(-1);
    if (line && line[0] - y < 12) line.push(y);
    else lines.push([y]);
  }
  return lines.map((line) => line.length);
}

test.describe("formation defaults and match setup", () => {
  test("team default 2-3-1 wins over the last match's 3-2-1 and reaches Live", async ({ page }) => {
    const errors = await open(page, "/no/team", { withEndedMatch: true });

    // Spillere → Laginnstillinger → Kampstandard → 2-3-1
    await page.getByRole("button", { name: "Laginnstillinger" }).click();
    await page.getByRole("button", { name: "2-3-1", exact: true }).click();
    await expect
      .poll(async () => JSON.parse((await stored(page, PREFS_KEY)) ?? "{}")["team-e2e"]?.formationId)
      .toBe("7v7-2-3-1");
    const prefsBefore = await stored(page, PREFS_KEY);

    await page.goto("/no/match/setup", { waitUntil: "domcontentloaded" });
    await expectSetupFormation(page, "2-3-1");
    await expect(page.getByText("Fortsetter påbegynt kampoppsett")).toHaveCount(0);
    expect(await stored(page, PREFS_KEY)).toBe(prefsBefore);

    // Reload before any change: still the default, still nothing written.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectSetupFormation(page, "2-3-1");
    expect(await stored(page, PREFS_KEY)).toBe(prefsBefore);

    await page.getByRole("button", { name: "Velg alle" }).click();
    await page.getByRole("button", { name: "Fyll automatisk" }).click();
    await page.getByRole("button", { name: /Start kamp/ }).click();

    await expect(page).toHaveURL(/\/no\/match\/live/, { timeout: 30_000 });
    expect(await liveLineCounts(page)).toEqual([2, 3, 1]);
    const live = JSON.parse((await stored(page, LIVE_KEY)) ?? "null")?.liveMatch;
    expect(live).toMatchObject({ formationId: "7v7-2-3-1" });
    expect(JSON.parse((await stored(page, SETUP_KEY)) ?? "null")).toMatchObject({
      status: "active",
      config: { formationId: "7v7-2-3-1" },
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    expect(await liveLineCounts(page)).toEqual([2, 3, 1]);
    expect(await stored(page, PREFS_KEY)).toBe(prefsBefore);
    expect(errors).toEqual([]);
  });

  test("one match's formation is kept as a draft without touching team defaults", async ({ page }) => {
    const errors = await open(page, "/no/match/setup", { withEndedMatch: false });
    await expectSetupFormation(page, "3-2-1");
    const prefsBefore = await stored(page, PREFS_KEY);

    await page.getByRole("button", { name: "Endre innstillinger" }).click();
    await page.getByRole("button", { name: "2-2-2", exact: true }).click();
    await expect
      .poll(async () => JSON.parse((await stored(page, SETUP_KEY)) ?? "null")?.config?.formationId)
      .toBe("7v7-2-2-2");
    expect(await stored(page, PREFS_KEY)).toBe(prefsBefore);

    // Reload: the unfinished draft is resumed and labelled as such.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Fortsetter påbegynt kampoppsett")).toBeVisible({ timeout: 30_000 });
    await expectSetupFormation(page, "2-2-2");

    await page.getByRole("button", { name: "Velg alle" }).click();
    await page.getByRole("button", { name: "Fyll automatisk" }).click();
    await page.getByRole("button", { name: /Start kamp/ }).click();
    await expect(page).toHaveURL(/\/no\/match\/live/, { timeout: 30_000 });
    expect(await liveLineCounts(page)).toEqual([2, 2, 2]);
    expect(await stored(page, PREFS_KEY)).toBe(prefsBefore);
    expect(errors).toEqual([]);
  });

  test("starting over from team defaults discards only the draft", async ({ page }) => {
    const errors = await open(page, "/no/match/setup", { withEndedMatch: false });
    await expectSetupFormation(page, "3-2-1");
    await page.getByRole("button", { name: "Velg alle" }).click();
    await expect.poll(async () => JSON.parse((await stored(page, SETUP_KEY)) ?? "null")?.status).toBe("draft");
    const prefsBefore = await stored(page, PREFS_KEY);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Starter du nytt, forkastes dette oppsettet.")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Forkast og start nytt fra lagstandard" }).click();

    await expect(page.getByText("Fortsetter påbegynt kampoppsett")).toHaveCount(0);
    await expectSetupFormation(page, "3-2-1");
    await expect(page.getByRole("button", { name: /Start kamp/ })).toBeDisabled();
    expect(await stored(page, SETUP_KEY)).toBeNull();
    expect(await stored(page, PREFS_KEY)).toBe(prefsBefore);
    expect(errors).toEqual([]);
  });

  test("opening the lineup after an ended match does not revive it as a draft", async ({ page }) => {
    const errors = await open(page, "/no/lineup", { withEndedMatch: true });
    await expect(page.getByRole("heading", { name: "Lagoppstilling" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Plass 1" })).toBeVisible();
    const setupBefore = await stored(page, SETUP_KEY);
    expect(JSON.parse(setupBefore ?? "null")).toMatchObject({ status: "ended", config: { id: "setup-previous" } });

    await page.goto("/no/match/setup", { waitUntil: "domcontentloaded" });
    await expectSetupFormation(page, "3-2-1");
    await expect(page.getByText("Fortsetter påbegynt kampoppsett")).toHaveCount(0);
    expect(await stored(page, SETUP_KEY)).toBe(setupBefore);
    expect(errors).toEqual([]);
  });
});
