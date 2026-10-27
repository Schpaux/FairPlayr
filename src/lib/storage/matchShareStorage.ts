/**
 * FEAT-SHARE-01: the coach's share of the match being set up or played on
 * this device, kept until the server has it.
 *
 * The link is made on the device (a random token and the server match id),
 * so it can be shown and copied before the server has it, also offline.
 * Every change bumps `revision`; the sync sends the latest settings and marks
 * `syncedRevision`, so a change reaches the server once, also after a reload.
 *
 * One record at a time. A record whose match has started (`started`) is only
 * kept for its sync; a new setup does not take it over.
 */

import type { LiveLineupSnapshot } from "@/domain/liveMatch";
import {
  isShareToken,
  normalizeShareSettings,
  sanitizePlannedLineup,
  type MatchShareSettings,
} from "@/domain/matchShare";

export const MATCH_SHARE_KEY = "fairplayr.matchShare.v1";

/** Dispatched on `window` after the stored share changed in this tab. */
export const MATCH_SHARE_CHANGED_EVENT = "fairplayr:match-share-changed";

export interface StoredMatchShare {
  /** The server match the link belongs to (chosen on the device when new). */
  matchId: string;
  teamId: string;
  /** The signed-in coach who made it; only that account syncs it. */
  ownerUserId: string;
  token: string;
  settings: MatchShareSettings;
  revision: number;
  syncedRevision: number;
  /** True once the server row of the match is known to exist. */
  matchCreated: boolean;
  /** True once a match was started with this share. */
  started: boolean;
  /** True when it belongs to a planned match (opened with its id), never to a new one. */
  plannedMatch: boolean;
  /**
   * A new match only: the kick-off the coach gave (ISO), or null for none.
   * A planned match uses its own time and never sends this.
   */
  kickoffAt: string | null;
  /**
   * FEAT-SHARE-04: the setup's planned start, kept only while «Vis
   * lagoppstilling og benk» is on, so the link shows it before «Start
   * kampen». Changes in the setup bump `revision` like any other change.
   * Missing on records from older builds.
   */
  plannedLineup?: LiveLineupSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parse(value: unknown): StoredMatchShare | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.matchId !== "string" ||
    typeof value.teamId !== "string" ||
    typeof value.ownerUserId !== "string" ||
    !isShareToken(value.token)
  ) {
    return null;
  }
  if (!isRecord(value.settings)) return null;
  const revision = typeof value.revision === "number" ? value.revision : 0;
  const syncedRevision = typeof value.syncedRevision === "number" ? value.syncedRevision : 0;

  return {
    matchId: value.matchId,
    teamId: value.teamId,
    ownerUserId: value.ownerUserId,
    token: value.token,
    settings: normalizeShareSettings(value.settings),
    revision,
    syncedRevision: Math.min(syncedRevision, revision),
    matchCreated: value.matchCreated === true,
    started: value.started === true,
    plannedMatch: value.plannedMatch === true,
    kickoffAt: typeof value.kickoffAt === "string" && !Number.isNaN(Date.parse(value.kickoffAt)) ? value.kickoffAt : null,
    plannedLineup: sanitizePlannedLineup(value.plannedLineup),
  };
}

export function getStoredMatchShare(): StoredMatchShare | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MATCH_SHARE_KEY);
    return raw ? parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MATCH_SHARE_CHANGED_EVENT));
}

export function saveStoredMatchShare(share: StoredMatchShare): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(MATCH_SHARE_KEY, JSON.stringify(share));
    notify();
    return true;
  } catch {
    return false;
  }
}

export function clearStoredMatchShare(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MATCH_SHARE_KEY);
  } catch {
    // Ignore: nothing else depends on it.
  }
  notify();
}

/** Changes the stored share (if it is still the one for `matchId`). */
export function updateStoredMatchShare(
  matchId: string,
  update: (share: StoredMatchShare) => StoredMatchShare
): StoredMatchShare | null {
  const current = getStoredMatchShare();
  if (!current || current.matchId !== matchId) return null;
  const next = update(current);
  return saveStoredMatchShare(next) ? next : null;
}

// ─── Revocations ──────────────────────────────────────────────────────────────

/**
 * Shares to turn off on the server, kept until it has done so: a setup or a
 * match the coach discarded, whose link must stop working even if the device
 * was offline. Separate from the record above, so the next setup can share its
 * own new match meanwhile.
 */
export const MATCH_SHARE_REVOCATIONS_KEY = "fairplayr.matchShareRevocations.v1";

export interface QueuedShareRevocation {
  matchId: string;
  ownerUserId: string;
  /** A discarded setup's planned placeholder: also marked discarded on the server. */
  discardPlaceholder?: boolean;
}

export function getQueuedShareRevocations(): QueuedShareRevocation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MATCH_SHARE_REVOCATIONS_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (entry): entry is QueuedShareRevocation =>
          isRecord(entry) && typeof entry.matchId === "string" && typeof entry.ownerUserId === "string"
      )
      .map((entry) => ({
        matchId: entry.matchId,
        ownerUserId: entry.ownerUserId,
        ...(entry.discardPlaceholder === true ? { discardPlaceholder: true } : {}),
      }));
  } catch {
    return [];
  }
}

function saveQueuedShareRevocations(entries: QueuedShareRevocation[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (entries.length === 0) window.localStorage.removeItem(MATCH_SHARE_REVOCATIONS_KEY);
    else window.localStorage.setItem(MATCH_SHARE_REVOCATIONS_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

export function queueShareRevocation(entry: QueuedShareRevocation): boolean {
  const others = getQueuedShareRevocations().filter((queued) => queued.matchId !== entry.matchId);
  return saveQueuedShareRevocations([
    ...others,
    {
      matchId: entry.matchId,
      ownerUserId: entry.ownerUserId,
      ...(entry.discardPlaceholder === true ? { discardPlaceholder: true } : {}),
    },
  ]);
}

export function removeQueuedShareRevocation(matchId: string): void {
  saveQueuedShareRevocations(getQueuedShareRevocations().filter((queued) => queued.matchId !== matchId));
}
