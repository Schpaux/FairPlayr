import { defineConfig, devices } from "@playwright/test";

// Browser smoke tests (e2e/). Run with `npm run test:e2e`.
// Uses Playwright's bundled Chromium by default (one-time setup:
// `npx playwright install chromium`). Branded Google Chrome is opt-in with
// FP_E2E_CHANNEL=chrome: its updater (GoogleUpdater) inherits Chrome's stdio
// and can stall worker shutdown for minutes (see FP-DEV01).
// Starts its own dev server on a dedicated port unless one is already running there.
const PORT = Number(process.env.FP_E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const channel = process.env.FP_E2E_CHANNEL;

const mobile = {
  ...devices["iPhone SE"],
  // Chrome engine with iPhone-like metrics; WebKit is not installed locally.
  browserName: "chromium" as const,
  defaultBrowserType: "chromium" as const,
  ...(channel ? { channel } : {}),
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    // D6: 375×667 is the validated initial live viewport.
    { name: "iphone-se-375x667", use: { ...mobile, viewport: { width: 375, height: 667 } } },
    { name: "iphone-390x844", use: { ...mobile, viewport: { width: 390, height: 844 } } },
    // D6 follow-up: small Android is tracked explicitly before broad release.
    { name: "android-360x640", use: { ...mobile, viewport: { width: 360, height: 640 } } },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `${baseURL}/no`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
