import type { LiveMatchState } from "@/domain/liveMatch";
import type { MatchFormat } from "@/domain/match";

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

/**
 * Dispatched on `window` after this tab wrote or cleared a pending completion,
 * so History can show a match as waiting and drop the mark once it synced.
 */
export const PENDING_COMPLETIONS_CHANGED_EVENT = "fairplayr:pending-completions-changed";

export interface MatchCompletionBody {
  status: "completed";
  scoreFor: number;
  scoreAgainst: number;
  reportEnabled: boolean;
  /** Omitted when the device had no live state: the server keeps its own. */
  runtimeState?: LiveMatchState | null;
}

/**
 * What this device knows about the match without the server (MATCH-13): enough
 * to list it in History and to create its server row with the same id.
 */
export interface PendingMatchInfo {
  teamId: string;
  title: string;
  /** Kick-off: when the match was started on this device. */
  startsAt: string;
  format: MatchFormat;
}

export interface PendingMatchCompletion {
  matchId: string;
  body: MatchCompletionBody;
  /** ISO timestamp of when the coach ended the match on this device. */
  endedAt: string;
  /**
   * Signed-in coach the match belongs to. Only that account sends it; absent
   * on records stored before it existed (sent by whoever is signed in, as before).
   */
  userId?: string;
  /** Shown in History while the server does not have the match yet. */
  info?: PendingMatchInfo;
  /**
   * True until the server confirms the match row exists: the row is created
   * (idempotently, with `matchId`) before the completion is sent.
   */
  needsCreate?: boolean;
}

type PendingMap = Record<string, PendingMatchCompletion>;

function isPendingMatchInfo(value: unknown): value is PendingMatchInfo {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.teamId === "string" &&
    typeof record.title === "string" &&
    typeof record.startsAt === "string" &&
    typeof record.format === "string"
  );
}

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
    typeof body.scoreAgainst === "number" &&
    (record.userId === undefined || typeof record.userId === "string") &&
    (record.info === undefined || isPendingMatchInfo(record.info)) &&
    (record.needsCreate === undefined || typeof record.needsCreate === "boolean")
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

    window.dispatchEvent(new Event(PENDING_COMPLETIONS_CHANGED_EVENT));
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

/** Completions still waiting for the server, oldest first. */
export function listPendingMatchCompletions(): PendingMatchCompletion[] {
  return Object.values(readAll()).sort((a, b) => a.endedAt.localeCompare(b.endedAt));
}

/** Matches with a completion still waiting for the server, oldest first. */
export function listPendingMatchCompletionIds(): string[] {
  return listPendingMatchCompletions().map((pending) => pending.matchId);
}

export function clearPendingMatchCompletion(matchId: string): void {
  const map = readAll();

  if (!(matchId in map)) {
    return;
  }

  delete map[matchId];
  writeAll(map);
}
