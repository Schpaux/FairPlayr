import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);

  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

// Assume online during SSR and hydration; React re-reads the client snapshot
// immediately after hydrating, so a page loaded while offline still updates
// without a hydration mismatch.
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Tracks the browser's online/offline state via navigator.onLine and the
 * window online/offline events.
 *
 * Note: navigator.onLine === true only means a network interface is up, not
 * that the FairPlayr API is reachable. Treat it as a UI hint, never as a
 * guarantee that a request will succeed.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
