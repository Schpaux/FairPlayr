import type { LiveMatchState } from "@/domain/liveMatch";
import { fetchOrNull } from "@/lib/utils/fetchOrNull";
import { getStoredMatchSetup } from "@/lib/storage/matchStorage";
import { syncActiveMatchCreate } from "@/lib/match/matchServerCreate";

/**
 * MATCH-02a / OFF-01b: the live screen's state (clock, score, goals with
 * scorer and assist) sent to the server match. The whole state is sent, and
 * the server ignores a state older than the one it has and makes its goal
 * rows follow the goals in it, so sending the same state again (after a lost
 * answer, a reload, the network or the app coming back) is always safe.
 *
 * - "sent": the server has this state.
 * - "retry": not sent now (offline, server error, server row not created
 *   yet); the caller sends the latest state again later.
 * - "stop": must not be sent (another user's match, a completed match).
 */
export type LiveRuntimeSendResult = "sent" | "retry" | "stop";

const SEND_TIMEOUT_MS = 15_000;

/** Sends per match, one after another, so the server receives them in order. */
const queues = new Map<string, Promise<LiveRuntimeSendResult>>();

export function sendLiveRuntimeState(input: {
  matchId: string;
  userId: string | null;
  liveMatch: LiveMatchState;
}): Promise<LiveRuntimeSendResult> {
  const previous = queues.get(input.matchId) ?? Promise.resolve<LiveRuntimeSendResult>("sent");
  const request = previous.then(() => send(input)).catch((): LiveRuntimeSendResult => "retry");

  queues.set(input.matchId, request);
  void request.then(() => {
    if (queues.get(input.matchId) === request) {
      queues.delete(input.matchId);
    }
  });

  return request;
}

async function send({
  matchId,
  userId,
  liveMatch,
}: {
  matchId: string;
  userId: string | null;
  liveMatch: LiveMatchState;
}): Promise<LiveRuntimeSendResult> {
  const stored = getStoredMatchSetup();
  const serverLink = stored?.serverMatchId === matchId ? stored.serverLink : null;

  // MATCH-13: a match created from this device is only written by its owner,
  // and only once its server row exists.
  if (serverLink && serverLink.ownerUserId !== userId) {
    return "stop";
  }

  if (serverLink?.pendingCreate) {
    const created = userId ? await syncActiveMatchCreate(userId) : null;

    if (created?.status !== "created") {
      return "retry";
    }
  }

  const response = await fetchOrNull(`/api/matches/${encodeURIComponent(matchId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    // A request that hangs (a dead connection) must not hold back the next state.
    signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(SEND_TIMEOUT_MS) : undefined,
    body: JSON.stringify({
      runtimeState: liveMatch,
      scoreFor: liveMatch.teamScore,
      scoreAgainst: liveMatch.opponentScore,
    }),
  });

  if (!response) {
    return "retry";
  }

  if (response.ok) {
    return "sent";
  }

  // Completed, discarded or not ours: sending again cannot help.
  return response.status >= 500 || response.status === 404 || response.status === 408 || response.status === 429
    ? "retry"
    : "stop";
}
