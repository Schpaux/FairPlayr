/**
 * C5-F2: tells other parts of the page that a team's Spond connection changed
 * (connected, or disconnected and cleaned up), so the profile sheet's status
 * row checks again instead of waiting for a reload. Local to this tab; no
 * request or data leaves the device because of it.
 */

export const SPOND_STATUS_CHANGED_EVENT = "fairplayr:spond-status-changed";

export function notifySpondStatusChanged(teamId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SPOND_STATUS_CHANGED_EVENT, { detail: { teamId } }));
}

export function onSpondStatusChanged(listener: (teamId: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) => {
    const teamId = (event as CustomEvent<{ teamId?: unknown }>).detail?.teamId;
    if (typeof teamId === "string") listener(teamId);
  };
  window.addEventListener(SPOND_STATUS_CHANGED_EVENT, handle);
  return () => window.removeEventListener(SPOND_STATUS_CHANGED_EVENT, handle);
}
