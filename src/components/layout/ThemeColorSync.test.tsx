import { act, cleanup, render } from "@testing-library/react";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeColorSync } from "@/components/layout/ThemeColorSync";
import { BRAND_COLORS } from "@/lib/pwa/brandColors";

let setThemeRef: ((theme: string) => void) | null = null;

function ThemeHandle() {
  const { setTheme } = useTheme();
  useEffect(() => {
    setThemeRef = setTheme;
  }, [setTheme]);
  return null;
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <ThemeHandle />
      <ThemeColorSync />
    </ThemeProvider>
  );
}

function themeColorMetas(): HTMLMetaElement[] {
  return Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
}

beforeEach(() => {
  // next-themes reads prefers-color-scheme on mount; jsdom has no matchMedia.
  // Report "dark" so a test would fail if the OS scheme leaked through.
  window.matchMedia = ((query: string) => ({
    matches: query.includes("dark"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.localStorage.clear();
  document.documentElement.className = "";
});

afterEach(() => {
  cleanup();
  setThemeRef = null;
});

describe("ThemeColorSync", () => {
  it("server-renders the default dark canvas for every user", () => {
    window.localStorage.setItem("theme", "light");
    const html = renderToString(<App />);
    expect(html).toContain(`<meta name="theme-color" content="${BRAND_COLORS.canvasDark}"/>`);
  });

  it("follows the active class theme and updates when it changes", () => {
    render(<App />);
    expect(themeColorMetas()).toHaveLength(1);
    expect(themeColorMetas()[0].content).toBe(BRAND_COLORS.canvasDark);

    act(() => setThemeRef?.("light"));
    expect(themeColorMetas()).toHaveLength(1);
    expect(themeColorMetas()[0].content).toBe(BRAND_COLORS.canvasLight);

    act(() => setThemeRef?.("dark"));
    expect(themeColorMetas()[0].content).toBe(BRAND_COLORS.canvasDark);
  });

  it("uses the stored theme after hydration, not the OS colour scheme", () => {
    window.localStorage.setItem("theme", "light");
    render(<App />);
    expect(themeColorMetas()[0].content).toBe(BRAND_COLORS.canvasLight);
    expect(themeColorMetas()[0].parentElement).toBe(document.head);
  });
});
