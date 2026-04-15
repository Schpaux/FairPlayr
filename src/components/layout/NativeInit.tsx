"use client";

import { useEffect } from "react";
import { initNative } from "@/lib/native";

/**
 * Mounts once in the locale layout to initialise Capacitor native plugins
 * (SplashScreen hide, StatusBar configuration).
 *
 * This is a no-op in a regular browser — initNative() checks isNative() first.
 */
export function NativeInit() {
  useEffect(() => {
    void initNative();
  }, []);

  return null;
}
