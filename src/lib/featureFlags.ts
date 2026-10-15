/**
 * Feature flags.
 *
 * `NEXT_PUBLIC_LIVE_UI=sideline` turns on the Modern Sideline live-match view
 * (DESIGN.md §5). It is OFF by default: without the variable every user keeps
 * the existing live screen.
 *
 * Outside production builds the flag can also be turned on per browser with
 * `localStorage["fairplayr.liveUi"] = "sideline"`, so Playwright and reviewers
 * can compare both views against one dev server. Production ignores it.
 */

export const LIVE_UI_STORAGE_KEY = "fairplayr.liveUi";

export function isSidelineLiveUiEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_LIVE_UI === "sideline") {
    return true;
  }

  if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(LIVE_UI_STORAGE_KEY) === "sideline";
  } catch {
    return false;
  }
}
