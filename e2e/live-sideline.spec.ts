import { expect, test, type Page, type TestInfo } from "@playwright/test";

// FP-MS001: Modern Sideline live screen, behind the live-UI flag.
// Seeds a guest team and an active match setup in localStorage, turns the
// flag on for this browser only (dev override), and drives the real
// MatchLiveManager. Checks the layout invariants from FINAL-VALIDATION.md and
// saves a screenshot of every state to test-results/live-sideline/.

const THEMES = {
  light: { canvas: "rgb(249, 250, 248)" },
  dark: { canvas: "rgb(18, 27, 22)" },
} as const;
type Theme = keyof typeof THEMES;

const NAMES = [
  "Frida Berg", "Ida Ruud", "Selma Lie", "Vilde Moe", "Maja Dahl", "Nora Hagen", "Emma Hansen",
  "Thea Strand", "Ingrid Lund", "Sofie Bakke", "Mathilde Vik", "Hedda Aas", "Tiril Holm",
  "Aurora Sand", "Live Brekke", "Julie Næss",
];

const FORMATS = {
  "7v7": { formationId: "7v7-2-3-1", preset: "2x20", minutesPerHalf: 20, players: 11, field: 7 },
  "11v11": { formationId: "11v11-4-3-3", preset: "2x30", minutesPerHalf: 30, players: 16, field: 11 },
} as const;
type Format = keyof typeof FORMATS;

function seed(format: Format) {
  const spec = FORMATS[format];
  const now = "2026-10-14T10:00:00.000Z";
  const players = NAMES.slice(0, spec.players).map((name, index) => ({
    id: `p${index + 1}`,
    name,
    // One player without a shirt number shows initials on the disc.
    ...(index === 3 ? {} : { number: index + 1 }),
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: now,
    updatedAt: now,
  }));
  const ids = players.map((player) => player.id);
  const starters = ids.slice(0, spec.field);
  const slotAssignments = Object.fromEntries(starters.map((id, index) => [`${format}-${index + 1}`, id]));

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
        id: `setup-e2e-${format}`,
        teamId: "team-e2e",
        format,
        reportEnabled: false,
        formationId: spec.formationId,
        duration: {
          mode: "preset",
          presetId: spec.preset,
          halves: 2,
          minutesPerHalf: spec.minutesPerHalf,
          totalMinutes: spec.minutesPerHalf * 2,
        },
        selectedPlayerIds: ids,
        startingPlayerIds: starters,
        slotAssignments,
        createdAt: now,
        updatedAt: now,
      },
    },
  };
}

async function openLive(page: Page, format: Format, theme: Theme) {
  const errors: string[] = [];
  const foreignFonts: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const type = request.resourceType();
    if ((type === "font" || type === "stylesheet") && !request.url().startsWith("http://localhost")) {
      foreignFonts.push(request.url());
    }
  });

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
  // The Next.js dev-tools badge only exists under `next dev` and would sit
  // over the first bench tile; hide it so it neither blocks taps nor shows up
  // in the screenshots.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
  return { errors, foreignFonts };
}

/** Layout invariants from FINAL-VALIDATION.md, evaluated in the page. */
async function audit(page: Page) {
  // Let short transitions (strip, sheet, land) finish; the undo and scorer
  // countdowns are long-running and carry information, so they are skipped.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number(animation.effect?.getTiming().duration ?? 0) < 1000)
        .map((animation) => animation.finished.catch(() => undefined))
    )
  );
  return page.evaluate(() => {
    const problems: string[] = [];
    const root = document.querySelector<HTMLElement>('[data-testid="live-sideline"]')!;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rectOf = (el: Element) => el.getBoundingClientRect();
    const label = (el: Element) =>
      el.getAttribute("aria-label") ?? el.getAttribute("data-testid") ?? el.textContent?.trim().slice(0, 30) ?? el.tagName;

    if (document.documentElement.scrollWidth > vw) problems.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${vw})`);
    if (root.scrollHeight > root.clientHeight + 1) problems.push(`live screen scrolls (${root.scrollHeight} > ${root.clientHeight})`);

    // Every critical control is on screen and not covered by anything else.
    const sheetOpen = Boolean(root.querySelector('[role="dialog"]'));
    const critical = [
      ...root.querySelectorAll<HTMLElement>(
        '[data-testid="live-clock"], [data-testid="live-score"], [data-live-menu], header button, [data-testid="live-strip"] button, [data-bench-player-id]'
      ),
    ];
    const tokens = [...root.querySelectorAll<HTMLElement>("[data-player-id]")];
    for (const el of [...critical, ...tokens]) {
      const r = rectOf(el);
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) {
        problems.push(`off screen: ${label(el)} ${JSON.stringify([r.left, r.top, r.right, r.bottom].map(Math.round))}`);
        continue;
      }
      if (sheetOpen) continue;
      const probe = el.hasAttribute("data-player-id") ? rectOf(el.firstElementChild!) : r;
      const hit = document.elementFromPoint(probe.left + probe.width / 2, probe.top + probe.height / 2);
      if (!hit || !el.contains(hit)) problems.push(`covered: ${label(el)} by ${hit?.className ?? "nothing"}`);
    }

    // Hit areas ≥ 44px (tokens ≥ 52 wide), visible buttons only.
    for (const el of root.querySelectorAll<HTMLElement>("button, a[href]")) {
      const r = rectOf(el);
      if (r.width === 0 || r.height === 0) continue;
      const minW = el.hasAttribute("data-player-id") ? 52 : 44;
      if (r.width < minW - 0.5 || r.height < 44 - 0.5) {
        problems.push(`small target ${Math.round(r.width)}×${Math.round(r.height)}: ${label(el)}`);
      }
    }

    // Text ≥ 13px everywhere, names ≥ 14px.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let minText = Infinity;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!node.textContent?.trim() || !parent || parent.closest(".sr-only")) continue;
      const r = parent.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const size = parseFloat(getComputedStyle(parent).fontSize);
      minText = Math.min(minText, size);
      if (size < 13) problems.push(`text ${size}px: "${node.textContent.trim().slice(0, 20)}"`);
    }
    for (const name of root.querySelectorAll<HTMLElement>("[data-name], [data-bench-player-id] > span:first-child")) {
      const size = parseFloat(getComputedStyle(name).fontSize);
      if (size < 14) problems.push(`name ${size}px: ${name.textContent}`);
    }

    // No token's disc or tag overlaps another token, the scoreboard or the dugout.
    const board = rectOf(root.querySelector("header")!);
    const dugout = rectOf(root.querySelector("section")!);
    const parts = tokens.map((el) => ({
      id: el.getAttribute("data-player-id"),
      boxes: [rectOf(el.firstElementChild!), rectOf(el.lastElementChild!)],
    }));
    const overlap = (a: DOMRect, b: DOMRect) =>
      a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2;
    for (let i = 0; i < parts.length; i += 1) {
      for (const box of parts[i].boxes) {
        if (box.top < board.bottom - 1) problems.push(`token ${parts[i].id} under the scoreboard`);
        if (box.bottom > dugout.top + 1) problems.push(`token ${parts[i].id} under the dugout`);
        for (let j = i + 1; j < parts.length; j += 1) {
          if (parts[j].boxes.some((other) => overlap(box, other))) problems.push(`tokens ${parts[i].id} and ${parts[j].id} overlap`);
        }
      }
    }

    // No name or strip line is cut with an ellipsis (FP-MS001 review). A tag
    // only shortens the first name, so that is the part to check.
    // Measured on the laid-out text, because scrollWidth rounds away the
    // sub-pixel overflow that is already enough to trigger an ellipsis.
    const clipped = (el: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().width > el.getBoundingClientRect().width + 0.25;
    };
    const truncated = [...root.querySelectorAll<HTMLElement>("[data-name] > :first-child")]
      .filter(clipped)
      .map((part) => part.parentElement!.textContent);
    for (const name of truncated) problems.push(`name cut: ${name}`);
    for (const line of root.querySelectorAll<HTMLElement>('[data-testid="live-strip"] :is(small, b)')) {
      if (clipped(line)) problems.push(`strip line cut: "${line.textContent}"`);
    }

    const pitch = root.querySelector<HTMLElement>('[role="group"]')!;
    return {
      problems,
      minText,
      truncated,
      pitchHeight: Math.round(rectOf(pitch).height),
      dugoutBg: getComputedStyle(root.querySelector("section")!).backgroundColor,
      clockFont: getComputedStyle(root.querySelector('[data-testid="live-clock"] b')!).fontFamily,
    };
  });
}

async function snap(page: Page, testInfo: TestInfo, name: string) {
  await page.waitForTimeout(400); // let the 220ms strip and 260ms sheet transitions settle
  await page.screenshot({ path: `test-results/live-sideline/${testInfo.project.name}-${name}.png` });
}

for (const format of Object.keys(FORMATS) as Format[]) {
  for (const theme of Object.keys(THEMES) as Theme[]) {
    test(`live sideline ${format} ${theme}: kickoff, goal, substitution, undo, half-time`, async ({ page }, testInfo) => {
      const { errors, foreignFonts } = await openLive(page, format, theme);
      const strip = page.getByTestId("live-strip");
      const tag = `${format}-${theme}`;

      // Pre-kickoff: goal keys are disabled, the strip offers kickoff.
      await expect(strip).toHaveAttribute("data-strip", "kickoff");
      await expect(page.getByRole("button", { name: "Mål for oss", exact: true })).toBeDisabled();
      let result = await audit(page);
      expect(result.problems, "kickoff layout").toEqual([]);
      expect(result.dugoutBg).toBe(THEMES[theme].canvas);
      expect(result.clockFont).toMatch(/barlow/i);
      expect(result.minText).toBeGreaterThanOrEqual(13);
      await snap(page, testInfo, `${tag}-1-kickoff`);

      // Mid-half: 12 minutes in, one goal for us.
      await page.getByRole("button", { name: "Avspark", exact: true }).click();
      await page.clock.fastForward("12:00");
      await page.getByRole("button", { name: "Mål for oss", exact: true }).click();
      await expect(page.getByTestId("live-score")).toHaveAttribute("aria-label", "Stilling: oss 1, dem 0");
      await expect(strip).not.toHaveAttribute("data-strip", "kickoff");
      result = await audit(page);
      expect(result.problems, "mid-half layout").toEqual([]);
      await snap(page, testInfo, `${tag}-2-mid`);

      // Selection: tap a field player (not the keeper).
      const outgoing = page.locator('[data-player-id="p3"]');
      await outgoing.click();
      await expect(strip).toHaveAttribute("data-strip", "selection");
      await expect(outgoing).toHaveAttribute("aria-pressed", "true");
      result = await audit(page);
      expect(result.problems, "selected layout").toEqual([]);
      await snap(page, testInfo, `${tag}-3-selected`);

      // Substitution: tap a bench player, then the 5 s undo is offered.
      const incomingId = `p${FORMATS[format].field + 1}`;
      await page.locator(`[data-bench-player-id="${incomingId}"]`).click();
      await expect(strip).toHaveAttribute("data-strip", "undo");
      await expect(page.locator(`[data-player-id="${incomingId}"]`)).toBeVisible();
      result = await audit(page);
      expect(result.problems, "undo layout").toEqual([]);
      await snap(page, testInfo, `${tag}-4-undo`);

      await page.getByRole("button", { name: /Angre bytte/ }).click();
      await expect(page.locator('[data-player-id="p3"]')).toBeVisible();
      await expect(page.locator(`[data-bench-player-id="${incomingId}"]`)).toBeVisible();

      // Menu sheet.
      await page.getByRole("button", { name: "Kampmeny" }).click();
      await expect(page.getByRole("dialog", { name: "Kampmeny" })).toBeVisible();
      expect((await audit(page)).problems, "menu layout").toEqual([]);
      await snap(page, testInfo, `${tag}-5-menu`);

      // End the half through the confirmation.
      await page.getByRole("button", { name: "Avslutt omgang", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Avslutte 1. omgang?" })).toBeVisible();
      await page.getByRole("button", { name: "Ja, avslutt omgangen" }).click();
      await expect(strip).toHaveAttribute("data-strip", "halfTime");
      await expect(page.getByRole("button", { name: "Mål for oss", exact: true })).toBeDisabled();
      result = await audit(page);
      expect(result.problems, "half-time layout").toEqual([]);
      await snap(page, testInfo, `${tag}-6-halftime`);

      // Second half: the view reads the corrected phase (FP-MATCH-001).
      await page.getByRole("button", { name: "Start 2. omgang", exact: true }).click();
      await expect(strip).not.toHaveAttribute("data-strip", "halfTime");
      await expect(page.getByTestId("live-clock")).toContainText("2. omgang");
      await expect(page.getByRole("button", { name: "Mål for oss", exact: true })).toBeEnabled();
      result = await audit(page);
      expect(result.problems, "second-half layout").toEqual([]);
      await snap(page, testInfo, `${tag}-7-second-half`);

      testInfo.annotations.push({
        type: "layout",
        description: `pitch ${result.pitchHeight}px; truncated names: ${result.truncated.join(", ") || "none"}`,
      });
      expect(foreignFonts, "fonts and styles are served from the app").toEqual([]);
      expect(errors, "uncaught page errors").toEqual([]);
    });
  }
}

test("reduced motion keeps the undo countdown and collapses other motion", async ({ page }) => {
  await openLive(page, "7v7", "light");
  await page.getByRole("button", { name: "Avspark", exact: true }).click();
  await page.locator('[data-player-id="p3"]').click();
  await page.locator('[data-bench-player-id="p8"]').click();
  const timings = await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="live-strip"]')!;
    const drain = strip.querySelector(":scope > span:last-child")!;
    return {
      strip: getComputedStyle(strip).animationDuration,
      drain: getComputedStyle(drain).animationDuration,
    };
  });
  expect(timings.strip).toBe("0.001s");
  expect(timings.drain).toBe("5s");
});

test("the existing live view stays the default without the flag", async ({ page }) => {
  await page.addInitScript((data) => {
    localStorage.setItem("fairplayr.teams.v2", JSON.stringify(data.workspace));
    localStorage.setItem("fairplayr.matchSetup.v1", JSON.stringify(data.setup));
  }, seed("7v7"));
  await page.goto("/no/match/live", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Start kamp" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("live-sideline")).toHaveCount(0);
});
