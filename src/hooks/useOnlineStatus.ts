import { useEffect, useState } from "react";

/**
 * Tracks the browser's online/offline state.
 *
 * Initialises as true (online) to avoid SSR/hydration mismatches — the actual
 * state is synced on mount via navigator.onLine and kept up to date through
 * the window online/offline events.
 */
export function useOnlineStatus(): boolean {
  // Lazy initialiser reads the real state synchronously on first client render.
  // Falls back to true on the server (navigator is undefined during SSR).
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    function onOnline() {
      setIsOnline(true);
    }
    function onOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return isOnline;
}
