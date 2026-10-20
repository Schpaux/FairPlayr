import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import no from "../messages/no.json";
import baselineFile from "./ui-audit.baseline.json";
import {
  collectConsoleProblems,
  countsOf,
  measureUi,
  regressions,
  type AuditFindings,
  type Counts,
} from "./support/uiAudit";

// STAB-06: automatic UI guard. Every route is opened in both themes at every
// project viewport (375×667, 390×844, 360×640) and measured for:
//   - interactive elements under 44px (DESIGN.md §4, §9),
//   - text under 13px (DESIGN.md §3),
//   - lime text on a light surface (DESIGN.md §2.5),
//   - horizontal overflow,
//   - uncaught errors, console errors and hydration warnings.
//
// Known deviations from FP-UI-REVISION-2026-10 are recorded per route and
// theme in e2e/ui-audit.baseline.json (signature → highest count seen on any
// viewport). The app shell around `main` (header, team picker, bottom nav) is
// identical on every route, so it has one shared "chrome" entry per theme.
// A new signature, or more of a known one, fails the test; the
// old pages stay usable while they are rebuilt (C1–C6). The baseline may only
// shrink: when a package fixes a deviation, regenerate it (see
// e2e/support/ui-audit-baseline.mjs) and the diff shows what went away.
//
// FP_UI_AUDIT_UPDATE=1 records observations instead of asserting.

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

interface RouteBaseline {
  targets?: Counts;
  smallText?: Counts;
  limeText?: Counts;
  console?: Counts;
  overflow?: boolean;
}

interface BaselineFile {
  chrome: Partial<Record<Theme, RouteBaseline>>;
  routes: Record<string, Partial<Record<Theme, RouteBaseline>>>;
}

const baseline: BaselineFile = baselineFile;
const UPDATE = process.env.FP_UI_AUDIT_UPDATE === "1";
// Same location as e2e/support/ui-audit-baseline.mjs reads from.
const OBSERVED_DIR = path.join(__dirname, "..", "test-results", "ui-audit-observed");

interface RouteSpec {
  id: string;
  path: string;
  /** Seed an active 7v7 match (for the live screen). */
  active?: boolean;
  /** Turn on the Modern Sideline live view for this browser (dev override). */
  sideline?: boolean;
  /** Waits until the route has rendered its real content. */
  ready?: (page: Page) => Promise<void>;
  /** Moves the page into the state that is measured. */
  then?: (page: Page) => Promise<void>;
}

const liveReady = async (page: Page) => {
  await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
};
const galleryReady = async (page: Page) => {
  await expect(page.locator('[data-testid="ui-gallery"][data-hydrated="true"]')).toBeVisible({ timeout: 30_000 });
};

const ROUTES: RouteSpec[] = [
  { id: "home", path: "/no" },
  { id: "team", path: "/no/team" },
  { id: "planner", path: "/no/match" },
  { id: "setup", path: "/no/match/setup" },
  { id: "lineup", path: "/no/lineup" },
  { id: "history", path: "/no/historikk" },
  { id: "settings", path: "/no/settings" },
  { id: "signin", path: "/no/auth/sign-in" },
  { id: "signup", path: "/no/auth/sign-up" },
  { id: "live-sideline", path: "/no/match/live", active: true, sideline: true, ready: liveReady },
  {
    id: "live-sideline-menu",
    path: "/no/match/live",
    active: true,
    sideline: true,
    ready: liveReady,
    then: async (page) => {
      await page.getByRole("button", { name: no.matchLive.sideline.menu.open }).click();
      await expect(page.getByTestId("live-menu")).toBeVisible();
    },
  },
  // The legacy live view has no heading; its timer controls mean it has rendered.
  {
    id: "live-legacy",
    path: "/no/match/live",
    active: true,
    ready: async (page) => {
      await expect(page.locator("main button").first()).toBeVisible({ timeout: 30_000 });
    },
  },
  // The shared primitives (UI-FOUND-01). Their baseline is empty: any finding fails.
  { id: "gallery", path: "/no/dev/ui", ready: galleryReady },
  {
    id: "gallery-confirm",
    path: "/no/dev/ui",
    ready: galleryReady,
    then: async (page) => {
      await page.getByTestId("gallery-open-confirm").click();
      await expect(page.getByTestId("gallery-confirm")).toBeVisible();
    },
  },
];

const NAMES = [
  "Frida Berg", "Ida Ruud", "Selma Lie", "Vilde Moe", "Maja Dahl", "Emma Haugen", "Emma Hansen",
  "Thea Strand", "Ingrid Lund", "Sofie Bakke", "Mathilde Vik",
];

// The revision's seed: a guest team of 11 (two "Emma H…", one without a
// number) and, for Live, an active 7v7 match.
function seed(active: boolean) {
  const now = "2026-10-20T10:00:00.000Z";
  const players = NAMES.map((name, index) => ({
    id: `p${index + 1}`,
    name,
    ...(index === 3 ? {} : { number: index + 1 }),
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
    setup: active
      ? {
          version: 2,
          status: "active",
          serverMatchId: null,
          config: {
            id: "setup-ui-audit",
            teamId: "team-e2e",
            format: "7v7",
            reportEnabled: true,
            formationId: "7v7-2-3-1",
            duration: { mode: "preset", presetId: "2x20", halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
            selectedPlayerIds: ids,
            startingPlayerIds: starters,
            slotAssignments: Object.fromEntries(starters.map((id, index) => [`7v7-${index + 1}`, id])),
            createdAt: now,
            updatedAt: now,
          },
        }
      : null,
  };
}

async function open(page: Page, route: RouteSpec, theme: Theme) {
  await page.addInitScript(
    ({ data, theme, sideline }) => {
      if (sessionStorage.getItem("fp-e2e-seeded")) return;
      sessionStorage.setItem("fp-e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem("theme", theme);
      if (sideline) localStorage.setItem("fairplayr.liveUi", "sideline");
      localStorage.setItem("fairplayr.teams.v2", JSON.stringify(data.workspace));
      if (data.setup) localStorage.setItem("fairplayr.matchSetup.v1", JSON.stringify(data.setup));
    },
    { data: seed(!!route.active), theme, sideline: !!route.sideline },
  );

  const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `HTTP status for ${route.path}`).toBeLessThan(400);
  if (route.ready) await route.ready(page);
  else await expect(page.locator("main :is(h1, h2)").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
  // The Next.js dev-tools badge exists only under `next dev`.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const quiet = [await domQuiet(page)];
  if (route.then) {
    await route.then(page);
    quiet.push(await domQuiet(page, 300));
  }
  await settle(page);
  return quiet.every(Boolean);
}

/**
 * Most routes render on the client after hydration (workspace from storage),
 * so "main is visible" is too early. Wait until the DOM has been quiet for a
 * moment, so the measurement sees the finished page.
 */
async function domQuiet(page: Page, quietMs = 750, timeoutMs = 10_000): Promise<boolean> {
  return page.evaluate(
    ({ quietMs, timeoutMs }) =>
      new Promise<boolean>((resolve) => {
        let timer = window.setTimeout(() => done(true), quietMs);
        const deadline = window.setTimeout(() => done(false), timeoutMs);
        const observer = new MutationObserver(() => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => done(true), quietMs);
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
        function done(quiet: boolean) {
          observer.disconnect();
          window.clearTimeout(timer);
          window.clearTimeout(deadline);
          resolve(quiet);
        }
      }),
    { quietMs, timeoutMs },
  );
}

/**
 * Waits for fonts and short, finite transitions (never longer than 3 s).
 * Long countdowns and infinite animations would never settle, so they are skipped.
 */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getTiming();
      return Number(timing?.duration ?? 0) < 1000 && Number.isFinite(Number(timing?.iterations ?? 1));
    });
    await Promise.race([
      Promise.all(finite.map((animation) => animation.finished.catch(() => undefined))),
      new Promise((resolve) => window.setTimeout(resolve, 3000)),
    ]);
  });
}

function report(
  findings: AuditFindings,
  consoleProblems: Counts,
  allowed: RouteBaseline | undefined,
  chromeBaseline: RouteBaseline | undefined,
) {
  const problems: string[] = [];
  const categories: [string, Counts, Counts | undefined][] = [
    ["targets", findings.page.targets, allowed?.targets],
    ["smallText", findings.page.smallText, allowed?.smallText],
    ["limeText", findings.page.limeText, allowed?.limeText],
    ["console", consoleProblems, allowed?.console],
    ["chrome targets", findings.chrome.targets, chromeBaseline?.targets],
    ["chrome smallText", findings.chrome.smallText, chromeBaseline?.smallText],
    ["chrome limeText", findings.chrome.limeText, chromeBaseline?.limeText],
  ];
  for (const [category, observed, baselineCounts] of categories) {
    for (const regression of regressions(observed, baselineCounts)) {
      problems.push(`${category}: ${regression}`);
    }
  }
  if (findings.overflowPx > 0 && !allowed?.overflow) {
    problems.push(`overflow: the page scrolls ${findings.overflowPx}px horizontally`);
  }
  return problems;
}

for (const theme of THEMES) {
  test.describe(`UI guard, ${theme}`, () => {
    for (const route of ROUTES) {
      test(`${route.id} has no new design regressions`, async ({ page }, testInfo) => {
        const consoleProblems = collectConsoleProblems(page);
        const quiet = await open(page, route, theme);
        if (!quiet) {
          // Measured anyway, but say so: a page that never settles may be measured mid-change.
          testInfo.annotations.push({ type: "ui-audit", description: "the DOM did not go quiet within 10 s" });
        }
        const findings = await measureUi(page);
        const observed = { ...findings, console: countsOf(consoleProblems) };

        await testInfo.attach("ui-audit.json", {
          body: JSON.stringify(observed, null, 2),
          contentType: "application/json",
        });

        if (UPDATE) {
          fs.mkdirSync(OBSERVED_DIR, { recursive: true });
          fs.writeFileSync(
            path.join(OBSERVED_DIR, `${route.id}__${testInfo.project.name}__${theme}.json`),
            JSON.stringify({ route: route.id, project: testInfo.project.name, theme, ...observed }, null, 2),
          );
          return;
        }

        const problems = report(findings, observed.console, baseline.routes[route.id]?.[theme], baseline.chrome[theme]);
        expect(problems, `New UI regressions on ${route.id} (${testInfo.project.name}, ${theme}). Fix them; only if a deviation is accepted, regenerate e2e/ui-audit.baseline.json.`).toEqual([]);
      });
    }
  });
}
