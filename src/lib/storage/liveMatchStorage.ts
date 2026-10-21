import {
  recoverSecondHalfPhase,
  type LiveMatchState,
  type MatchClockBasis,
} from "@/domain/liveMatch";
import type { MatchFormat } from "@/domain/match";
import {
  migrateLegacyLiveEvents,
  normalizeMatchEvents,
} from "@/domain/matchEvent";
import {
  classifyVersion,
  reportNewerStoredVersion,
  safeRemoveItem,
  safeSetItem,
  setItemOrThrow,
  type SafeSetResult,
} from "@/lib/storage/storageEnvelope";

export const LIVE_MATCH_STORAGE_KEY = "fairplayr.liveMatch.v1";
const STORAGE_VERSION = 4;

interface LiveMatchStorageEnvelope {
  version: number;
  liveMatch: LiveMatchState;
}

interface LegacyLiveMatch {
  id: string;
  setupId: string;
  teamId: string;
  durationSeconds: number;
  halves: 1 | 2;
  regularSecondsPerHalf: number;
  phase: LiveMatchState["phase"];
  currentHalf: 1 | 2 | null;
  elapsedSeconds: number;
  phaseElapsedSeconds: number;
  status: LiveMatchState["status"];
  teamScore: number;
  opponentScore: number;
  onFieldPlayerIds: string[];
  benchPlayerIds: string[];
  playerAccumulatedSeconds: Record<string, number>;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readStatus(value: unknown): LiveMatchState["status"] | null {
  if (
    value === "not_started" ||
    value === "running" ||
    value === "paused" ||
    value === "ended"
  ) {
    return value;
  }

  return null;
}

function readPhase(value: unknown): LiveMatchState["phase"] {
  if (
    value === "first_half" ||
    value === "half_time" ||
    value === "second_half" ||
    value === "full_time"
  ) {
    return value;
  }

  return "first_half";
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function readClock(value: unknown): MatchClockBasis | null {
  if (!isRecord(value)) {
    return null;
  }

  const startedAtMs = readNumber(value.startedAtMs);
  const pausedAtMs = value.pausedAtMs === null ? null : readNumber(value.pausedAtMs);
  const accumulatedPausedMs = readNumber(value.accumulatedPausedMs);
  const isRunning = readBoolean(value.isRunning);

  if (startedAtMs === null && value.startedAtMs !== null) {
    return null;
  }

  if (pausedAtMs === null && value.pausedAtMs !== null) {
    return null;
  }

  if (accumulatedPausedMs === null || isRunning === null) {
    return null;
  }

  return {
    startedAtMs,
    pausedAtMs,
    accumulatedPausedMs: Math.max(0, accumulatedPausedMs),
    isRunning,
  };
}

function readPlayerAccumulatedMs(value: unknown): Record<string, number> {
  const output: Record<string, number> = {};

  if (!isRecord(value)) {
    return output;
  }

  for (const [playerId, ms] of Object.entries(value)) {
    if (typeof ms === "number" && isFinite(ms) && ms >= 0) {
      output[playerId] = ms;
    }
  }

  return output;
}

const VALID_FORMATS: MatchFormat[] = ["3v3", "5v5", "7v7", "9v9", "11v11"];

function readMatchFormat(value: unknown): MatchFormat {
  if (typeof value === "string" && (VALID_FORMATS as string[]).includes(value)) {
    return value as MatchFormat;
  }
  return "5v5";
}

function readSlotAssignments(value: unknown): Record<string, string | null> {
  const output: Record<string, string | null> = {};
  if (!isRecord(value)) return output;
  for (const [slotId, pid] of Object.entries(value)) {
    if (pid === null) {
      output[slotId] = null;
    } else if (typeof pid === "string" && pid.length > 0) {
      output[slotId] = pid;
    }
  }
  return output;
}

function readOnFieldStartedAtElapsedMs(value: unknown): Record<string, number | null> {
  const output: Record<string, number | null> = {};

  if (!isRecord(value)) {
    return output;
  }

  for (const [playerId, ms] of Object.entries(value)) {
    if (ms === null) {
      output[playerId] = null;
      continue;
    }

    if (typeof ms === "number" && isFinite(ms) && ms >= 0) {
      output[playerId] = ms;
    }
  }

  return output;
}

function buildFallbackClock(value: Record<string, unknown>): MatchClockBasis {
  const status = readStatus(value.status) ?? "not_started";
  const elapsedSeconds = readNumber(value.elapsedSeconds);
  const nowMs = Date.now();

  if (status === "running" && elapsedSeconds !== null) {
    return {
      startedAtMs: nowMs - Math.max(0, elapsedSeconds * 1000),
      pausedAtMs: null,
      accumulatedPausedMs: 0,
      isRunning: true,
    };
  }

  if ((status === "paused" || status === "ended") && elapsedSeconds !== null) {
    return {
      startedAtMs: nowMs - Math.max(0, elapsedSeconds * 1000),
      pausedAtMs: nowMs,
      accumulatedPausedMs: 0,
      isRunning: false,
    };
  }

  return {
    startedAtMs: null,
    pausedAtMs: null,
    accumulatedPausedMs: 0,
    isRunning: false,
  };
}

function isEnvelope(value: unknown): value is LiveMatchStorageEnvelope {
  return isRecord(value) && typeof value.version === "number" && "liveMatch" in value;
}

function toValidLiveMatch(value: unknown): LiveMatchState | null {
  if (!isRecord(value)) {
    return null;
  }

  const hasModernPlayerShape = "playerAccumulatedMs" in value || "onFieldStartedAtElapsedMs" in value;

  if (!hasModernPlayerShape && "playerAccumulatedSeconds" in value) {
    return null;
  }

  const id = readString(value.id);
  const setupId = readString(value.setupId);
  const teamId = readString(value.teamId);
  const durationSeconds = readNumber(value.durationSeconds);
  const teamScore = readNumber(value.teamScore);
  const opponentScore = readNumber(value.opponentScore);
  const status = readStatus(value.status);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);
  const clock = readClock(value.clock) ?? buildFallbackClock(value);

  if (
    !id ||
    !setupId ||
    !teamId ||
    durationSeconds === null ||
    teamScore === null ||
    opponentScore === null ||
    !status ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  const onFieldPlayerIds = readStringArray(value.onFieldPlayerIds);
  const benchPlayerIds = readStringArray(value.benchPlayerIds);
  const playerAccumulatedMs = readPlayerAccumulatedMs(value.playerAccumulatedMs);
  const onFieldStartedAtElapsedMs = readOnFieldStartedAtElapsedMs(value.onFieldStartedAtElapsedMs);

  for (const playerId of [...onFieldPlayerIds, ...benchPlayerIds]) {
    if (playerAccumulatedMs[playerId] === undefined) {
      playerAccumulatedMs[playerId] = 0;
    }

    if (onFieldStartedAtElapsedMs[playerId] === undefined) {
      onFieldStartedAtElapsedMs[playerId] = onFieldPlayerIds.includes(playerId) ? 0 : null;
    }
  }

  // initialOnFieldPlayerIds: added later — fall back to current onFieldPlayerIds for old records
  const initialOnFieldPlayerIds = readStringArray(value.initialOnFieldPlayerIds).length > 0
    ? readStringArray(value.initialOnFieldPlayerIds)
    : onFieldPlayerIds;

  const storedEvents = normalizeMatchEvents(value.events);
  const legacyLiveEvents = migrateLegacyLiveEvents(value.liveEvents);
  const events = storedEvents.length > 0 ? storedEvents : legacyLiveEvents;

  const format = readMatchFormat(value.format);
  const formationId = readString(value.formationId) ?? `${format}-2-2`;

  // liveSlotAssignments: best-effort fallback — assign onField players to slots in order
  let liveSlotAssignments = readSlotAssignments(value.liveSlotAssignments);
  if (Object.keys(liveSlotAssignments).length === 0 && onFieldPlayerIds.length > 0) {
    onFieldPlayerIds.forEach((playerId, index) => {
      liveSlotAssignments[`${format}-${index + 1}`] = playerId;
    });
  }

  return {
    id,
    setupId,
    teamId,
    durationSeconds,
    halves: value.halves === 2 ? 2 : 1,
    regularSecondsPerHalf:
      readNumber(value.regularSecondsPerHalf) ??
      (value.halves === 2 ? Math.max(1, Math.round(durationSeconds / 2)) : durationSeconds),
    phase: readPhase(value.phase),
    currentHalf: value.currentHalf === 2 ? 2 : value.currentHalf === 1 ? 1 : 1,
    phaseStartedAtElapsedMs: Math.max(0, readNumber(value.phaseStartedAtElapsedMs) ?? 0),
    clock,
    status,
    teamScore,
    opponentScore,
    format,
    formationId,
    liveSlotAssignments,
    initialOnFieldPlayerIds,
    onFieldPlayerIds,
    benchPlayerIds,
    playerAccumulatedMs,
    onFieldStartedAtElapsedMs,
    startedAt: readString(value.startedAt),
    endedAt: readString(value.endedAt),
    createdAt,
    updatedAt,
    events,
  };
}

function toLegacyLiveMatch(value: unknown): LegacyLiveMatch | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const setupId = readString(value.setupId);
  const teamId = readString(value.teamId);
  const durationSeconds = readNumber(value.durationSeconds);
  const elapsedSeconds = readNumber(value.elapsedSeconds);
  const status = readStatus(value.status);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);

  if (
    !id ||
    !setupId ||
    !teamId ||
    durationSeconds === null ||
    elapsedSeconds === null ||
    !status ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  const playerAccumulatedSeconds: Record<string, number> = {};

  if (isRecord(value.playerAccumulatedSeconds)) {
    for (const [playerId, seconds] of Object.entries(value.playerAccumulatedSeconds)) {
      if (typeof seconds === "number" && isFinite(seconds) && seconds >= 0) {
        playerAccumulatedSeconds[playerId] = seconds;
      }
    }
  }

  return {
    id,
    setupId,
    teamId,
    durationSeconds,
    halves: value.halves === 2 ? 2 : 1,
    regularSecondsPerHalf:
      readNumber(value.regularSecondsPerHalf) ??
      (value.halves === 2 ? Math.max(1, Math.round(durationSeconds / 2)) : durationSeconds),
    phase: readPhase(value.phase),
    currentHalf: value.currentHalf === 2 ? 2 : value.currentHalf === 1 ? 1 : 1,
    elapsedSeconds,
    phaseElapsedSeconds: readNumber(value.phaseElapsedSeconds) ?? elapsedSeconds,
    status,
    teamScore: readNumber(value.teamScore) ?? 0,
    opponentScore: readNumber(value.opponentScore) ?? 0,
    onFieldPlayerIds: readStringArray(value.onFieldPlayerIds),
    benchPlayerIds: readStringArray(value.benchPlayerIds),
    playerAccumulatedSeconds,
    startedAt: readString(value.startedAt),
    endedAt: readString(value.endedAt),
    createdAt,
    updatedAt,
  };
}

function migrateLegacyLiveMatch(legacy: LegacyLiveMatch): LiveMatchState {
  const nowMs = Date.now();
  const elapsedMs = Math.max(0, legacy.elapsedSeconds * 1000);
  const phaseElapsedMs = Math.max(0, legacy.phaseElapsedSeconds * 1000);

  const playerAccumulatedMs: Record<string, number> = {};
  const onFieldStartedAtElapsedMs: Record<string, number | null> = {};

  for (const playerId of [...legacy.onFieldPlayerIds, ...legacy.benchPlayerIds]) {
    playerAccumulatedMs[playerId] = Math.max(0, (legacy.playerAccumulatedSeconds[playerId] ?? 0) * 1000);
    onFieldStartedAtElapsedMs[playerId] = null;
  }

  if (legacy.status === "running") {
    for (const playerId of legacy.onFieldPlayerIds) {
      onFieldStartedAtElapsedMs[playerId] = elapsedMs;
    }
  }

  let clock: MatchClockBasis;

  if (legacy.status === "not_started") {
    clock = {
      startedAtMs: null,
      pausedAtMs: null,
      accumulatedPausedMs: 0,
      isRunning: false,
    };
  } else if (legacy.status === "running") {
    clock = {
      startedAtMs: nowMs - elapsedMs,
      pausedAtMs: null,
      accumulatedPausedMs: 0,
      isRunning: true,
    };
  } else {
    clock = {
      startedAtMs: nowMs - elapsedMs,
      pausedAtMs: nowMs,
      accumulatedPausedMs: 0,
      isRunning: false,
    };
  }

  // Legacy records have no formation info — use safe defaults
  const format: MatchFormat = "5v5";
  const formationId = "5v5-2-2";
  const liveSlotAssignments: Record<string, string | null> = {};
  legacy.onFieldPlayerIds.forEach((playerId, index) => {
    liveSlotAssignments[`${format}-${index + 1}`] = playerId;
  });

  return {
    id: legacy.id,
    setupId: legacy.setupId,
    teamId: legacy.teamId,
    durationSeconds: legacy.durationSeconds,
    halves: legacy.halves,
    regularSecondsPerHalf: legacy.regularSecondsPerHalf,
    phase: legacy.phase,
    currentHalf: legacy.currentHalf,
    phaseStartedAtElapsedMs: Math.max(0, elapsedMs - phaseElapsedMs),
    clock,
    status: legacy.status,
    teamScore: legacy.teamScore,
    opponentScore: legacy.opponentScore,
    format,
    formationId,
    liveSlotAssignments,
    // Legacy records have no initialOnFieldPlayerIds — best effort: use current onField
    initialOnFieldPlayerIds: [...legacy.onFieldPlayerIds],
    onFieldPlayerIds: legacy.onFieldPlayerIds,
    benchPlayerIds: legacy.benchPlayerIds,
    playerAccumulatedMs,
    onFieldStartedAtElapsedMs,
    startedAt: legacy.startedAt,
    endedAt: legacy.endedAt,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
    events: [],
  };
}

export function normalizeLiveMatchState(value: unknown): LiveMatchState | null {
  const valid = toValidLiveMatch(value);

  if (valid) {
    return recoverSecondHalfPhase(valid);
  }

  const legacy = toLegacyLiveMatch(value);

  if (!legacy) {
    return null;
  }

  // Legacy builds could also resume from half-time without leaving the phase.
  return recoverSecondHalfPhase(migrateLegacyLiveMatch(legacy));
}

export function getStoredLiveMatch(): LiveMatchState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LIVE_MATCH_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!isEnvelope(parsed)) {
      return null;
    }

    const liveMatchRecord = parsed.liveMatch as unknown;
    const envelopeRecord = parsed as unknown as Record<string, unknown>;

    const liveMatchInput =
      isRecord(liveMatchRecord) && "liveEvents" in envelopeRecord && !("events" in liveMatchRecord)
        ? { ...liveMatchRecord, liveEvents: envelopeRecord.liveEvents }
        : parsed.liveMatch;

    const normalized = normalizeLiveMatchState(liveMatchInput);

    if (!normalized) {
      return null;
    }

    // Migrate forward only. A newer build's record is read tolerantly (the
    // reader ignores fields it does not know) and never written back here.
    const versionClass = classifyVersion(parsed.version, STORAGE_VERSION);

    if (versionClass === "newer") {
      reportNewerStoredVersion(LIVE_MATCH_STORAGE_KEY);
    } else if (versionClass !== "current") {
      trySaveStoredLiveMatch(normalized);
    }

    return normalized;
  } catch {
    return null;
  }
}

function serializeLiveMatch(liveMatch: LiveMatchState): string {
  const payload: LiveMatchStorageEnvelope = {
    version: STORAGE_VERSION,
    liveMatch,
  };

  return JSON.stringify(payload);
}

/**
 * Saves the live match. Throws when the device refuses the write (a full
 * device), as it always has, and with `StorageNewerVersionError` when the
 * stored record is from a newer build (never overwritten); callers that must
 * keep running use `trySaveStoredLiveMatch`.
 */
export function saveStoredLiveMatch(liveMatch: LiveMatchState): void {
  if (typeof window === "undefined") {
    return;
  }

  setItemOrThrow(LIVE_MATCH_STORAGE_KEY, serializeLiveMatch(liveMatch), STORAGE_VERSION);
}

/** Saves the live match without throwing; the result says whether it was stored. */
export function trySaveStoredLiveMatch(liveMatch: LiveMatchState): SafeSetResult {
  if (typeof window === "undefined") {
    return { ok: false, reason: "unavailable" };
  }

  return safeSetItem(LIVE_MATCH_STORAGE_KEY, serializeLiveMatch(liveMatch), STORAGE_VERSION);
}

export function clearStoredLiveMatch(): void {
  if (typeof window === "undefined") {
    return;
  }

  safeRemoveItem(LIVE_MATCH_STORAGE_KEY, STORAGE_VERSION);
}
