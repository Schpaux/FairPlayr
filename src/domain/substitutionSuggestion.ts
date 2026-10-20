import { getPlayerAccumulatedSeconds, type LiveMatchState } from "@/domain/liveMatch";
import { getFormationSlots } from "@/domain/match";

/**
 * The product default (AGENTS.md §2, DESIGN.md §6.2 / D2): a suggestion only
 * appears once the player going off has at least 4 minutes more total
 * playing time than the player coming on.
 */
export const DEFAULT_SUGGESTION_MIN_GAP_SECONDS = 240;

export interface SubstitutionSuggestionOptions {
  /** Never suggested to come off, e.g. the keeper (MATCH-09). */
  excludePlayerIds?: readonly string[];
  /**
   * Smallest total-time difference, outgoing minus incoming, that produces a
   * suggestion. Omitted means no threshold (any pair), the original behaviour.
   */
  minGapSeconds?: number;
}

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

function maxPlaytimeIds(state: LiveMatchState, candidateIds: string[], nowMs: number): string[] {
  if (candidateIds.length === 0) {
    return [];
  }

  let maxSeconds = -1;

  for (const playerId of candidateIds) {
    maxSeconds = Math.max(maxSeconds, readPlaytime(state, playerId, nowMs));
  }

  return candidateIds.filter(
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

/**
 * The player in the keeper slot: the first slot of the formation, in every
 * format except 3v3, which has no keeper. Same rule as the display-only
 * `isKeeperSlot` in `components/live/placeTokens.ts`. Empty when the slot is
 * empty or its player is not on the field.
 */
export function getLiveKeeperPlayerIds(state: LiveMatchState): string[] {
  if (state.format === "3v3") {
    return [];
  }

  const keeperSlotId = getFormationSlots(state.format, state.formationId)[0]?.id;
  const keeperId = keeperSlotId ? state.liveSlotAssignments[keeperSlotId] ?? null : null;

  return keeperId && state.onFieldPlayerIds.includes(keeperId) ? [keeperId] : [];
}

export function getSubstitutionSuggestion(
  state: LiveMatchState,
  nowMs: number,
  options: SubstitutionSuggestionOptions = {}
): SubstitutionSuggestion | null {
  if (state.status === "ended") {
    return null;
  }

  const excluded = new Set(options.excludePlayerIds ?? []);
  const candidateFieldIds = state.onFieldPlayerIds.filter((playerId) => !excluded.has(playerId));

  if (candidateFieldIds.length === 0 || state.benchPlayerIds.length === 0) {
    return null;
  }

  const topFieldPlayerIds = maxPlaytimeIds(state, candidateFieldIds, nowMs);
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

  const outgoingSeconds = readPlaytime(state, outgoingPlayerId, nowMs);
  const incomingSeconds = readPlaytime(state, incomingPlayerId, nowMs);

  if (options.minGapSeconds !== undefined && outgoingSeconds - incomingSeconds < options.minGapSeconds) {
    return null;
  }

  return {
    outgoingPlayerId,
    incomingPlayerId,
    outgoingSeconds,
    incomingSeconds,
    topFieldPlayerIds,
    lowBenchPlayerIds,
  };
}
