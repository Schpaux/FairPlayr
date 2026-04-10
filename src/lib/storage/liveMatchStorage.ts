import type { LiveMatchState } from "@/domain/liveMatch";

const LIVE_MATCH_STORAGE_KEY = "fairplayr.liveMatch.v1";
const STORAGE_VERSION = 1;

interface LiveMatchStorageEnvelope {
  version: number;
  liveMatch: LiveMatchState;
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

    if (parsed.version !== STORAGE_VERSION) {
      return null;
    }

    return toValidLiveMatch(parsed.liveMatch);
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
