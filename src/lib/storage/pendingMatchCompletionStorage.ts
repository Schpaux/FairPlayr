import type { LiveMatchState } from "@/domain/liveMatch";

/**
 * Server completion requests for matches that were ended on this device but
 * not yet confirmed by the API (offline, server error, app closed mid-request).
 *
 * This is deliberately a minimal, per-match record — not a general sync queue.
 * It keeps the exact PATCH body (including the final runtime state with all
 * match events) so nothing the coach recorded is lost if the stored live match
 * is later cleared by starting a new setup.
 */

const PENDING_COMPLETION_STORAGE_KEY = "fairplayr.pendingMatchCompletions.v1";

export interface MatchCompletionBody {
  status: "completed";
  scoreFor: number;
  scoreAgainst: number;
  reportEnabled: boolean;
  runtimeState: LiveMatchState | null;
}

export interface PendingMatchCompletion {
  matchId: string;
  body: MatchCompletionBody;
  /** ISO timestamp of when the coach ended the match on this device. */
  endedAt: string;
}

type PendingMap = Record<string, PendingMatchCompletion>;

function isPendingMatchCompletion(value: unknown): value is PendingMatchCompletion {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const body = record.body as Record<string, unknown> | null | undefined;

  return (
    typeof record.matchId === "string" &&
    typeof record.endedAt === "string" &&
    typeof body === "object" &&
    body !== null &&
    body.status === "completed" &&
    typeof body.scoreFor === "number" &&
    typeof body.scoreAgainst === "number"
  );
}

function readAll(): PendingMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PENDING_COMPLETION_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    const output: PendingMap = {};

    for (const [matchId, entry] of Object.entries(parsed)) {
      if (isPendingMatchCompletion(entry) && entry.matchId === matchId) {
        output[matchId] = entry;
      }
    }

    return output;
  } catch {
    return {};
  }
}

function writeAll(map: PendingMap): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (Object.keys(map).length === 0) {
      window.localStorage.removeItem(PENDING_COMPLETION_STORAGE_KEY);
    } else {
      window.localStorage.setItem(PENDING_COMPLETION_STORAGE_KEY, JSON.stringify(map));
    }

    return true;
  } catch {
    return false;
  }
}

/** Returns false if the record could not be persisted (e.g. storage quota). */
export function savePendingMatchCompletion(pending: PendingMatchCompletion): boolean {
  return writeAll({ ...readAll(), [pending.matchId]: pending });
}

export function getPendingMatchCompletion(matchId: string): PendingMatchCompletion | null {
  return readAll()[matchId] ?? null;
}

export function clearPendingMatchCompletion(matchId: string): void {
  const map = readAll();

  if (!(matchId in map)) {
    return;
  }

  delete map[matchId];
  writeAll(map);
}
