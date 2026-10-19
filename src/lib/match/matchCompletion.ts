import { fetchOrNull, readErrorMessage } from "@/lib/utils/fetchOrNull";
import {
  clearPendingMatchCompletion,
  getPendingMatchCompletion,
  savePendingMatchCompletion,
  type MatchCompletionBody,
} from "@/lib/storage/pendingMatchCompletionStorage";

export type MatchCompletionResult =
  | { status: "completed" }
  /**
   * The request never reached the server. `persisted` is false when the
   * pending record could not be written (e.g. storage quota), in which case
   * the completion only survives in the caller's memory.
   */
  | { status: "offline"; persisted: boolean }
  /** The server rejected the request. `persisted` as for "offline". */
  | { status: "failed"; message: string | null; persisted: boolean };

/**
 * Completion requests currently in flight in this tab, keyed by match id, so
 * an automatic retry (e.g. the "online" event) and a manual one cannot send
 * the same completion twice at once.
 */
const inFlight = new Map<string, Promise<MatchCompletionResult>>();

/**
 * Sends the "match completed" PATCH for a match that has already been ended
 * locally.
 *
 * The request body is written to pending storage *before* the request is sent
 * and only cleared once the server confirms, so an offline device, a server
 * error or the app being closed mid-request never loses the completion. If
 * that write fails the request is still sent, and the result reports
 * `persisted: false` so the caller can keep the body in memory and warn.
 */
export function submitMatchCompletion(
  matchId: string,
  body: MatchCompletionBody,
  endedAt: string = new Date().toISOString()
): Promise<MatchCompletionResult> {
  const existing = inFlight.get(matchId);

  if (existing) {
    return existing;
  }

  const request = sendMatchCompletion(matchId, body, endedAt).finally(() => {
    inFlight.delete(matchId);
  });

  inFlight.set(matchId, request);
  return request;
}

async function sendMatchCompletion(
  matchId: string,
  body: MatchCompletionBody,
  endedAt: string
): Promise<MatchCompletionResult> {
  // The first stored end time wins: a retry (reconnect, reload, the details
  // page's "save now") must never move the end of the match to the time it
  // was retried.
  const originalEndedAt = getPendingMatchCompletion(matchId)?.endedAt ?? endedAt;
  const persisted = savePendingMatchCompletion({ matchId, body, endedAt: originalEndedAt });

  const response = await fetchOrNull(`/api/matches/${encodeURIComponent(matchId)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    // The server stores this as the match's end time, so a match ended
    // offline keeps the time the coach ended it, not the time it synced.
    body: JSON.stringify({ ...body, endedAt: originalEndedAt }),
  });

  if (!response) {
    return { status: "offline", persisted };
  }

  if (!response.ok) {
    return { status: "failed", message: await readErrorMessage(response), persisted };
  }

  clearPendingMatchCompletion(matchId);
  return { status: "completed" };
}

/**
 * Re-sends a previously stored completion. Resolves to null when nothing is
 * pending for the match.
 */
export async function retryPendingMatchCompletion(
  matchId: string
): Promise<MatchCompletionResult | null> {
  const pending = getPendingMatchCompletion(matchId);

  if (!pending) {
    return null;
  }

  return submitMatchCompletion(matchId, pending.body, pending.endedAt);
}
