import { defineConfig, devices } from "@playwright/test";

// Offline e2e suite (FP-OFF-01a stream B, §S.8). Run with
// `npm run test:e2e:offline`. Kept out of `npm run test:e2e`/`verify` (B8).
//
// - Builds the app once (`next build`, into .next) and serves it with
//   `next start` on 3200, with dummy Supabase settings that point at a local
//   stub. No real project and no secrets are used.
// - The browser talks to an on/off proxy on 3220 (e2e/offline/support/
//   netControl.mjs, control API on 3221, Supabase stub on 3229, all bound to
//   127.0.0.1; the page origin stays `localhost`). The specs cut
//   the network there, outside the browser, because context.setOffline() does
//   not stop the service worker's own requests in Chromium.
// - One worker: the network switch is shared by every test.
// - Cold starts use persistent browser profiles (support/offline.ts), so a
//   restart really ends the browser and the worker, as closing the app does.
// FP_OFFLINE_SKIP_BUILD=1 reuses the current .next build (local iteration;
// it must have been built with the env below).
const APP_PORT = 3200;
const PROXY_PORT = 3220;
const STUB_URL = "http://localhost:3229";

const mobile = {
  ...devices["iPhone SE"],
  browserName: "chromium" as const,
  defaultBrowserType: "chromium" as const,
  serviceWorkers: "allow" as const,
  locale: "nb-NO",
};

const env = {
  NEXT_PUBLIC_SUPABASE_URL: STUB_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-anon-key",
  NEXT_TELEMETRY_DISABLED: "1",
  // Production builds ignore the per-browser flag (src/lib/featureFlags.ts):
  // the suite runs the Modern Sideline live view, as stream A's specs do.
  NEXT_PUBLIC_LIVE_UI: "sideline",
};

const build = process.env.FP_OFFLINE_SKIP_BUILD === "1" ? "" : "npx next build && ";

export default defineConfig({
  testDir: "./e2e/offline",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "test-results/offline",
  use: {
    baseURL: `http://localhost:${PROXY_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    { name: "iphone-se-375x667", use: { ...mobile, viewport: { width: 375, height: 667 } } },
    { name: "android-360x640", use: { ...mobile, viewport: { width: 360, height: 640 } } },
    { name: "iphone-390x844", use: { ...mobile, viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: "node e2e/offline/support/netControl.mjs",
      url: "http://127.0.0.1:3221/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // No --hostname: binding next start to 127.0.0.1 makes next-intl's
      // internal rewrite (http://localhost:3200/en/...) look external, so the
      // unprefixed English shells answer 307 to themselves and the worker's
      // precache install fails. The server only ever sees dummy data.
      command: `${build}npx next start --port ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}/no`,
      reuseExistingServer: false,
      timeout: 600_000,
      env,
    },
  ],
});
