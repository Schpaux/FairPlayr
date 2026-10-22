import { expect, test, type Page } from "@playwright/test";

// C1 (UI-MS-01a + U9): a new setup suggests the whole squad but leaves the
// pitch empty, Start stays visible in the sticky bar and is disabled until the
// coach fills the lineup, and a stored draft is resumed exactly as saved.
// Synthetic guest data only, no network needed.

const NOW = "2026-10-22T10:00:00.000Z";
const SETUP_KEY = "fairplayr.matchSetup.v1";
const NAMES = ["Frida", "Ida", "Selma", "Vilde", "Maja", "Nora", "Emma", "Thea", "Ingrid"];

const players = NAMES.map((name, index) => ({
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

const workspace = {
  version: 2,
  teams: [{ id: "team-e2e", name: "Lyn G12", players, createdAt: NOW, updatedAt: NOW }],
  activeTeamId: "team-e2e",
};

// A draft the coach left with five players and nobody on the pitch.
const draft = {
  version: 2,
  status: "draft",
  serverMatchId: null,
  config: {
    id: "setup-draft",
    teamId: "team-e2e",
    format: "7v7",
    reportEnabled: false,
    formationId: "7v7-2-3-1",
    duration: { mode: "preset", presetId: "2x20", halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
    selectedPlayerIds: ["p1", "p2", "p3", "p4", "p5"],
    startingPlayerIds: [],
    slotAssignments: {},
    createdAt: NOW,
    updatedAt: NOW,
  },
};

async function open(page: Page, { theme, setup }: { theme: "light" | "dark"; setup?: unknown }) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.addInitScript(
    (data) => {
      if (sessionStorage.getItem("fp-e2e-seeded")) return;
      sessionStorage.setItem("fp-e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem("theme", data.theme);
      localStorage.setItem("fairplayr.liveUi", "sideline");
      localStorage.setItem("fairplayr.teams.v2", JSON.stringify(data.workspace));
      localStorage.setItem(
        "fairplayr.teamPrefs.v1",
        JSON.stringify({ "team-e2e": { format: "7v7", formationId: "7v7-2-3-1", durationPresetId: "2x20" } })
      );
      if (data.setup) localStorage.setItem("fairplayr.matchSetup.v1", JSON.stringify(data.setup));
    },
    { theme, workspace, setup: setup ?? null }
  );

  await page.goto("/no/match/setup", { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  return errors;
}

const squadTile = (page: Page, name: string) =>
  page.getByRole("list", { name: "Hvem er med i dag?" }).getByRole("button", { name, exact: true });
const startButton = (page: Page) => page.getByRole("button", { name: "Start kamp" });
const bar = (page: Page) => page.getByTestId("setup-start-bar");

async function expectInViewport(page: Page) {
  const box = await startButton(page).boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`C1 setup (${theme})`, () => {
    test("new setup suggests the squad, leaves the pitch empty and keeps Start visible", async ({ page }) => {
      const errors = await open(page, { theme });

      await expect(page.getByRole("heading", { level: 1, name: "Kampoppsett" })).toBeVisible();
      // No «Aktivt lag» card in the page (the header's team picker keeps its label).
      await expect(page.getByRole("main").getByText("Aktivt lag")).toHaveCount(0);

      for (const name of NAMES) {
        await expect(squadTile(page, name)).toHaveAttribute("aria-pressed", "true");
      }
      await expect(bar(page)).toContainText("9 i troppen");
      await expect(bar(page)).toContainText("0/7 på banen");
      await expect(bar(page)).toContainText("Ikke klar");
      await expect(page.locator("[data-slot-id][data-player-id]")).toHaveCount(0);

      // Start is in the sticky bar: visible without scrolling, but disabled.
      await expect(startButton(page)).toBeDisabled();
      await expectInViewport(page);

      // Settings are collapsed by default.
      await expect(page.getByRole("button", { name: "Endre innstillinger" })).toHaveAttribute("aria-expanded", "false");

      // A suggestion is not a decision: nothing is stored before the coach acts.
      expect(await page.evaluate((key) => localStorage.getItem(key), SETUP_KEY)).toBeNull();
      expect(errors).toEqual([]);
    });

    test("an absent player leaves the squad and the lineup can be filled by tap", async ({ page }) => {
      await open(page, { theme });

      await squadTile(page, "Nora").click();
      await expect(squadTile(page, "Nora")).toHaveAttribute("aria-pressed", "false");
      await expect(squadTile(page, "Nora")).toContainText("Borte");
      await expect(bar(page)).toContainText("8 i troppen");

      // Tap-to-place: a bench player, then a slot.
      const pitch = page.getByTestId("setup-pitch");
      const bench = (name: string) => pitch.locator("..").getByRole("button", { name, exact: true });
      await expect(bench("Nora")).toHaveCount(0);
      await bench("Thea").click();
      await page.locator('[data-slot-id="7v7-1"]').click();
      await expect(page.locator('[data-slot-id="7v7-1"]')).toHaveAttribute("data-player-id", "p8");
      await expect(bar(page)).toContainText("1/7 på banen");
      await expect(startButton(page)).toBeDisabled();

      await page.getByRole("button", { name: "Fyll automatisk" }).click();
      await expect(bar(page)).toContainText("7/7 på banen");
      await expect(bar(page)).toContainText("Klar");
      await expect(startButton(page)).toBeEnabled();
      await expect(page.locator('[data-slot-id][data-player-id="p6"]')).toHaveCount(0);
      await expectInViewport(page);

      // The first edit stores the coach's explicit squad, without Nora.
      const stored = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), SETUP_KEY)) ?? "null");
      expect(stored?.status).toBe("draft");
      expect(stored?.config.selectedPlayerIds).not.toContain("p6");
      expect(stored?.config.selectedPlayerIds).toHaveLength(8);
    });

    test("a stored draft is resumed exactly, without new players or starters", async ({ page }) => {
      await open(page, { theme, setup: draft });

      await expect(page.getByText("Fortsetter påbegynt kampoppsett")).toBeVisible();
      for (const [index, name] of NAMES.entries()) {
        await expect(squadTile(page, name)).toHaveAttribute("aria-pressed", index < 5 ? "true" : "false");
      }
      await expect(bar(page)).toContainText("5 i troppen");
      await expect(bar(page)).toContainText("0/7 på banen");
      await expect(startButton(page)).toBeDisabled();

      const stored = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), SETUP_KEY)) ?? "null");
      expect(stored).toEqual(draft);
    });
  });
}
