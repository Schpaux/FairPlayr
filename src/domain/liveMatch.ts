import type { MatchSetup } from "@/domain/match";

export type LiveMatchStatus = "not_started" | "running" | "paused" | "ended";
export type LiveMatchPhase = "first_half" | "half_time" | "second_half" | "full_time";

export interface LiveMatchState {
  id: string;
  setupId: string;
  teamId: string;
  durationSeconds: number;
  halves: 1 | 2;
  regularSecondsPerHalf: number;
  phase: LiveMatchPhase;
  currentHalf: 1 | 2 | null;
  phaseElapsedSeconds: number;
  phaseElapsedBaseSeconds: number;
  phaseRegularElapsedSeconds: number;
  phaseStoppageElapsedSeconds: number;
  elapsedSeconds: number;
  elapsedBaseSeconds: number;
  status: LiveMatchStatus;
  teamScore: number;
  opponentScore: number;
  onFieldPlayerIds: string[];
  benchPlayerIds: string[];
  playerAccumulatedSeconds: Record<string, number>;
  runStartedAtMs: number | null;
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

function getPhaseDurationSeconds(state: LiveMatchState): number {
  if (state.phase === "first_half" || state.phase === "second_half") {
    return state.regularSecondsPerHalf;
  }

  return state.durationSeconds;
}

function getDerivedElapsedSeconds(state: LiveMatchState, nowMs: number): number {
  if (state.status !== "running" || state.runStartedAtMs === null) {
    return Math.max(0, state.elapsedBaseSeconds);
  }

  const runningDelta = Math.floor(Math.max(0, nowMs - state.runStartedAtMs) / 1000);

  return Math.max(0, state.elapsedBaseSeconds + runningDelta);
}

function applyDelta(state: LiveMatchState, deltaSeconds: number): LiveMatchState {
  if (deltaSeconds <= 0 || state.status !== "running") {
    return state;
  }

  const appliedSeconds = Math.max(0, deltaSeconds);

  const updatedPlaytime = { ...state.playerAccumulatedSeconds };

  for (const playerId of state.onFieldPlayerIds) {
    updatedPlaytime[playerId] = (updatedPlaytime[playerId] ?? 0) + appliedSeconds;
  }

  const nextElapsed = state.elapsedSeconds + appliedSeconds;
  const phaseDurationSeconds = getPhaseDurationSeconds(state);
  const nextPhaseElapsed = state.phaseElapsedSeconds + appliedSeconds;
  const nextPhaseRegularElapsed = Math.min(nextPhaseElapsed, phaseDurationSeconds);
  const nextPhaseStoppageElapsed = Math.max(0, nextPhaseElapsed - phaseDurationSeconds);

  return {
    ...state,
    elapsedSeconds: nextElapsed,
    elapsedBaseSeconds: nextElapsed,
    phaseElapsedSeconds: nextPhaseElapsed,
    phaseElapsedBaseSeconds: nextPhaseElapsed,
    phaseRegularElapsedSeconds: nextPhaseRegularElapsed,
    phaseStoppageElapsedSeconds: nextPhaseStoppageElapsed,
    playerAccumulatedSeconds: updatedPlaytime,
    runStartedAtMs: state.runStartedAtMs,
    updatedAt: nowIso(),
  };
}

export function createLiveMatchFromSetup(setup: MatchSetup): LiveMatchState {
  const timestamp = nowIso();
  const playtime: Record<string, number> = {};

  for (const playerId of setup.selectedPlayerIds) {
    playtime[playerId] = 0;
  }

  const halves = setup.duration.halves === 2 ? 2 : 1;
  const durationSeconds = setup.duration.totalMinutes * 60;
  const regularSecondsPerHalf =
    halves === 2 ? setup.duration.minutesPerHalf * 60 : durationSeconds;

  return {
    id: generateId(),
    setupId: setup.id,
    teamId: setup.teamId,
    durationSeconds,
    halves,
    regularSecondsPerHalf,
    phase: "first_half",
    currentHalf: 1,
    phaseElapsedSeconds: 0,
    phaseElapsedBaseSeconds: 0,
    phaseRegularElapsedSeconds: 0,
    phaseStoppageElapsedSeconds: 0,
    elapsedSeconds: 0,
    elapsedBaseSeconds: 0,
    status: "not_started",
    teamScore: 0,
    opponentScore: 0,
    onFieldPlayerIds: [...setup.startingPlayerIds],
    benchPlayerIds: setup.selectedPlayerIds.filter(
      (playerId) => !setup.startingPlayerIds.includes(playerId)
    ),
    playerAccumulatedSeconds: playtime,
    runStartedAtMs: null,
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

  const derivedElapsed = getDerivedElapsedSeconds(state, nowMs);
  const deltaSeconds = Math.max(0, derivedElapsed - state.elapsedSeconds);

  if (deltaSeconds <= 0) {
    return state;
  }

  return applyDelta(state, deltaSeconds);
}

export function startLiveMatch(state: LiveMatchState, nowMs: number): LiveMatchState {
  if (state.status !== "not_started" && state.status !== "paused") {
    return state;
  }

  const nextPhase = state.phase === "half_time" ? "second_half" : state.phase;
  const nextHalf = state.phase === "half_time" ? 2 : state.currentHalf;

  return {
    ...state,
    phase: nextPhase,
    currentHalf: nextHalf,
    status: "running",
    runStartedAtMs: nowMs,
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
    elapsedBaseSeconds: ticked.elapsedSeconds,
    phaseElapsedBaseSeconds: ticked.phaseElapsedSeconds,
    runStartedAtMs: null,
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
    runStartedAtMs: nowMs,
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
    phase: "full_time",
    currentHalf: state.halves === 2 ? 2 : 1,
    elapsedBaseSeconds: maybeTicked.elapsedSeconds,
    runStartedAtMs: null,
    endedAt: maybeTicked.endedAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

export function endCurrentHalf(state: LiveMatchState, nowMs: number): LiveMatchState {
  if (state.status !== "running" && state.status !== "paused") {
    return state;
  }

  const ticked = state.status === "running" ? tickLiveMatch(state, nowMs) : state;

  if (ticked.halves !== 2 || ticked.phase !== "first_half") {
    return endLiveMatch(ticked, nowMs);
  }

  return {
    ...ticked,
    phase: "half_time",
    status: "paused",
    runStartedAtMs: null,
    phaseElapsedSeconds: 0,
    phaseElapsedBaseSeconds: 0,
    phaseRegularElapsedSeconds: 0,
    phaseStoppageElapsedSeconds: 0,
    updatedAt: nowIso(),
  };
}

export function updateScore(
  state: LiveMatchState,
  side: "team" | "opponent",
  delta: number
): LiveMatchState {
  if (delta === 0) {
    return state;
  }

  if (side === "team") {
    return {
      ...state,
      teamScore: Math.max(0, state.teamScore + delta),
      updatedAt: nowIso(),
    };
  }

  return {
    ...state,
    opponentScore: Math.max(0, state.opponentScore + delta),
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

export function isInStoppageTime(state: LiveMatchState): boolean {
  return state.phaseStoppageElapsedSeconds > 0;
}

export function getCurrentHalfNumber(state: LiveMatchState): 1 | 2 | null {
  if (state.phase === "first_half") {
    return 1;
  }

  if (state.phase === "second_half") {
    return 2;
  }

  return state.currentHalf;
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
