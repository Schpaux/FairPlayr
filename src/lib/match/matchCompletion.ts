import { endLiveMatch, type LiveMatchState } from "@/domain/liveMatch";
import { fetchOrNull, readErrorMessage } from "@/lib/utils/fetchOrNull";
import { generateMatchName } from "@/lib/utils/matchName";
import { createServerMatch } from "@/lib/match/matchServerCreate";
import { getStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import {
  getStoredMatchSetup,
  hasUnsecuredMatchEnd,
  markMatchCompletionConfirmed,
  type StoredMatchConfig,
} from "@/lib/storage/matchStorage";
import {
  clearPendingMatchCompletion,
  getPendingMatchCompletion,
  savePendingMatchCompletion,
  type MatchCompletionBody,
  type PendingMatchCompletion,
} from "@/lib/storage/pendingMatchCompletionStorage";

/** Stored with the completion: who it belongs to and how to create its row. */
export type MatchCompletionContext = Pick<PendingMatchCompletion, "userId" | "info" | "needsCreate">;

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
 * MATCH-13-F4: completions whose pending record could not be written, kept for
 * the life of the page (not only the live screen) as the most complete copy.
 * The guard itself does not depend on it: the stored setup keeps the ended
 * match's end (`hasUnsecuredMatchEnd`), which also holds after a reload.
 * Cleared once the record is stored or confirmed.
 */
const unsaved = new Map<string, PendingMatchCompletion>();

function trackSaved(record: PendingMatchCompletion, persisted: boolean): boolean {
  if (persisted) {
    unsaved.delete(record.matchId);
  } else {
    unsaved.set(record.matchId, record);
  }
  return persisted;
}

/**
 * True while an ended match's completion is not stored as pending nor
 * confirmed: in memory only (`unsaved`), or, after a reload, known only from
 * the stored setup. No new match may start over it (`startLocalMatch`).
 */
export function hasUnsavedMatchCompletion(): boolean {
  return unsaved.size > 0 || hasUnsecuredMatchEnd();
}

/**
 * Tries again to write every unsaved completion to device storage: the
 * in-memory copies first, then one rebuilt from the stored setup and live
 * match when memory has none (after a reload). Returns true when none is left
 * unsaved; the stored records are then sent by the usual retries (start,
 * reconnect, app in front).
 */
export function retrySavingUnsavedMatchCompletions(): boolean {
  for (const record of [...unsaved.values()]) {
    trackSaved(record, savePendingMatchCompletion(record));
  }

  const rebuilt = unsaved.size === 0 ? completionFromStoredEnd() : null;

  if (rebuilt) {
    trackSaved(rebuilt, savePendingMatchCompletion(rebuilt));
  }

  return !hasUnsavedMatchCompletion();
}

/**
 * The completion of the stored ended match while it is not secured, rebuilt
 * the way the match was ended: same end time and report choice, final state
 * from the stored live match (ended again at that time if its last write
 * failed). Null when there is nothing to secure.
 */
function completionFromStoredEnd(): PendingMatchCompletion | null {
  const setup = getStoredMatchSetup();

  if (!hasUnsecuredMatchEnd() || !setup?.serverMatchId || !setup.endedCompletion) {
    return null;
  }

  const { endedAt, reportEnabled } = setup.endedCompletion;
  const stored = getStoredLiveMatch();
  const endedLiveMatch =
    stored && stored.setupId === setup.config.id ? endLiveMatch(stored, Date.parse(endedAt)) : null;

  return {
    matchId: setup.serverMatchId,
    body: {
      status: "completed",
      scoreFor: endedLiveMatch?.teamScore ?? 0,
      scoreAgainst: endedLiveMatch?.opponentScore ?? 0,
      reportEnabled,
      ...(endedLiveMatch ? { runtimeState: endedLiveMatch } : {}),
    },
    endedAt,
    ...completionContextFor(setup, endedLiveMatch),
  };
}

/**
 * Owner, History info and the pending create (MATCH-13) a completion keeps,
 * from the stored setup of the match being ended. Empty for setups started
 * without a signed-in coach (and those stored before it was recorded).
 */
export function completionContextFor(
  setup: StoredMatchConfig,
  liveMatch: LiveMatchState | null
): MatchCompletionContext {
  const link = setup.serverLink;

  if (!link) {
    return {};
  }

  const startsAt =
    link.pendingCreate?.startsAt ?? liveMatch?.startedAt ?? liveMatch?.createdAt ?? setup.config.createdAt;

  return {
    userId: link.ownerUserId,
    info: {
      teamId: setup.config.teamId,
      title: link.pendingCreate?.title ?? generateMatchName(null, new Date(startsAt)),
      startsAt,
      format: setup.config.format,
    },
    needsCreate: Boolean(link.pendingCreate),
  };
}

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
  endedAt: string = new Date().toISOString(),
  context: MatchCompletionContext = {}
): Promise<MatchCompletionResult> {
  const existing = inFlight.get(matchId);

  if (existing) {
    return existing;
  }

  const request = sendMatchCompletion(matchId, body, endedAt, context).finally(() => {
    inFlight.delete(matchId);
  });

  inFlight.set(matchId, request);
  return request;
}

async function sendMatchCompletion(
  matchId: string,
  body: MatchCompletionBody,
  endedAt: string,
  context: MatchCompletionContext
): Promise<MatchCompletionResult> {
  // The first stored end time wins: a retry (reconnect, reload, the details
  // page's "save now") must never move the end of the match to the time it
  // was retried.
  const stored = getPendingMatchCompletion(matchId);
  const originalEndedAt = stored?.endedAt ?? endedAt;
  // Owner and match info are kept from the stored record. A confirmed create
  // stays confirmed; a caller's in-memory copy may still say otherwise.
  const record: PendingMatchCompletion = {
    matchId,
    body,
    endedAt: originalEndedAt,
    ...withoutUndefined({
      userId: stored?.userId ?? context.userId,
      info: stored?.info ?? context.info,
      needsCreate: stored ? stored.needsCreate : context.needsCreate,
    }),
  };
  let persisted = trackSaved(record, savePendingMatchCompletion(record));

  // MATCH-13: a match this device started without a planned match may have
  // no server row yet. It is created with the same id first; the server
  // answers a repeat with the row it has, so this never makes a duplicate.
  if (record.needsCreate && record.info) {
    const created = await createServerMatch({
      ...record.info,
      matchId,
      reportEnabled: body.reportEnabled,
      status: "draft",
    });

    if (created.status === "offline") {
      return { status: "offline", persisted };
    }

    if (created.status === "failed") {
      return { status: "failed", message: created.message, persisted };
    }

    const createdRecord = { ...record, needsCreate: false };
    persisted = trackSaved(createdRecord, savePendingMatchCompletion(createdRecord));
  }

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

  // The stored setup's end goes first: while it is kept and the pending record
  // is gone, the match counts as not secured again.
  markMatchCompletionConfirmed(matchId);
  clearPendingMatchCompletion(matchId);
  unsaved.delete(matchId);
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

  return submitMatchCompletion(matchId, pending.body, pending.endedAt, pending);
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}
