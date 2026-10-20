import { chromium, type FullConfig } from "@playwright/test";

// Warms `next dev` before any test runs (FP-P0-F2 final, live-bench-rail flake).
//
// `next dev` compiles each route the first time it is requested. When that
// happens while a test has another page open, the dev server pushes an HMR
// update to that page too ("[Fast Refresh] rebuilding … done in 2560ms" was
// observed on an open live screen while other routes compiled). For those
// seconds the page's main thread is busy, or it reloads, so a UI update a test
// is waiting for (e.g. the bench's "+N ›" cue after a jump) can miss its
// timeout. Visiting every route once here, in a real browser so client chunks
// compile too, moves all of that before the first test. Against an already
// warm (reused) server this takes a few seconds.
//
// The paths mirror src/app/[locale]/**/page.tsx; the locale and match id do
// not matter for compilation.
const ROUTES = [
  "/no",
  "/no/match",
  "/no/match/setup",
  "/no/match/live",
  "/no/match/00000000-0000-4000-8000-000000000000",
  "/no/team",
  "/no/lineup",
  "/no/historikk",
  "/no/settings",
  "/no/auth/sign-in",
  "/no/auth/sign-up",
  // Development-only gallery of the shared UI primitives (ui-audit, ui-components).
  "/no/dev/ui",
  // The not-found page compiles separately (and pushed an HMR update to an
  // open page when a test first hit an unknown path).
  "/no/__fp-e2e-warmup-not-found",
];

export default async function globalSetup(config: FullConfig) {
  const project = config.projects[0];
  const baseURL = project?.use.baseURL;

  if (!baseURL || process.env.FP_E2E_SKIP_WARMUP === "1") {
    return;
  }

  const browser = await chromium.launch(project.use.channel ? { channel: project.use.channel } : {});

  try {
    const page = await browser.newPage();

    for (const route of ROUTES) {
      // A route that fails to render still compiled; the tests report real errors.
      await page.goto(`${baseURL}${route}`, { waitUntil: "load", timeout: 180_000 }).catch(() => undefined);
    }

    // Let the last compile's HMR settle before tests open their pages.
    await page.waitForTimeout(1_000);
  } finally {
    await browser.close();
  }
}
