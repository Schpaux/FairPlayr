import type { MatchFormat, MatchSetup } from "@/domain/match";
import {
  createMatchEndedEvent,
  createMatchStartedEvent,
  type MatchEvent,
} from "@/domain/matchEvent";

export type LiveMatchStatus = "not_started" | "running" | "paused" | "ended";
export type LiveMatchPhase = "first_half" | "half_time" | "second_half" | "full_time";

export interface MatchClockBasis {
  startedAtMs: number | null;
  pausedAtMs: number | null;
  accumulatedPausedMs: number;
  isRunning: boolean;
}

export interface LiveMatchState {
  id: string;
  setupId: string;
  teamId: string;
  durationSeconds: number;
  halves: 1 | 2;
  regularSecondsPerHalf: number;
  phase: LiveMatchPhase;
  currentHalf: 1 | 2 | null;
  phaseStartedAtElapsedMs: number;
  clock: MatchClockBasis;
  status: LiveMatchStatus;
  teamScore: number;
  opponentScore: number;
  format: MatchFormat;
  formationId: string;
  /** Current slot → player assignments, updated during live play. */
  liveSlotAssignments: Record<string, string | null>;
  /** Starting XI — captured at match creation, never mutated. Used by match report. */
  initialOnFieldPlayerIds: string[];
  onFieldPlayerIds: string[];
  benchPlayerIds: string[];
  playerAccumulatedMs: Record<string, number>;
  onFieldStartedAtElapsedMs: Record<string, number | null>;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: MatchEvent[];
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

export function getElapsedMsFromClock(clock: MatchClockBasis, nowMs: number): number {
  if (clock.startedAtMs === null) {
    return 0;
  }

  const effectiveNowMs = clock.isRunning ? nowMs : (clock.pausedAtMs ?? nowMs);

  return Math.max(0, effectiveNowMs - clock.startedAtMs - Math.max(0, clock.accumulatedPausedMs));
}

function startClock(clock: MatchClockBasis, nowMs: number): MatchClockBasis {
  if (clock.startedAtMs === null) {
    return {
      startedAtMs: nowMs,
      pausedAtMs: null,
      accumulatedPausedMs: 0,
      isRunning: true,
    };
  }

  if (clock.isRunning) {
    return clock;
  }

  const pausedAtMs = clock.pausedAtMs ?? nowMs;

  return {
    startedAtMs: clock.startedAtMs,
    pausedAtMs: null,
    accumulatedPausedMs: Math.max(0, clock.accumulatedPausedMs + Math.max(0, nowMs - pausedAtMs)),
    isRunning: true,
  };
}

function pauseClock(clock: MatchClockBasis, nowMs: number): MatchClockBasis {
  if (!clock.isRunning || clock.startedAtMs === null) {
    return clock;
  }

  return {
    ...clock,
    pausedAtMs: nowMs,
    isRunning: false,
  };
}

function withUpdatedStatus(state: LiveMatchState): LiveMatchState {
  if (state.status === "ended") {
    return state;
  }

  const nextStatus: LiveMatchStatus =
    state.clock.startedAtMs === null
      ? "not_started"
      : state.clock.isRunning
        ? "running"
        : "paused";

  return {
    ...state,
    status: nextStatus,
  };
}

function getPlayerElapsedMsAt(state: LiveMatchState, playerId: string, elapsedMs: number): number {
  const baseMs = state.playerAccumulatedMs[playerId] ?? 0;
  const startedAtElapsedMs = state.onFieldStartedAtElapsedMs[playerId];

  if (startedAtElapsedMs === null || startedAtElapsedMs === undefined) {
    return baseMs;
  }

  return baseMs + Math.max(0, elapsedMs - startedAtElapsedMs);
}

function normalizePlayerState(
  state: LiveMatchState,
  elapsedMs: number
): LiveMatchState {
  if (!state.clock.isRunning) {
    return state;
  }

  const nextAccumulatedMs = { ...state.playerAccumulatedMs };
  const nextOnFieldStart = { ...state.onFieldStartedAtElapsedMs };

  for (const playerId of state.onFieldPlayerIds) {
    if (nextOnFieldStart[playerId] === null || nextOnFieldStart[playerId] === undefined) {
      nextOnFieldStart[playerId] = elapsedMs;
    }
  }

  for (const playerId of state.benchPlayerIds) {
    const startedAtElapsedMs = nextOnFieldStart[playerId];

    if (startedAtElapsedMs !== null && startedAtElapsedMs !== undefined) {
      nextAccumulatedMs[playerId] = getPlayerElapsedMsAt(state, playerId, elapsedMs);
      nextOnFieldStart[playerId] = null;
    }
  }

  return {
    ...state,
    playerAccumulatedMs: nextAccumulatedMs,
    onFieldStartedAtElapsedMs: nextOnFieldStart,
    updatedAt: nowIso(),
  };
}

export function createLiveMatchFromSetup(setup: MatchSetup): LiveMatchState {
  const timestamp = nowIso();
  const playerAccumulatedMs: Record<string, number> = {};
  const onFieldStartedAtElapsedMs: Record<string, number | null> = {};

  for (const playerId of setup.selectedPlayerIds) {
    playerAccumulatedMs[playerId] = 0;
    onFieldStartedAtElapsedMs[playerId] = setup.startingPlayerIds.includes(playerId)
      ? 0
      : null;
  }

  const halves = setup.duration.halves === 2 ? 2 : 1;
  const durationSeconds = setup.duration.totalMinutes * 60;
  const regularSecondsPerHalf =
    halves === 2 ? setup.duration.minutesPerHalf * 60 : durationSeconds;

  const startingPlayerIds = [...setup.startingPlayerIds];

  return {
    id: generateId(),
    setupId: setup.id,
    teamId: setup.teamId,
    durationSeconds,
    halves,
    regularSecondsPerHalf,
    phase: "first_half",
    currentHalf: 1,
    phaseStartedAtElapsedMs: 0,
    clock: {
      startedAtMs: null,
      pausedAtMs: null,
      accumulatedPausedMs: 0,
      isRunning: false,
    },
    status: "not_started",
    teamScore: 0,
    opponentScore: 0,
    format: setup.format,
    formationId: setup.formationId,
    liveSlotAssignments: { ...setup.slotAssignments },
    initialOnFieldPlayerIds: startingPlayerIds,
    onFieldPlayerIds: startingPlayerIds,
    benchPlayerIds: setup.selectedPlayerIds.filter(
      (playerId) => !setup.startingPlayerIds.includes(playerId)
    ),
    playerAccumulatedMs,
    onFieldStartedAtElapsedMs,
    startedAt: null,
    endedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    events: [],
  };
}

export function getElapsedMs(state: LiveMatchState, nowMs: number): number {
  return getElapsedMsFromClock(state.clock, nowMs);
}

export function getElapsedSeconds(state: LiveMatchState, nowMs: number): number {
  return Math.floor(getElapsedMs(state, nowMs) / 1000);
}

export function getPhaseElapsedSeconds(state: LiveMatchState, nowMs: number): number {
  const elapsedMs = getElapsedMs(state, nowMs);
  return Math.floor(Math.max(0, elapsedMs - state.phaseStartedAtElapsedMs) / 1000);
}

export function getPhaseStoppageElapsedSeconds(state: LiveMatchState, nowMs: number): number {
  const phaseElapsedSeconds = getPhaseElapsedSeconds(state, nowMs);
  const phaseDurationSeconds = getPhaseDurationSeconds(state);

  return Math.max(0, phaseElapsedSeconds - phaseDurationSeconds);
}

export function startLiveMatch(state: LiveMatchState, nowMs: number): LiveMatchState {
  if (state.status === "ended") {
    return state;
  }

  const elapsedMs = getElapsedMs(state, nowMs);
  const nextPhase = state.phase === "half_time" ? "second_half" : state.phase;
  const nextHalf = state.phase === "half_time" ? 2 : state.currentHalf;
  const normalized = normalizePlayerState(state, elapsedMs);
  const shouldRecordStart = normalized.startedAt === null;
  const nextEvents = shouldRecordStart
    ? [
        ...normalized.events,
        createMatchStartedEvent({
          minute: Math.floor(elapsedMs / 60000),
          timestampMs: elapsedMs,
        }),
      ]
    : normalized.events;

  const nextState: LiveMatchState = {
    ...normalized,
    phase: nextPhase,
    currentHalf: nextHalf,
    phaseStartedAtElapsedMs:
      state.phase === "half_time" ? elapsedMs : normalized.phaseStartedAtElapsedMs,
    clock: startClock(normalized.clock, nowMs),
    startedAt: normalized.startedAt ?? nowIso(),
    updatedAt: nowIso(),
    events: nextEvents,
  };

  return withUpdatedStatus(nextState);
}

export function pauseLiveMatch(state: LiveMatchState, nowMs: number): LiveMatchState {
  if (state.status !== "running") {
    return state;
  }

  const elapsedMs = getElapsedMs(state, nowMs);
  const normalized = normalizePlayerState(state, elapsedMs);

  const nextState: LiveMatchState = {
    ...normalized,
    clock: pauseClock(normalized.clock, nowMs),
    updatedAt: nowIso(),
  };

  return withUpdatedStatus(nextState);
}

export function resumeLiveMatch(state: LiveMatchState, nowMs: number): LiveMatchState {
  if (state.status !== "paused") {
    return state;
  }

  // The clock is paused over the break, so restarting it after half-time is
  // the second-half kickoff, whichever control triggered it.
  if (state.phase === "half_time") {
    return startLiveMatch(state, nowMs);
  }

  const nextState: LiveMatchState = {
    ...state,
    clock: startClock(state.clock, nowMs),
    updatedAt: nowIso(),
  };

  return withUpdatedStatus(nextState);
}

export function endLiveMatch(state: LiveMatchState, nowMs: number): LiveMatchState {
  if (state.status === "ended") {
    return state;
  }

  const elapsedMs = getElapsedMs(state, nowMs);
  const normalized = normalizePlayerState(state, elapsedMs);
  const pausedClock = pauseClock(normalized.clock, nowMs);
  const hasEndedEvent = normalized.events.some((event) => event.type === "match_ended");
  const nextEvents = hasEndedEvent
    ? normalized.events
    : [
        ...normalized.events,
        createMatchEndedEvent({
          minute: Math.floor(elapsedMs / 60000),
          timestampMs: elapsedMs,
        }),
      ];

  return {
    ...normalized,
    status: "ended",
    phase: "full_time",
    currentHalf: state.halves === 2 ? 2 : 1,
    clock: {
      ...pausedClock,
      isRunning: false,
    },
    endedAt: normalized.endedAt ?? nowIso(),
    updatedAt: nowIso(),
    events: nextEvents,
  };
}

export function endCurrentHalf(state: LiveMatchState, nowMs: number): LiveMatchState {
  if (state.status !== "running" && state.status !== "paused") {
    return state;
  }

  const elapsedMs = getElapsedMs(state, nowMs);
  const normalized = normalizePlayerState(state, elapsedMs);

  if (normalized.halves !== 2 || normalized.phase !== "first_half") {
    return endLiveMatch(normalized, nowMs);
  }

  const nextState: LiveMatchState = {
    ...normalized,
    phase: "half_time",
    phaseStartedAtElapsedMs: elapsedMs,
    clock: pauseClock(normalized.clock, nowMs),
    updatedAt: nowIso(),
  };

  return withUpdatedStatus(nextState);
}

/**
 * Repairs a match stored by builds that restarted the clock after half-time
 * without leaving the `half_time` phase. Half-time pauses the clock at
 * `phaseStartedAtElapsedMs`, so any clock time past that point was played in
 * the second half, which started exactly there. Other states are returned
 * unchanged.
 */
export function recoverSecondHalfPhase(state: LiveMatchState): LiveMatchState {
  if (state.phase !== "half_time" || state.status === "ended" || state.halves !== 2) {
    return state;
  }

  const clock = state.clock;
  const hasPlayedSinceHalfTime =
    clock.isRunning ||
    (clock.pausedAtMs !== null &&
      getElapsedMsFromClock(clock, clock.pausedAtMs) > state.phaseStartedAtElapsedMs);

  if (!hasPlayedSinceHalfTime) {
    return state;
  }

  return { ...state, phase: "second_half", currentHalf: 2 };
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

  const elapsedMs = getElapsedMs(state, nowMs);
  const sourceState = normalizePlayerState(state, elapsedMs);

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

  const playerAccumulatedMs = {
    ...sourceState.playerAccumulatedMs,
    [outgoingPlayerId]: getPlayerElapsedMsAt(sourceState, outgoingPlayerId, elapsedMs),
    [incomingPlayerId]: sourceState.playerAccumulatedMs[incomingPlayerId] ?? 0,
  };

  const onFieldStartedAtElapsedMs = {
    ...sourceState.onFieldStartedAtElapsedMs,
    [outgoingPlayerId]: null,
    [incomingPlayerId]: elapsedMs,
  };

  // Keep liveSlotAssignments in sync: find outgoing player's slot and give it to incoming
  const nextSlotAssignments = { ...sourceState.liveSlotAssignments };
  for (const slotId of Object.keys(nextSlotAssignments)) {
    if (nextSlotAssignments[slotId] === outgoingPlayerId) {
      nextSlotAssignments[slotId] = incomingPlayerId;
      break;
    }
  }

  return {
    ...sourceState,
    onFieldPlayerIds,
    benchPlayerIds,
    playerAccumulatedMs,
    onFieldStartedAtElapsedMs,
    liveSlotAssignments: nextSlotAssignments,
    updatedAt: nowIso(),
  };
}

/**
 * Swap two field players between their slots. No substitution event — both players
 * remain on the field, they just switch positions.
 */
export function repositionLivePlayers(
  state: LiveMatchState,
  slotAId: string,
  slotBId: string
): LiveMatchState {
  if (slotAId === slotBId) return state;

  const playerA = state.liveSlotAssignments[slotAId] ?? null;
  const playerB = state.liveSlotAssignments[slotBId] ?? null;

  return {
    ...state,
    liveSlotAssignments: {
      ...state.liveSlotAssignments,
      [slotAId]: playerB,
      [slotBId]: playerA,
    },
    updatedAt: nowIso(),
  };
}

/**
 * Move a bench player to a field slot.
 * - If the slot is occupied: performs a substitution (outgoing → bench, incoming → field).
 * - If the slot is empty: just moves the player to the field with no outgoing player.
 *
 * Caller is responsible for creating the SubstitutionMatchEvent.
 * Returns the displaced player ID so the caller knows whether a real sub happened.
 */
export function moveBenchPlayerToSlot(
  state: LiveMatchState,
  slotId: string,
  incomingPlayerId: string,
  nowMs: number
): LiveMatchState {
  if (!state.benchPlayerIds.includes(incomingPlayerId)) {
    return state;
  }

  const displacedPlayerId = state.liveSlotAssignments[slotId] ?? null;

  if (displacedPlayerId && state.onFieldPlayerIds.includes(displacedPlayerId)) {
    // Occupied slot → substitution (uses substitutePlayers which also updates slots)
    return substitutePlayers(state, displacedPlayerId, incomingPlayerId, nowMs);
  }

  // Empty slot → move player to field without an outgoing player
  const elapsedMs = getElapsedMs(state, nowMs);
  const sourceState = normalizePlayerState(state, elapsedMs);

  const onFieldPlayerIds = [...sourceState.onFieldPlayerIds, incomingPlayerId];
  const benchPlayerIds = sourceState.benchPlayerIds.filter((id) => id !== incomingPlayerId);
  const onFieldStartedAtElapsedMs = {
    ...sourceState.onFieldStartedAtElapsedMs,
    [incomingPlayerId]: elapsedMs,
  };

  return {
    ...sourceState,
    onFieldPlayerIds,
    benchPlayerIds,
    onFieldStartedAtElapsedMs,
    liveSlotAssignments: {
      ...sourceState.liveSlotAssignments,
      [slotId]: incomingPlayerId,
    },
    updatedAt: nowIso(),
  };
}

/**
 * Remove a field player from their slot and move them to the bench.
 * No incoming player — caller decides whether to create a substitution event.
 */
export function removePlayerFromField(
  state: LiveMatchState,
  slotId: string,
  nowMs: number
): LiveMatchState {
  const playerId = state.liveSlotAssignments[slotId] ?? null;
  if (!playerId || !state.onFieldPlayerIds.includes(playerId)) return state;

  const elapsedMs = getElapsedMs(state, nowMs);
  const sourceState = normalizePlayerState(state, elapsedMs);

  const playerAccumulatedMs = {
    ...sourceState.playerAccumulatedMs,
    [playerId]: getPlayerElapsedMsAt(sourceState, playerId, elapsedMs),
  };
  const onFieldStartedAtElapsedMs = {
    ...sourceState.onFieldStartedAtElapsedMs,
    [playerId]: null,
  };

  return {
    ...sourceState,
    onFieldPlayerIds: sourceState.onFieldPlayerIds.filter((id) => id !== playerId),
    benchPlayerIds: [...sourceState.benchPlayerIds, playerId],
    playerAccumulatedMs,
    onFieldStartedAtElapsedMs,
    liveSlotAssignments: {
      ...sourceState.liveSlotAssignments,
      [slotId]: null,
    },
    updatedAt: nowIso(),
  };
}

export function getRemainingSeconds(state: LiveMatchState, nowMs: number): number {
  return Math.max(0, state.durationSeconds - getElapsedSeconds(state, nowMs));
}

export function isInStoppageTime(state: LiveMatchState, nowMs: number): boolean {
  return getPhaseStoppageElapsedSeconds(state, nowMs) > 0;
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
  const nextPlaytimeMs: Record<string, number> = {};
  const nextOnFieldStart: Record<string, number | null> = {};

  for (const playerId of squadPlayerIds) {
    nextPlaytimeMs[playerId] = state.playerAccumulatedMs[playerId] ?? 0;
    nextOnFieldStart[playerId] =
      state.onFieldStartedAtElapsedMs[playerId] ?? (onFieldPlayerIds.includes(playerId) ? 0 : null);
  }

  // Clean up slot assignments: remove players no longer in squad
  const nextSlotAssignments: Record<string, string | null> = {};
  for (const [slotId, pid] of Object.entries(state.liveSlotAssignments)) {
    nextSlotAssignments[slotId] = pid && allowed.has(pid) ? pid : null;
  }

  return {
    ...state,
    // Preserve original starting XI — never overwrite with reconciled data
    initialOnFieldPlayerIds: state.initialOnFieldPlayerIds.length > 0
      ? state.initialOnFieldPlayerIds
      : onFieldPlayerIds,
    onFieldPlayerIds,
    benchPlayerIds: nextBench,
    playerAccumulatedMs: nextPlaytimeMs,
    onFieldStartedAtElapsedMs: nextOnFieldStart,
    liveSlotAssignments: nextSlotAssignments,
    updatedAt: nowIso(),
  };
}

export function getPlayerAccumulatedSeconds(
  state: LiveMatchState,
  playerId: string,
  nowMs: number
): number {
  const elapsedMs = getElapsedMs(state, nowMs);
  return Math.floor(getPlayerElapsedMsAt(state, playerId, elapsedMs) / 1000);
}
