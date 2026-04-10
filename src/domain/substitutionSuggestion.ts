import { getPlayerAccumulatedSeconds, type LiveMatchState } from "@/domain/liveMatch";

export interface SubstitutionSuggestion {
  outgoingPlayerId: string;
  incomingPlayerId: string;
  outgoingSeconds: number;
  incomingSeconds: number;
  topFieldPlayerIds: string[];
  lowBenchPlayerIds: string[];
}

function readPlaytime(state: LiveMatchState, playerId: string, nowMs: number): number {
  return getPlayerAccumulatedSeconds(state, playerId, nowMs);
}

function maxPlaytimeIds(state: LiveMatchState, nowMs: number): string[] {
  if (state.onFieldPlayerIds.length === 0) {
    return [];
  }

  let maxSeconds = -1;

  for (const playerId of state.onFieldPlayerIds) {
    maxSeconds = Math.max(maxSeconds, readPlaytime(state, playerId, nowMs));
  }

  return state.onFieldPlayerIds.filter(
    (playerId) => readPlaytime(state, playerId, nowMs) === maxSeconds
  );
}

function minPlaytimeIds(state: LiveMatchState, nowMs: number): string[] {
  if (state.benchPlayerIds.length === 0) {
    return [];
  }

  let minSeconds = Number.POSITIVE_INFINITY;

  for (const playerId of state.benchPlayerIds) {
    minSeconds = Math.min(minSeconds, readPlaytime(state, playerId, nowMs));
  }

  return state.benchPlayerIds.filter(
    (playerId) => readPlaytime(state, playerId, nowMs) === minSeconds
  );
}

function pickStablePlayer(orderedIds: string[], candidateIds: string[]): string | null {
  for (const playerId of orderedIds) {
    if (candidateIds.includes(playerId)) {
      return playerId;
    }
  }

  return candidateIds[0] ?? null;
}

export function getSubstitutionSuggestion(
  state: LiveMatchState,
  nowMs: number
): SubstitutionSuggestion | null {
  if (state.status === "ended") {
    return null;
  }

  if (state.onFieldPlayerIds.length === 0 || state.benchPlayerIds.length === 0) {
    return null;
  }

  const topFieldPlayerIds = maxPlaytimeIds(state, nowMs);
  const lowBenchPlayerIds = minPlaytimeIds(state, nowMs);

  if (topFieldPlayerIds.length === 0 || lowBenchPlayerIds.length === 0) {
    return null;
  }

  const outgoingPlayerId = pickStablePlayer(
    state.onFieldPlayerIds,
    topFieldPlayerIds
  );
  const incomingPlayerId = pickStablePlayer(
    state.benchPlayerIds,
    lowBenchPlayerIds
  );

  if (!outgoingPlayerId || !incomingPlayerId) {
    return null;
  }

  return {
    outgoingPlayerId,
    incomingPlayerId,
    outgoingSeconds: readPlaytime(state, outgoingPlayerId, nowMs),
    incomingSeconds: readPlaytime(state, incomingPlayerId, nowMs),
    topFieldPlayerIds,
    lowBenchPlayerIds,
  };
}
