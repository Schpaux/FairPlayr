import { fetchOrNull, readErrorMessage } from "@/lib/utils/fetchOrNull";
import { getStoredMatchSetup, markServerMatchCreated, markServerMatchStarted } from "@/lib/storage/matchStorage";
import type { PendingMatchInfo } from "@/lib/storage/pendingMatchCompletionStorage";
import { syncStoredMatchShare } from "@/lib/match/matchShareSync";

/**
 * MATCH-13: the server row for a signed-in coach's match started without a
 * planned match. The id is chosen on the device when the match starts and is
 * sent with the create, and the server answers a repeat with the row it
 * already has, so a retry (also after a lost response) never makes a second
 * match.
 */

export type ServerMatchCreateResult =
  | { status: "created" }
  | { status: "offline" }
  | { status: "failed"; message: string | null };

export interface ServerMatchCreateInput extends PendingMatchInfo {
  matchId: string;
  reportEnabled: boolean;
  /** "live" while the match runs here; "draft" once it was ended (the completion follows). */
  status: "live" | "draft";
}

/** A new server match id, or null where the device cannot make a UUID. */
export function newServerMatchId(): string | null {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null;
}

/** Creates in flight in this tab, keyed by match id: one request at a time. */
const inFlight = new Map<string, Promise<ServerMatchCreateResult>>();

export function createServerMatch(input: ServerMatchCreateInput): Promise<ServerMatchCreateResult> {
  const existing = inFlight.get(input.matchId);

  if (existing) {
    return existing;
  }

  const request = sendCreate(input).finally(() => {
    inFlight.delete(input.matchId);
  });

  inFlight.set(input.matchId, request);
  return request;
}

async function sendCreate(input: ServerMatchCreateInput): Promise<ServerMatchCreateResult> {
  const response = await fetchOrNull("/api/matches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: input.matchId,
      teamId: input.teamId,
      title: input.title,
      startsAt: input.startsAt,
      startedAt: input.startsAt,
      format: input.format,
      reportEnabled: input.reportEnabled,
      status: input.status,
    }),
  });

  if (!response) {
    return { status: "offline" };
  }

  if (!response.ok) {
    return { status: "failed", message: await readErrorMessage(response) };
  }

  return { status: "created" };
}

/**
 * Creates the server row for the match running on this device when it is
 * still missing and belongs to `userId`. Clears the mark only on the same
 * match it was sent for. Resolves to null when there is nothing to create.
 */
export async function syncActiveMatchCreate(userId: string): Promise<ServerMatchCreateResult | null> {
  const stored = getStoredMatchSetup();
  const pendingCreate = stored?.serverLink?.pendingCreate;

  if (
    !stored ||
    stored.status !== "active" ||
    !stored.serverMatchId ||
    !pendingCreate ||
    stored.serverLink?.ownerUserId !== userId
  ) {
    return null;
  }

  const setupId = stored.config.id;
  const serverMatchId = stored.serverMatchId;
  const result = await createServerMatch({
    matchId: serverMatchId,
    teamId: stored.config.teamId,
    title: pendingCreate.title,
    startsAt: pendingCreate.startsAt,
    format: stored.config.format,
    reportEnabled: stored.config.reportEnabled,
    status: "live",
  });

  if (result.status === "created") {
    markServerMatchCreated(setupId, serverMatchId);
    // FEAT-SHARE-01: a share made before the row existed can go now.
    void syncStoredMatchShare(userId);
  }

  return result;
}

/**
 * - "started": the server has the match as live.
 * - "offline" / "failed": not now; the mark stays and the start is sent again.
 * - "refused": the server will not take it (completed or discarded, another
 *   match live, no such match): sending again cannot help, so the mark is
 *   cleared.
 */
export type ServerMatchStartResult = "started" | "offline" | "failed" | "refused";

const startsInFlight = new Map<string, Promise<ServerMatchStartResult>>();

/**
 * FEAT-SHARE-01 / OFF-01b: a planned match started here without network is
 * still "upcoming" on the server until its start arrives. This sends that
 * start (with the device's start time) once the network allows: on
 * reconnect, when the app comes back and before a live state is sent. Only
 * while the match still runs on this device, so an ended or discarded match
 * is never sent as live again; the server refuses to reopen a completed one
 * anyway. Resolves to null when there is nothing to send.
 */
export async function syncActiveMatchStart(userId: string): Promise<ServerMatchStartResult | null> {
  const stored = getStoredMatchSetup();
  const pendingStart = stored?.serverLink?.pendingStart;

  if (
    !stored ||
    stored.status !== "active" ||
    !stored.serverMatchId ||
    !pendingStart ||
    stored.serverLink?.pendingCreate ||
    stored.serverLink?.ownerUserId !== userId
  ) {
    return null;
  }

  const setupId = stored.config.id;
  const serverMatchId = stored.serverMatchId;
  const existing = startsInFlight.get(serverMatchId);
  if (existing) return existing;

  const request = (async (): Promise<ServerMatchStartResult> => {
    const response = await fetchOrNull(`/api/matches/${encodeURIComponent(serverMatchId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "live",
        startedAt: pendingStart.startedAt,
        reportEnabled: pendingStart.reportEnabled,
      }),
    });

    if (!response) return "offline";
    // Completed or discarded, another match live, or no such match: the
    // server's answer will not change. Anything else (a lapsed session, a
    // server error) is tried again.
    const refused = response.status === 400 || response.status === 404 || response.status === 409;
    if (!response.ok && !refused) return "failed";

    markServerMatchStarted(setupId, serverMatchId);
    return response.ok ? "started" : "refused";
  })().finally(() => {
    startsInFlight.delete(serverMatchId);
  });

  startsInFlight.set(serverMatchId, request);
  return request;
}
