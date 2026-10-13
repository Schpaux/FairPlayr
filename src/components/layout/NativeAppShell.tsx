"use client";

import { useEffect, type ReactNode } from "react";
import { initNative } from "@/lib/native";

interface Props {
  children: ReactNode;
}

/**
 * Central app shell wrapper.
 *
 * Responsibilities:
 * - Initialises Capacitor native plugins on mount (SplashScreen, StatusBar).
 *   No-op in a regular browser — initNative() checks isNative() first.
 *
 * The child tree is always rendered, regardless of connectivity. Swapping it
 * out would unmount the live match view and discard its in-memory state
 * (clock, substitutions, score prompts) — the match must keep running offline.
 * Connectivity is surfaced by the OfflineIndicator in the Header, which tracks
 * online state itself so going offline never re-renders or remounts this tree.
 */
export function NativeAppShell({ children }: Props) {
  useEffect(() => {
    void initNative();
  }, []);

  return <>{children}</>;
}
