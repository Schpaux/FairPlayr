"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { themeColorFor } from "@/lib/pwa/brandColors";

const subscribeNever = () => () => {};

/** False during SSR and hydration, true once hydrated (no hydration mismatch). */
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
}

/**
 * Keeps `<meta name="theme-color">` equal to the canvas of the ACTIVE class
 * theme (next-themes, `enableSystem={false}`), not the OS colour scheme.
 *
 * React 19 hoists this `<meta>` into `<head>` and keeps it updated, and the
 * layout keeps it mounted across navigations. The server and the hydration
 * render use the default (dark) theme, so the HTML is identical for every user
 * (cache-safe shell, FP-OFF-01 B6); the real theme is applied right after
 * hydration. `viewport.themeColor` must stay unset so there is only one tag.
 */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  const hydrated = useIsHydrated();
  const color = themeColorFor(hydrated ? resolvedTheme : undefined);

  return <meta name="theme-color" content={color} />;
}
