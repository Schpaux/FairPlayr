import { expect, test, type Page, type TestInfo } from "@playwright/test";

// A1 (MATCH-09 + FEAT-NAME-01) on the Modern Sideline live screen:
// - no suggestion at 0′ vs 0′ after kick-off, none below a 4′ gap, and the
//   keeper is never suggested;
// - the DESIGN.md §5.2 name ladder on pitch and bench ("Emma Hau" / "Emma Han",
//   the shirt number only for identical names), never cut in the part that
//   tells players apart.
// Soft assertions, so every step is photographed even when one fails:
// test-results/live-a1/<FP_SHOT_TAG or "after">/…

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const SHOT_TAG = process.env.FP_SHOT_TAG ?? "after";

const FORMATS = {
  "7v7": { formationId: "7v7-2-3-1", field: 7 },
  "3v3": { formationId: "3v3-balanced", field: 3 },
} as const;
type Format = keyof typeof FORMATS;

// p1 starts in the keeper slot. Two "Emma H…", two "Ida R…", and two players
// with the identical full name "Emma Hansen" (shirts 3 and 12).
const SQUAD: Array<{ name: string; number?: number }> = [
  { name: "Frida Berg", number: 1 },
  { name: "Emma Haugen", number: 2 },
  { name: "Emma Hansen", number: 3 },
  { name: "Ida Ruud" },
  { name: "Ida Rønning", number: 5 },
  { name: "Thea Solberg", number: 6 },
  { name: "Selma Lie", number: 7 },
  { name: "Emma Hansen", number: 12 },
  { name: "Nora Hagen", number: 9 },
  { name: "Maja Dahl", number: 10 },
  { name: "Vilde Moe", number: 11 },
];

function seed(format: Format) {
  const spec = FORMATS[format];
  const now = "2026-10-14T10:00:00.000Z";
  const players = SQUAD.slice(0, format === "3v3" ? 6 : SQUAD.length).map((player, index) => ({
    id: `p${index + 1}`,
    ...player,
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: now,
    updatedAt: now,
  }));
  const ids = players.map((player) => player.id);
  const starters = ids.slice(0, spec.field);

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
        id: `setup-e2e-a1-${format}`,
        teamId: "team-e2e",
        format,
        reportEnabled: false,
        formationId: spec.formationId,
        duration: { mode: "preset", presetId: "2x20", halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
        selectedPlayerIds: ids,
        startingPlayerIds: starters,
        slotAssignments: Object.fromEntries(starters.map((id, index) => [`${format}-${index + 1}`, id])),
        createdAt: now,
        updatedAt: now,
      },
    },
  };
}

async function openLive(page: Page, format: Format, theme: Theme) {
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
    { data: seed(format), theme }
  );

  await page.goto("/no/match/live", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
  return errors;
}

async function snap(page: Page, testInfo: TestInfo, name: string) {
  await page.waitForTimeout(400); // let the 220ms strip transition settle
  await page.screenshot({ path: `test-results/live-a1/${SHOT_TAG}/${testInfo.project.name}-${name}.png` });
}

interface TagName {
  name: string;
  firstCut: boolean;
  suffixCut: boolean;
}

/** The name on a pitch tag, its parts joined, and whether a part is cut with an ellipsis. */
async function tagNames(page: Page): Promise<Record<string, TagName>> {
  return page.evaluate(() => {
    const clipped = (el: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().width > el.getBoundingClientRect().width + 0.25;
    };
    return Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-player-id]")].map((token) => {
        const parts = [...token.querySelectorAll<HTMLElement>("[data-name] > span")];
        return [
          token.getAttribute("data-player-id"),
          {
            name: parts.map((part) => part.textContent).join(" "),
            firstCut: parts[0] ? clipped(parts[0]) : false,
            suffixCut: parts[1] ? clipped(parts[1]) : false,
          },
        ];
      })
    );
  });
}

for (const theme of THEMES) {
  test(`7v7 ${theme}: no suggestion before a 4′ gap, never the keeper; unique names on pitch and bench`, async ({ page }, testInfo) => {
    const errors = await openLive(page, "7v7", theme);
    const strip = page.getByTestId("live-strip");
    const tag = `7v7-${theme}`;

    // Names before kick-off: the shortest unique form, no "H2" suffix.
    const names = await tagNames(page);
    expect.soft(names.p1?.name).toBe("Frida");
    expect.soft(names.p2?.name).toBe("Emma Hau");
    expect.soft(names.p3?.name).toBe("Emma #3");
    expect.soft(names.p4?.name).toBe("Ida Ru");
    expect.soft(names.p5?.name).toBe("Ida Rø");
    expect.soft(names.p6?.name).toBe("Thea");
    expect.soft(Object.values(names).filter((entry) => entry.suffixCut), "distinguishing part never cut").toEqual([]);
    await expect.soft(page.locator('[data-bench-player-id="p8"]')).toContainText("Emma #12");
    await expect.soft(page.getByTestId("live-sideline")).not.toContainText(/Emma H2|Emma Han2/);
    testInfo.annotations.push({
      type: "names",
      description: Object.entries(names)
        .map(([id, entry]) => `${id}=${entry.name}${entry.firstCut ? " (first name cut)" : ""}`)
        .join(", "),
    });
    await snap(page, testInfo, `${tag}-1-names`);

    // Right after kick-off everyone has 0′: no suggestion.
    await page.getByRole("button", { name: "Avspark", exact: true }).click();
    await page.clock.fastForward("00:01");
    await expect.soft(strip).toHaveAttribute("data-strip", "idle");
    await snap(page, testInfo, `${tag}-2-kickoff`);

    // Just under the threshold: still silent.
    await page.clock.fastForward("03:57");
    await expect.soft(strip).toHaveAttribute("data-strip", "idle");

    // Past 4′: a suggestion, never the keeper (Frida, p1).
    await page.clock.fastForward("00:05");
    await expect.soft(strip).toHaveAttribute("data-strip", "suggestion");
    await expect.soft(strip).toContainText("Forslag");
    await expect.soft(strip).toContainText("Emma #12 inn for Emma Hau");
    await expect.soft(strip).not.toContainText("Frida");
    await snap(page, testInfo, `${tag}-3-suggestion`);

    // Selecting the suggestion picks the outfield player.
    await page.getByRole("button", { name: "Velg Emma Hau for bytte" }).click();
    await expect.soft(strip).toHaveAttribute("data-strip", "selection");
    await expect.soft(page.locator('[data-player-id="p2"]')).toHaveAttribute("aria-pressed", "true");
    await snap(page, testInfo, `${tag}-4-selected`);

    expect(errors, "uncaught page errors").toEqual([]);
  });
}

test("3v3 has no keeper: silent at kick-off, a suggestion after 4′", async ({ page }, testInfo) => {
  const errors = await openLive(page, "3v3", "light");
  const strip = page.getByTestId("live-strip");

  await page.getByRole("button", { name: "Avspark", exact: true }).click();
  await page.clock.fastForward("00:01");
  await expect.soft(strip).toHaveAttribute("data-strip", "idle");

  await page.clock.fastForward("04:05");
  await expect.soft(strip).toHaveAttribute("data-strip", "suggestion");
  // No keeper in 3v3: the first field player (Frida) may be suggested.
  await expect.soft(strip).toContainText("inn for Frida");
  await snap(page, testInfo, "3v3-light-suggestion");

  expect(errors, "uncaught page errors").toEqual([]);
});
