import type { LiveMatchState } from "@/domain/liveMatch";

const LIVE_MATCH_STORAGE_KEY = "fairplayr.liveMatch.v1";
const STORAGE_VERSION = 2;

interface LiveMatchStorageEnvelope {
  version: number;
  liveMatch: LiveMatchState;
}

interface LegacyLiveMatch {
  id: string;
  setupId: string;
  teamId: string;
  durationSeconds: number;
  elapsedSeconds: number;
  status: LiveMatchState["status"];
  onFieldPlayerIds: string[];
  benchPlayerIds: string[];
  playerAccumulatedSeconds: Record<string, number>;
  lastTickAtMs: number | null;
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toValidLiveMatch(value: unknown): LiveMatchState | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const setupId = readString(value.setupId);
  const teamId = readString(value.teamId);
  const durationSeconds = readNumber(value.durationSeconds);
  const elapsedSeconds = readNumber(value.elapsedSeconds);
  const elapsedBaseSeconds = readNumber(value.elapsedBaseSeconds);
  const teamScore = readNumber(value.teamScore);
  const opponentScore = readNumber(value.opponentScore);
  const status = readStatus(value.status);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);

  if (
    !id ||
    !setupId ||
    !teamId ||
    durationSeconds === null ||
    elapsedSeconds === null ||
    elapsedBaseSeconds === null ||
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
    phase:
      value.phase === "first_half" ||
      value.phase === "half_time" ||
      value.phase === "second_half" ||
      value.phase === "full_time"
        ? value.phase
        : "first_half",
    currentHalf:
      value.currentHalf === 2
        ? 2
        : value.currentHalf === 1
          ? 1
          : 1,
    phaseElapsedSeconds: readNumber(value.phaseElapsedSeconds) ?? elapsedSeconds,
    phaseElapsedBaseSeconds: readNumber(value.phaseElapsedBaseSeconds) ?? elapsedBaseSeconds,
    phaseRegularElapsedSeconds:
      readNumber(value.phaseRegularElapsedSeconds) ??
      Math.min(elapsedSeconds, readNumber(value.regularSecondsPerHalf) ?? durationSeconds),
    phaseStoppageElapsedSeconds: readNumber(value.phaseStoppageElapsedSeconds) ?? 0,
    elapsedSeconds,
    elapsedBaseSeconds,
    status,
    teamScore,
    opponentScore,
    onFieldPlayerIds,
    benchPlayerIds,
    playerAccumulatedSeconds,
    runStartedAtMs: readNumber(value.runStartedAtMs),
    startedAt: readString(value.startedAt),
    endedAt: readString(value.endedAt),
    createdAt,
    updatedAt,
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

  const onFieldPlayerIds = readStringArray(value.onFieldPlayerIds);
  const benchPlayerIds = readStringArray(value.benchPlayerIds);
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
    elapsedSeconds,
    status,
    onFieldPlayerIds,
    benchPlayerIds,
    playerAccumulatedSeconds,
    lastTickAtMs: readNumber(value.lastTickAtMs),
    startedAt: readString(value.startedAt),
    endedAt: readString(value.endedAt),
    createdAt,
    updatedAt,
  };
}

function migrateLegacyLiveMatch(legacy: LegacyLiveMatch): LiveMatchState {
  const regularSecondsPerHalf = Math.max(1, Math.round(legacy.durationSeconds / 2));

  return {
    ...legacy,
    halves: 2,
    regularSecondsPerHalf,
    phase: "first_half",
    currentHalf: 1,
    phaseElapsedSeconds: legacy.elapsedSeconds,
    phaseElapsedBaseSeconds: legacy.elapsedSeconds,
    phaseRegularElapsedSeconds: Math.min(legacy.elapsedSeconds, regularSecondsPerHalf),
    phaseStoppageElapsedSeconds: Math.max(0, legacy.elapsedSeconds - regularSecondsPerHalf),
    elapsedBaseSeconds: legacy.elapsedSeconds,
    teamScore: 0,
    opponentScore: 0,
    runStartedAtMs:
      legacy.status === "running" ? Date.now() : null,
  };
}

function isEnvelope(value: unknown): value is LiveMatchStorageEnvelope {
  return (
    isRecord(value) &&
    typeof value.version === "number" &&
    "liveMatch" in value
  );
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

    if (parsed.version === STORAGE_VERSION) {
      return toValidLiveMatch(parsed.liveMatch);
    }

    if (parsed.version !== 1) {
      return null;
    }

    const legacy = toLegacyLiveMatch(parsed.liveMatch);

    if (!legacy) {
      return null;
    }

    const migrated = migrateLegacyLiveMatch(legacy);
    saveStoredLiveMatch(migrated);

    return migrated;
  } catch {
    return null;
  }
}

export function saveStoredLiveMatch(liveMatch: LiveMatchState): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload: LiveMatchStorageEnvelope = {
    version: STORAGE_VERSION,
    liveMatch,
  };

  window.localStorage.setItem(LIVE_MATCH_STORAGE_KEY, JSON.stringify(payload));
}

export function clearStoredLiveMatch(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(LIVE_MATCH_STORAGE_KEY);
}
