import type { MatchSetup } from "@/domain/match";

export type LiveMatchStatus = "not_started" | "running" | "paused" | "ended";

export interface LiveMatchState {
  id: string;
  setupId: string;
  teamId: string;
  durationSeconds: number;
  elapsedSeconds: number;
  status: LiveMatchStatus;
  onFieldPlayerIds: string[];
  benchPlayerIds: string[];
  playerAccumulatedSeconds: Record<string, number>;
  lastTickAtMs: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function clampElapsed(seconds: number, durationSeconds: number) {
  return Math.max(0, Math.min(seconds, durationSeconds));
}

function applyDelta(state: LiveMatchState, deltaSeconds: number): LiveMatchState {
  if (deltaSeconds <= 0 || state.status !== "running") {
    return state;
  }

  const remaining = state.durationSeconds - state.elapsedSeconds;
  const appliedSeconds = Math.max(0, Math.min(deltaSeconds, remaining));

  if (appliedSeconds <= 0) {
    return {
      ...state,
      elapsedSeconds: state.durationSeconds,
      status: "ended",
      lastTickAtMs: null,
      endedAt: state.endedAt ?? nowIso(),
      updatedAt: nowIso(),
    };
  }

  const updatedPlaytime = { ...state.playerAccumulatedSeconds };

  for (const playerId of state.onFieldPlayerIds) {
    updatedPlaytime[playerId] = (updatedPlaytime[playerId] ?? 0) + appliedSeconds;
  }

  const nextElapsed = clampElapsed(
    state.elapsedSeconds + appliedSeconds,
    state.durationSeconds
  );

  const didFinish = nextElapsed >= state.durationSeconds;

  return {
    ...state,
    elapsedSeconds: nextElapsed,
    status: didFinish ? "ended" : state.status,
    playerAccumulatedSeconds: updatedPlaytime,
    lastTickAtMs: didFinish ? null : state.lastTickAtMs,
    endedAt: didFinish ? state.endedAt ?? nowIso() : state.endedAt,
    updatedAt: nowIso(),
  };
}

export function createLiveMatchFromSetup(setup: MatchSetup): LiveMatchState {
  const timestamp = nowIso();
  const playtime: Record<string, number> = {};

  for (const playerId of setup.squadPlayerIds) {
    playtime[playerId] = 0;
  }

  return {
    id: generateId(),
    setupId: setup.id,
    teamId: setup.teamId,
    durationSeconds: setup.durationMinutes * 60,
    elapsedSeconds: 0,
    status: "not_started",
    onFieldPlayerIds: [...setup.startingPlayerIds],
    benchPlayerIds: setup.squadPlayerIds.filter(
      (playerId) => !setup.startingPlayerIds.includes(playerId)
    ),
    playerAccumulatedSeconds: playtime,
    lastTickAtMs: null,
    startedAt: null,
    endedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function tickLiveMatch(state: LiveMatchState, nowMs: number): LiveMatchState {
  if (state.status !== "running") {
    return state;
  }

  if (state.lastTickAtMs === null) {
    return {
      ...state,
      lastTickAtMs: nowMs,
      updatedAt: nowIso(),
    };
  }

  const deltaMs = Math.max(0, nowMs - state.lastTickAtMs);
  const deltaSeconds = Math.floor(deltaMs / 1000);

  if (deltaSeconds <= 0) {
    return state;
  }

  const updated = applyDelta(state, deltaSeconds);

  if (updated.status !== "running") {
    return updated;
  }

  return {
    ...updated,
    lastTickAtMs: state.lastTickAtMs + deltaSeconds * 1000,
    updatedAt: nowIso(),
  };
}

export function startLiveMatch(state: LiveMatchState, nowMs: number): LiveMatchState {
  if (state.status !== "not_started" && state.status !== "paused") {
    return state;
  }

  return {
    ...state,
    status: "running",
    lastTickAtMs: nowMs,
    startedAt: state.startedAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

export function pauseLiveMatch(state: LiveMatchState, nowMs: number): LiveMatchState {
  if (state.status !== "running") {
    return state;
  }

  const ticked = tickLiveMatch(state, nowMs);

  if (ticked.status !== "running") {
    return ticked;
  }

  return {
    ...ticked,
    status: "paused",
    lastTickAtMs: null,
    updatedAt: nowIso(),
  };
}

export function resumeLiveMatch(state: LiveMatchState, nowMs: number): LiveMatchState {
  if (state.status !== "paused") {
    return state;
  }

  return {
    ...state,
    status: "running",
    lastTickAtMs: nowMs,
    updatedAt: nowIso(),
  };
}

export function endLiveMatch(state: LiveMatchState, nowMs: number): LiveMatchState {
  if (state.status === "ended") {
    return state;
  }

  const maybeTicked = state.status === "running" ? tickLiveMatch(state, nowMs) : state;

  return {
    ...maybeTicked,
    status: "ended",
    elapsedSeconds: maybeTicked.durationSeconds,
    lastTickAtMs: null,
    endedAt: maybeTicked.endedAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

export function substitutePlayers(
  state: LiveMatchState,
  outgoingPlayerId: string,
  incomingPlayerId: string,
  nowMs: number
): LiveMatchState {
  if (state.status === "ended") {
    return state;
  }

  const sourceState = state.status === "running" ? tickLiveMatch(state, nowMs) : state;

  if (
    !sourceState.onFieldPlayerIds.includes(outgoingPlayerId) ||
    !sourceState.benchPlayerIds.includes(incomingPlayerId)
  ) {
    return sourceState;
  }

  const onFieldPlayerIds = sourceState.onFieldPlayerIds.map((playerId) =>
    playerId === outgoingPlayerId ? incomingPlayerId : playerId
  );

  const benchPlayerIds = sourceState.benchPlayerIds.map((playerId) =>
    playerId === incomingPlayerId ? outgoingPlayerId : playerId
  );

  return {
    ...sourceState,
    onFieldPlayerIds,
    benchPlayerIds,
    updatedAt: nowIso(),
  };
}

export function getRemainingSeconds(state: LiveMatchState): number {
  return Math.max(0, state.durationSeconds - state.elapsedSeconds);
}

export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatPlaytime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function getStatusTone(status: LiveMatchStatus): "neutral" | "running" | "ended" {
  if (status === "running") {
    return "running";
  }

  if (status === "ended") {
    return "ended";
  }

  return "neutral";
}

export function reconcileLiveMatchWithSquad(
  state: LiveMatchState,
  squadPlayerIds: string[]
): LiveMatchState {
  const allowed = new Set(squadPlayerIds);
  const onFieldPlayerIds = state.onFieldPlayerIds.filter((playerId) =>
    allowed.has(playerId)
  );
  const benchPlayerIds = state.benchPlayerIds.filter((playerId) =>
    allowed.has(playerId) && !onFieldPlayerIds.includes(playerId)
  );

  const accountedIds = new Set([...onFieldPlayerIds, ...benchPlayerIds]);
  const missingIds = squadPlayerIds.filter((playerId) => !accountedIds.has(playerId));

  const nextBench = [...benchPlayerIds, ...missingIds];
  const nextPlaytime: Record<string, number> = {};

  for (const playerId of squadPlayerIds) {
    nextPlaytime[playerId] = state.playerAccumulatedSeconds[playerId] ?? 0;
  }

  return {
    ...state,
    onFieldPlayerIds,
    benchPlayerIds: nextBench,
    playerAccumulatedSeconds: nextPlaytime,
    updatedAt: nowIso(),
  };
}
