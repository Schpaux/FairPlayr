import { fetchOrNull, readErrorMessage } from "@/lib/utils/fetchOrNull";
import { getStoredMatchSetup, markServerMatchCreated } from "@/lib/storage/matchStorage";
import type { PendingMatchInfo } from "@/lib/storage/pendingMatchCompletionStorage";

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
  }

  return result;
}
