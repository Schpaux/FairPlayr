import { classifyVersion, safeSetItem } from "@/lib/storage/storageEnvelope";

/**
 * Last moment the app was known to be open with a match active (B9). Written
 * every 15 s, when the page is hidden and on `pagehide`; read once per
 * document load to tell the coach how long the app was closed. It never
 * changes the clock.
 */

export const LIVE_HEARTBEAT_KEY = "fairplayr.liveHeartbeat.v1";
const HEARTBEAT_VERSION = 1;
export const LIVE_HEARTBEAT_INTERVAL_MS = 15_000;

export interface LiveHeartbeat {
  matchId: string;
  atMs: number;
}

export function getLiveHeartbeat(): LiveHeartbeat | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(LIVE_HEARTBEAT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: unknown; matchId?: unknown; atMs?: unknown };
    if (classifyVersion(parsed.version, HEARTBEAT_VERSION) === "invalid") return null;
    if (typeof parsed.matchId !== "string" || typeof parsed.atMs !== "number" || !Number.isFinite(parsed.atMs)) {
      return null;
    }
    return { matchId: parsed.matchId, atMs: parsed.atMs };
  } catch {
    return null;
  }
}

/** Never throws; a full device just skips the heartbeat. */
export function saveLiveHeartbeat(matchId: string, atMs: number = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  return safeSetItem(
    LIVE_HEARTBEAT_KEY,
    JSON.stringify({ version: HEARTBEAT_VERSION, matchId, atMs }),
    HEARTBEAT_VERSION
  ).ok;
}

// ─── Document-wide heartbeat (B9) ────────────────────────────────────────────
//
// The heartbeat belongs to the page, not to the live screen: it keeps beating
// while a local match is active even when the coach is on Home, so neither a
// visit to another screen nor a cold start after closing the app from there
// is mistaken for (or inflates) a closed-app gap. It stops on its own once
// `isActive` says the match is over (ended, discarded) or another match
// starts.

interface RunningHeartbeat {
  matchId: string;
  stop: () => void;
}

let running: RunningHeartbeat | null = null;

/** Starts (or keeps) the heartbeat for `matchId` and beats once now. */
export function keepLiveHeartbeat(matchId: string, isActive: () => boolean): void {
  if (typeof window === "undefined" || !matchId) return;

  if (running?.matchId === matchId) {
    saveLiveHeartbeat(matchId);
    return;
  }

  stopLiveHeartbeat();

  const beat = () => {
    if (!isActive()) {
      stopLiveHeartbeat();
      return;
    }
    saveLiveHeartbeat(matchId);
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") beat();
  };

  const interval = window.setInterval(beat, LIVE_HEARTBEAT_INTERVAL_MS);
  window.addEventListener("pagehide", beat);
  document.addEventListener("visibilitychange", onVisibilityChange);

  running = {
    matchId,
    stop: () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", beat);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };

  saveLiveHeartbeat(matchId);
}

export function stopLiveHeartbeat(): void {
  const current = running;
  running = null;
  current?.stop();
}

/** The match the heartbeat currently runs for, or null. */
export function getRunningHeartbeatMatchId(): string | null {
  return running?.matchId ?? null;
}

// ─── Closed-app gap: evaluated once per document load (B9) ───────────────────

export interface DocumentClosedGap {
  matchId: string;
  minutes: number;
}

let closedGapChecked = false;
let documentClosedGap: DocumentClosedGap | null = null;

/**
 * Runs `evaluate` the first time the live screen restores a match in this
 * document (a cold start or a reload) and remembers the result for the rest
 * of the page's life. Later mounts (in-app navigation back to Live) get
 * `firstCheck: false` and never re-evaluate, so time spent on another screen
 * is never reported as "the app was closed".
 */
export function checkClosedGapOncePerDocument(
  evaluate: () => DocumentClosedGap | null
): { firstCheck: boolean; gap: DocumentClosedGap | null } {
  if (closedGapChecked) return { firstCheck: false, gap: documentClosedGap };
  closedGapChecked = true;
  documentClosedGap = evaluate();
  return { firstCheck: true, gap: documentClosedGap };
}

/** The gap found for this document, if any (for the menu, all session long). */
export function getDocumentClosedGap(): DocumentClosedGap | null {
  return documentClosedGap;
}

/** Test helper: behave like a fresh document load. */
export function resetLiveHeartbeatSessionForTests(): void {
  stopLiveHeartbeat();
  closedGapChecked = false;
  documentClosedGap = null;
}
