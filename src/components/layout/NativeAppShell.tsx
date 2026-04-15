"use client";

import { useEffect, type ReactNode } from "react";
import { initNative } from "@/lib/native";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineScreen } from "./OfflineScreen";

interface Props {
  children: ReactNode;
}

/**
 * Central app shell wrapper.
 *
 * Replaces the standalone NativeInit component and adds offline detection.
 *
 * Responsibilities:
 * - Initialises Capacitor native plugins on mount (SplashScreen, StatusBar).
 *   No-op in a regular browser — initNative() checks isNative() first.
 * - Tracks online/offline state via the browser online/offline events.
 * - Replaces the entire child tree with a localised offline screen when the
 *   device loses connectivity. Automatically restores children when
 *   connectivity returns (no reload required for that direction).
 *
 * The offline screen is shown in both native and web contexts: the browser's
 * own offline page is a worse experience than this fallback.
 */
export function NativeAppShell({ children }: Props) {
  const isOnline = useOnlineStatus();

  useEffect(() => {
    void initNative();
  }, []);

  if (!isOnline) {
    return <OfflineScreen />;
  }

  return <>{children}</>;
}
