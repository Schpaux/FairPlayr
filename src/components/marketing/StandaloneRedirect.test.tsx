import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";
import { StandaloneRedirect, isInstalledApp } from "./StandaloneRedirect";

const replace = vi.fn();
const originalLocation = window.location;

function setStandalone({ displayMode = false, iosStandalone, capacitor }: { displayMode?: boolean; iosStandalone?: boolean; capacitor?: boolean } = {}) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: displayMode && query === "(display-mode: standalone)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(window.navigator, "standalone", { value: iosStandalone, configurable: true });
  const win = window as unknown as { Capacitor?: unknown };
  if (capacitor === undefined) delete win.Capacitor;
  else win.Capacitor = { isNativePlatform: () => capacitor };
}

beforeEach(() => {
  replace.mockReset();
  Object.defineProperty(window, "location", { value: { ...originalLocation, replace }, configurable: true });
});

afterEach(() => {
  Object.defineProperty(window, "location", { value: originalLocation, configurable: true });
  setStandalone();
});

describe("StandaloneRedirect (WEB-01d)", () => {
  it("leaves a browser tab on the website", () => {
    setStandalone();
    renderWithIntl(<StandaloneRedirect />, "no");
    expect(replace).not.toHaveBeenCalled();
  });

  it("leaves the website alone when Capacitor's web shim is loaded in a browser", () => {
    setStandalone({ capacitor: false });
    renderWithIntl(<StandaloneRedirect />, "en");
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["an installed PWA", { displayMode: true }],
    ["an iOS home-screen app", { iosStandalone: true }],
    ["the Capacitor shell", { capacitor: true }],
  ])("sends %s to the app's Home with the launch marker", (_label, mode) => {
    setStandalone(mode);
    renderWithIntl(<StandaloneRedirect />, "no");
    expect(replace).toHaveBeenCalledWith("/no/play?source=pwa");

    replace.mockReset();
    renderWithIntl(<StandaloneRedirect />, "en");
    expect(replace).toHaveBeenCalledWith("/play?source=pwa");
  });

  it("detects installed apps", () => {
    setStandalone();
    expect(isInstalledApp(window)).toBe(false);
    setStandalone({ iosStandalone: false });
    expect(isInstalledApp(window)).toBe(false);
    setStandalone({ displayMode: true });
    expect(isInstalledApp(window)).toBe(true);
  });
});
