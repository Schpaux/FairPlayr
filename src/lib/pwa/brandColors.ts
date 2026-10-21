/**
 * Literal brand colours for places that cannot read CSS custom properties:
 * the web app manifest (`src/app/manifest.ts`) and the `theme-color` meta tag
 * (`ThemeColorSync`). This is the only place they are written as hex.
 *
 * They must equal the `--fp-canvas` tokens in `src/app/globals.css`
 * (DESIGN.md §2.1); `brandColors.test.ts` fails if the two drift apart.
 */
export const BRAND_COLORS = {
  /** `--fp-canvas`, light theme. */
  canvasLight: "#F9FAF8",
  /** `--fp-canvas`, dark theme (the default theme, DESIGN.md U4). */
  canvasDark: "#121B16",
} as const;

export type ThemeName = "light" | "dark";

/** The default theme of the app (`defaultTheme` in `[locale]/layout.tsx`). */
export const DEFAULT_THEME: ThemeName = "dark";

/**
 * The browser chrome colour for a next-themes theme name. Anything that is not
 * exactly "light" (undefined before hydration, an unknown value in storage)
 * falls back to the default dark theme.
 */
export function themeColorFor(theme: string | undefined | null): string {
  return theme === "light" ? BRAND_COLORS.canvasLight : BRAND_COLORS.canvasDark;
}
