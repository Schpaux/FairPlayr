import { expect, test, type Page } from "@playwright/test";

// C2 (UI-MS-01b + UI-NAV-01): Home is one club-green fixture panel with the
// screen's only lime action; the bottom nav has four tabs with a solid lime
// pill; settings are reached through the profile menu. Guest mode with
// synthetic data. The signed-in season stats (incl. "Ingen data",
// UI-HOME-NODATA-01) are covered by `HomeSeasonSummary.test.tsx`.

const NOW = "2026-10-14T10:00:00.000Z";

function workspace() {
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
  return {
    version: 2,
    teams: [{ id: "team-a", name: "Lyn G12", players, createdAt: NOW, updatedAt: NOW }],
    activeTeamId: "team-a",
  };
}

function setup() {
  const ids = workspace().teams[0].players.map((p) => p.id);
  const starters = ids.slice(0, 5);
  return {
    version: 2,
    status: "active",
    serverMatchId: null,
    config: {
      id: "setup-e2e-c2",
      teamId: "team-a",
      format: "5v5",
      reportEnabled: false,
      formationId: "5v5-2-2",
      duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
      selectedPlayerIds: ids,
      startingPlayerIds: starters,
      slotAssignments: Object.fromEntries(starters.map((id, index) => [`5v5-${index + 1}`, id])),
      createdAt: NOW,
      updatedAt: NOW,
    },
  };
}

async function seed(page: Page, options: { team?: boolean; setup?: boolean } = {}) {
  await page.addInitScript(
    (data) => {
      if (sessionStorage.getItem("fp-e2e-seeded")) return;
      sessionStorage.setItem("fp-e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem("fairplayr.liveUi", "sideline");
      if (data.workspace) localStorage.setItem("fairplayr.teams.v2", JSON.stringify(data.workspace));
      if (data.setup) localStorage.setItem("fairplayr.matchSetup.v1", JSON.stringify(data.setup));
    },
    { workspace: options.team ? workspace() : null, setup: options.setup ? setup() : null }
  );
}

/** Records every non-GET request: Home and the nav must not write anything. */
function recordWrites(page: Page) {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(`${request.method()} ${request.url()}`);
  });
  return writes;
}

async function openHome(page: Page) {
  await page.goto("/no", { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await expect(page.getByTestId("home-fixture-panel")).toBeVisible({ timeout: 30_000 });
}

const lime = "rgb(159, 232, 112)";
const onLime = "rgb(11, 46, 26)";
const club = "rgb(14, 77, 51)";

for (const theme of ["dark", "light"] as const) {
  test.describe(`C2 Home and nav, ${theme}`, () => {
    test.use({ colorScheme: theme });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
    });

    test("the bottom nav has four tabs, a solid lime pill and readable 44px targets", async ({ page }) => {
      const writes = recordWrites(page);
      await seed(page, { team: true });
      await openHome(page);

      const nav = page.getByRole("navigation").last();
      const tabs = nav.getByRole("link");
      await expect(tabs).toHaveText(["Hjem", "Spillere", "Kamp", "Historikk"]);
      await expect(nav.getByRole("link", { name: "Innstillinger" })).toHaveCount(0);

      for (const tab of await tabs.all()) {
        const box = await tab.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
        const label = tab.locator("span span");
        expect(parseFloat(await label.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
      }

      const current = nav.getByRole("link", { name: "Hjem" });
      await expect(current).toHaveAttribute("aria-current", "page");
      const pill = current.locator("> span");
      await expect(pill).toHaveCSS("background-color", lime);
      await expect(pill).toHaveCSS("color", onLime);
      await expect(nav.getByRole("link", { name: "Spillere" }).locator("> span")).not.toHaveCSS("background-color", lime);
      expect(await nav.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe("none");

      await nav.getByRole("link", { name: "Spillere" }).click();
      await expect(page).toHaveURL(/\/no\/team/);
      await expect(nav.getByRole("link", { name: "Spillere" })).toHaveAttribute("aria-current", "page");
      await expect(nav.getByRole("link", { name: "Spillere" }).locator("> span")).toHaveCSS("background-color", lime);
      expect(writes).toEqual([]);
    });

    test("settings are reached through the profile menu", async ({ page }) => {
      await seed(page, { team: true });
      await openHome(page);
      // A click before hydration does nothing; repeat until the sheet is open.
      await expect(async () => {
        await page.getByRole("button", { name: "Åpne profilmeny" }).click();
        await expect(page.getByTestId("profile-menu")).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      await page.getByTestId("profile-menu").getByRole("link", { name: "Innstillinger" }).click();
      await expect(page).toHaveURL(/\/no\/settings/);
    });

    test("Home is one club-green panel with one lime action, and no hero leftovers", async ({ page }) => {
      const writes = recordWrites(page);
      await seed(page, { team: true });
      await openHome(page);

      const panel = page.getByTestId("home-fixture-panel");
      await expect(panel).toHaveCSS("background-color", club);
      await expect(panel).toHaveAttribute("data-state", "setup");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ingen kamp planlagt");
      const action = page.getByTestId("home-primary-action");
      await expect(action).toHaveText("Sett opp kamp");
      await expect(action).toHaveAttribute("href", "/no/match/setup");
      expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);

      // Exactly one lime fill in the page content.
      const limeFills = await page.locator("main *").evaluateAll(
        (els, color) => els.filter((el) => getComputedStyle(el).backgroundColor === color).length,
        lime
      );
      expect(limeFills).toBe(1);

      await expect(page.getByRole("button", { name: "Varsler" })).toHaveCount(0);
      await expect(page.getByText(/Vårsesong|Alle barn/)).toHaveCount(0);
      // Guests see no season stats.
      await expect(page.getByTestId("home-season-summary")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      await action.click();
      await expect(page).toHaveURL(/\/no\/match\/setup/);
      expect(writes).toEqual([]);
    });

    test("without a team, the one action creates the team first", async ({ page }) => {
      await seed(page);
      await openHome(page);
      await expect(page.getByTestId("home-fixture-panel")).toHaveAttribute("data-state", "no-team");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kom i gang");
      await expect(page.getByTestId("home-primary-action")).toHaveAttribute("href", "/no/team");
    });

    test("a running match takes over the panel; elsewhere the banner is club green and static", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("dialog", (dialog) => void dialog.accept());
      await seed(page, { team: true, setup: true });

      await page.goto("/no/match/live", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
      await page.getByRole("button", { name: "Avspark", exact: true }).click();
      await page.getByRole("button", { name: "Kampmeny" }).click();
      await page.getByRole("link", { name: "Til forsiden – kampen fortsetter" }).click();
      await expect(page).toHaveURL(/\/no\/?$/);

      const panel = page.getByTestId("home-fixture-panel");
      await expect(panel).toHaveAttribute("data-state", "live", { timeout: 30_000 });
      await expect(panel).toContainText("Kamp pågår");
      // One way in: the panel's action, no banner competing with it.
      const entries = page.getByRole("link", { name: /Kamp pågår/ });
      await expect(entries).toHaveCount(1);
      await expect(entries).toHaveText("Fortsett kampen");
      await expect(entries).toHaveAttribute("href", "/no/match/live");
      await expect(page.getByRole("link", { name: "Sett opp kamp" })).toHaveCount(0);

      await page.getByRole("navigation").last().getByRole("link", { name: "Historikk" }).click();
      await expect(page).toHaveURL(/\/no\/historikk/);
      const banner = page.getByRole("link", { name: /Kamp pågår/ });
      await expect(banner).toBeVisible({ timeout: 30_000 });
      await expect(banner).toHaveCSS("background-color", club);
      await expect(banner).toHaveCSS("animation-name", "none");

      await banner.click();
      await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
      expect(errors).toEqual([]);
    });
  });
}
