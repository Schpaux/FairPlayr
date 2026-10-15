import { afterEach, describe, expect, it, vi } from "vitest";
import { isSidelineLiveUiEnabled, LIVE_UI_STORAGE_KEY } from "@/lib/featureFlags";

describe("isSidelineLiveUiEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it("is off by default", () => {
    vi.stubEnv("NEXT_PUBLIC_LIVE_UI", "");
    expect(isSidelineLiveUiEnabled()).toBe(false);
  });

  it("is on when the build flag is set to sideline", () => {
    vi.stubEnv("NEXT_PUBLIC_LIVE_UI", "sideline");
    expect(isSidelineLiveUiEnabled()).toBe(true);
  });

  it("ignores other flag values", () => {
    vi.stubEnv("NEXT_PUBLIC_LIVE_UI", "legacy");
    expect(isSidelineLiveUiEnabled()).toBe(false);
  });

  it("honours the per-browser override outside production", () => {
    vi.stubEnv("NEXT_PUBLIC_LIVE_UI", "");
    vi.stubEnv("NODE_ENV", "development");
    window.localStorage.setItem(LIVE_UI_STORAGE_KEY, "sideline");
    expect(isSidelineLiveUiEnabled()).toBe(true);
  });

  it("ignores the per-browser override in production", () => {
    vi.stubEnv("NEXT_PUBLIC_LIVE_UI", "");
    vi.stubEnv("NODE_ENV", "production");
    window.localStorage.setItem(LIVE_UI_STORAGE_KEY, "sideline");
    expect(isSidelineLiveUiEnabled()).toBe(false);
  });
});
