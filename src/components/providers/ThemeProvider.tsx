"use client";

import { MotionConfig } from "framer-motion";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

type ThemeProviderProps = ComponentProps<typeof NextThemesProvider>;

// Appearance for the whole app: the theme, and (UI-A11Y-03) framer-motion
// honouring the OS reduced-motion setting, which the CSS rule in globals.css
// cannot reach. It lives here rather than in layout.tsx, which OFF-01a owns.
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </NextThemesProvider>
  );
}
