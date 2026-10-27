import { fetchOrNull } from "@/lib/utils/fetchOrNull";
import { generateMatchName } from "@/lib/utils/matchName";
import { getStoredMatchSetup } from "@/lib/storage/matchStorage";
import {
  clearStoredMatchShare,
  getQueuedShareRevocations,
  getStoredMatchShare,
  queueShareRevocation,
  removeQueuedShareRevocation,
  updateStoredMatchShare,
  type StoredMatchShare,
} from "@/lib/storage/matchShareStorage";
import { isShareEnabled, isShareToken } from "@/domain/matchShare";

/**
 * FEAT-SHARE-01: sends the coach's share of this device's match to the
 * server, after the match row exists (MATCH-13 ids, so a repeat never makes
 * a second match). Never blocks the match: offline it waits, and it runs
 * again on reconnect, when the app comes back, after the match row is
 * created, and whenever the coach changes the share. Shares of discarded
 * setups are turned off the same way (revokeDiscardedSetupShare).
 *
 * - "synced": the server has the latest settings (or there was nothing to send).
 * - "offline" / "failed": not now; the stored change stays and is sent later.
 * - "waiting": the started match's row is not created yet (MATCH-13 does that first).
 * - "unavailable": the server has no sharing yet (migration not applied).
 */
export type MatchShareSyncResult = "synced" | "offline" | "failed" | "waiting" | "unavailable";

let inFlight: Promise<MatchShareSyncResult> | null = null;

export function syncStoredMatchShare(userId: string | null): Promise<MatchShareSyncResult> {
  if (inFlight) {
    // One at a time; a change made meanwhile is sent by a follow-up run.
    return inFlight.then(() => syncStoredMatchShare(userId));
  }
  inFlight = send(userId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function send(userId: string | null): Promise<MatchShareSyncResult> {
  const revoked = await sendRevocations(userId);
  const current = await sendCurrent(userId);
  return current === "synced" ? revoked : current;
}

async function sendRevocations(userId: string | null): Promise<MatchShareSyncResult> {
  if (!userId) return "synced";

  for (const entry of getQueuedShareRevocations()) {
    if (entry.ownerUserId !== userId) continue;

    const response = await fetchOrNull(`/api/matches/${encodeURIComponent(entry.matchId)}/share`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ live: false, summary: false, discardPlaceholder: entry.discardPlaceholder === true }),
    });

    if (!response) return "offline";
    // 404: the match row was never made, so there never was a link; 503: the
    // server has no sharing yet, so none there either.
    if (!response.ok && response.status !== 404 && response.status !== 503) return "failed";
    removeQueuedShareRevocation(entry.matchId);
  }

  return "synced";
}

async function sendCurrent(userId: string | null): Promise<MatchShareSyncResult> {
  const stored = getStoredMatchShare();
  if (!stored || stored.syncedRevision >= stored.revision) return "synced";
  if (!userId || stored.ownerUserId !== userId) return "synced";

  const revision = stored.revision;
  const markSynced = () =>
    updateStoredMatchShare(stored.matchId, (current) => ({
      ...current,
      syncedRevision: Math.max(current.syncedRevision, revision),
    }));

  if (!stored.matchCreated) {
    if (stored.started) {
      // The started match's row is MATCH-13's to create; this runs again after it.
      const setup = getStoredMatchSetup();
      const pendingCreate = setup?.serverMatchId === stored.matchId && setup.serverLink?.pendingCreate;
      if (pendingCreate) return "waiting";
    } else if (!isShareEnabled(stored.settings)) {
      // Turned off before the server ever had it: nothing to tell.
      markSynced();
      return "synced";
    } else {
      // A link shared before kick-off needs the match on the server now: a
      // planned match with the device's id (a repeat answers with that row).
      // The row needs a start time; without the coach's kick-off it is a
      // placeholder the public page never shows (the share sends kickoffAt).
      const setup = getStoredMatchSetup();
      const created = await fetchOrNull("/api/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: stored.matchId,
          teamId: stored.teamId,
          title: generateMatchName(null),
          startsAt: stored.kickoffAt ?? new Date().toISOString(),
          format: setup?.config.teamId === stored.teamId ? setup.config.format : undefined,
          status: "upcoming",
        }),
      });
      if (!created) return "offline";
      if (!created.ok) return "failed";
    }

    updateStoredMatchShare(stored.matchId, (current) => ({ ...current, matchCreated: true }));
  }

  const response = await fetchOrNull(`/api/matches/${encodeURIComponent(stored.matchId)}/share`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...stored.settings,
      token: stored.token,
      // FEAT-SHARE-04: the setup's planned start, only with the lineup option
      // and before the start (afterwards the running match is the source).
      ...(stored.started ? {} : { plannedLineup: stored.settings.lineup ? (stored.plannedLineup ?? null) : null }),
      // A new match's own kick-off (or none); a planned match keeps its time.
      ...(stored.plannedMatch ? {} : { kickoffAt: stored.kickoffAt }),
    }),
  });

  if (!response) return "offline";
  if (response.status === 503) return "unavailable";
  if (!response.ok) return "failed";

  const body = (await response.json().catch(() => null)) as { share?: { token?: unknown } | null } | null;
  const serverToken = body?.share?.token;

  updateStoredMatchShare(stored.matchId, (current) => ({
    ...current,
    // The server keeps the token of a share it already had: show that link.
    token: isShareToken(serverToken) ? serverToken : current.token,
    syncedRevision: Math.max(current.syncedRevision, revision),
  }));

  return "synced";
}

/**
 * The stored share that belongs to the setup on screen: same team and coach,
 * not started yet, and the planned match it was made for (or, for a new
 * match, one made for a new match).
 */
export function usableStoredShare(input: {
  teamId: string;
  ownerUserId: string | null;
  plannedMatchId: string | null;
}): StoredMatchShare | null {
  const stored = getStoredMatchShare();
  if (!stored || stored.started || !input.ownerUserId) return null;
  if (stored.teamId !== input.teamId || stored.ownerUserId !== input.ownerUserId) return null;
  if (input.plannedMatchId ? stored.matchId !== input.plannedMatchId : stored.plannedMatch) return null;
  return stored;
}

/**
 * The server match a start should use for its share: the share's match id,
 * and whether its row already exists (then the start treats it as planned).
 * Null when nothing is shared, so the start is exactly as without sharing.
 */
export function shareMatchForStart(input: {
  teamId: string;
  ownerUserId: string | null;
  plannedMatchId: string | null;
}): { matchId: string; created: boolean } | null {
  const stored = usableStoredShare(input);
  if (!stored || !isShareEnabled(stored.settings)) return null;
  return { matchId: stored.matchId, created: stored.matchCreated };
}

/**
 * The coach discarded the setup on purpose: the share made there for a new
 * match is turned off, and its link stops working once the server has it
 * (queued, so also after a reload or offline). The planned placeholder made
 * for the share is marked discarded on the server: its row and data stay
 * (MATCH-13), but it is no longer listed as a coming match. A planned match
 * keeps its share, since only the setup was discarded, and a started match is
 * never touched here. Leaving setup without discarding never calls this.
 */
export function revokeDiscardedSetupShare(teamId: string): boolean {
  const stored = getStoredMatchShare();
  if (!stored || stored.teamId !== teamId || stored.started || stored.plannedMatch) return false;
  // Always queued: a send already under way may still create the link.
  if (!queueShareRevocation({ matchId: stored.matchId, ownerUserId: stored.ownerUserId, discardPlaceholder: true })) {
    return false;
  }
  clearStoredMatchShare();
  return true;
}

/**
 * «Forkast kamp»: the discarded match's link stops working, through the same
 * durable queue (also offline, after a reload, and for a match shared from
 * another device: the server answers alike when there is no share). The
 * match data is left to the discard itself. Only the signed-in coach's.
 */
export function revokeDiscardedMatchShare(matchId: string | null, ownerUserId: string | null): boolean {
  if (!matchId) return false;
  const stored = getStoredMatchShare();
  if (stored?.matchId === matchId) clearStoredMatchShare();
  if (!ownerUserId) return false;
  return queueShareRevocation({ matchId, ownerUserId });
}

/** After the start: the share now belongs to that running match. */
export function markStoredShareStarted(matchId: string): void {
  updateStoredMatchShare(matchId, (current) => ({ ...current, started: true }));
}
