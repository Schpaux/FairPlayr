import { expect, test, type Page } from "@playwright/test";
import no from "../messages/no.json";

// B2 (UI-A11Y-02, MATCH-03, UI-A11Y-03, UI-VIEWPORT-01) in a real browser, in
// both themes at every project viewport, as a guest with a local team:
// - deletions are confirmed in a sheet that states the consequence, with the
//   focus trap, Escape and focus return of the shared Sheet;
// - the profile menu and the lineup picker are modal sheets;
// - no link wraps a button anywhere outside Live;
// - text fields are 16px, and reduced motion is honoured app-wide.
// Screenshots go to test-results/b2/.

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const NAMES = ["Emma", "Selma", "Nora"];

function workspace() {
  const now = "2026-10-20T10:00:00.000Z";
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
  return {
    version: 2,
    teams: [{ id: "team-b2", name: "Lyn G12", players, createdAt: now, updatedAt: now }],
    activeTeamId: "team-b2",
  };
}

async function open(page: Page, path: string, theme: Theme) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    ({ data, theme }) => {
      if (sessionStorage.getItem("fp-e2e-seeded")) return;
      sessionStorage.setItem("fp-e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem("theme", theme);
      localStorage.setItem("fairplayr.teams.v2", JSON.stringify(data));
    },
    { data: workspace(), theme },
  );
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main :is(h1, h2)").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  return errors;
}

function shot(page: Page, project: string, theme: Theme, name: string) {
  return page.screenshot({ path: `test-results/b2/${project}-${theme}-${name}.png` });
}

// base-ui wraps the trap in hidden focus guards; poll for the settled position.
const focusedInside = (page: Page, testId: string) =>
  page.evaluate((id) => !!document.querySelector(`[data-testid="${id}"]`)?.contains(document.activeElement), testId);

async function expectTrapped(page: Page, testId: string) {
  for (const key of ["Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    await expect.poll(() => focusedInside(page, testId)).toBe(true);
  }
}

for (const theme of THEMES) {
  test.describe(`B2, ${theme}`, () => {
    test("deleting a player is confirmed; Escape keeps the player and returns focus", async ({ page }, testInfo) => {
      const errors = await open(page, "/no/team", theme);
      const players = page.getByRole("main");
      await expect(players.getByText(/^\d+\. Emma$/)).toBeVisible();

      const trigger = page.getByRole("button", { name: no.common.delete }).first();
      await trigger.click();
      const sheet = page.getByRole("dialog", { name: "Slette Emma?" });
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveAccessibleDescription("Emma fjernes fra spillerlisten til laget. Dette kan ikke angres.");
      await expect(page.getByRole("heading", { name: "Slette Emma?" })).toBeFocused();
      await shot(page, testInfo.project.name, theme, "delete-player");
      await expectTrapped(page, "delete-confirm");

      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(players.getByText(/^\d+\. Emma$/)).toBeVisible();

      await trigger.click();
      await sheet.getByRole("button", { name: no.team.deletePlayerConfirm.confirm }).click();
      await expect(sheet).toBeHidden();
      // The row (and its trigger) is gone, so focus moves to the add-player field.
      await expect(page.locator("#player-name-input")).toBeFocused();
      await expect(players.getByText(/^\d+\. Emma$/)).toHaveCount(0);
      await expect(players.getByText(/^\d+\. Selma$/)).toBeVisible();
      expect(errors).toEqual([]);
    });

    test("deleting the team states what is lost, and Avbryt keeps it", async ({ page }, testInfo) => {
      await open(page, "/no/team", theme);
      await page.getByRole("button", { name: no.team.teamSettings }).click();
      await page.getByRole("button", { name: no.team.actions.deleteTeam }).click();

      const sheet = page.getByRole("dialog", { name: "Slette Lyn G12?" });
      await expect(sheet).toHaveAccessibleDescription(
        "Laget og alle 3 spillerne slettes fra denne enheten. Dette kan ikke angres."
      );
      await shot(page, testInfo.project.name, theme, "delete-team");
      await sheet.getByRole("button", { name: no.ui.confirm.cancel }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByRole("heading", { level: 1, name: "Lyn G12" })).toBeVisible();
    });

    test("the profile menu is a modal sheet with a focus trap", async ({ page }, testInfo) => {
      await open(page, "/no", theme);
      const trigger = page.getByRole("button", { name: no.profileMenu.open });
      const sheet = page.getByRole("dialog", { name: no.profileMenu.title });
      // The header is server-rendered; retry until hydration wires the click.
      await expect(async () => {
        await trigger.click();
        await expect(sheet).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 15_000 });
      await expect(sheet.getByRole("link", { name: no.auth.actions.signIn })).toBeVisible();
      await shot(page, testInfo.project.name, theme, "profile-menu");
      await expectTrapped(page, "profile-menu");

      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(trigger).toBeFocused();
    });

    test("the lineup picker is a modal sheet", async ({ page }, testInfo) => {
      await open(page, "/no/lineup", theme);
      const slot = page.getByRole("main").getByRole("button", { name: /^Plass / }).first();
      await slot.click();

      const sheet = page.getByRole("dialog", { name: no.lineup.picker.title });
      await expect(sheet).toBeVisible();
      await shot(page, testInfo.project.name, theme, "lineup-picker");
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(slot).toBeFocused();
    });

    test("no link wraps a button outside Live", async ({ page }) => {
      await open(page, "/no", theme);
      for (const path of ["/no", "/no/team", "/no/match", "/no/match/setup", "/no/lineup", "/no/historikk", "/no/settings", "/no/auth/sign-in", "/no/auth/sign-up"]) {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await expect(page.locator("main :is(h1, h2)").first()).toBeVisible({ timeout: 30_000 });
        await expect(page.locator("a button, a [role=button], button a, button button"), path).toHaveCount(0);
        if (path === "/no/match/setup" || path === "/no/auth/sign-in" || path === "/no/auth/sign-up") {
          const sizes = await page
            .locator("main input:not([type=checkbox]):not([type=radio]), main select")
            .evaluateAll((fields) => fields.map((field) => getComputedStyle(field).fontSize));
          expect(sizes.every((size) => size === "16px"), `${path}: ${sizes.join(", ")}`).toBe(true);
        }
      }
    });

    test("text fields are 16px, so iOS does not zoom on focus", async ({ page }) => {
      await open(page, "/no/team", theme);
      const sizes = await page
        .locator("main input:not([type=checkbox]):not([type=radio]), main select, header select")
        .evaluateAll((fields) => fields.map((field) => getComputedStyle(field).fontSize));
      expect(sizes.length).toBeGreaterThan(0);
      expect(new Set(sizes)).toEqual(new Set(["16px"]));
    });

    test("reduced motion: transitions are off app-wide", async ({ page }) => {
      // playwright.config.ts emulates reduced motion for every test.
      await open(page, "/no/team", theme);
      const duration = await page
        .getByRole("button", { name: no.team.teamSettings })
        .evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(duration).toBe("0s");
    });
  });
}

test.describe("without reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("transitions keep their duration", async ({ page }) => {
    await open(page, "/no/team", "dark");
    const duration = await page
      .getByRole("button", { name: no.team.teamSettings })
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).not.toBe("0s");
  });
});
