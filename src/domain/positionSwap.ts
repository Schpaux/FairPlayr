/**
 * Live position swap (FP-MS2.1-B1): two players on the pitch exchange slots.
 *
 * The single domain operation behind both interactions (tap "Bytt plass" →
 * tap, and drag token → token). It only moves slot assignments, so it:
 *   - is not a substitution and creates no match event,
 *   - leaves the on-field and bench lists, accumulated minutes and the
 *     current stint (`onFieldStartedAtElapsedMs`) untouched,
 *   - works for every format, including swaps into or out of the keeper slot
 *     (the keeper is whoever stands in the formation's first slot).
 *
 * Undo is targeted: it swaps the same two slots back only while they still
 * hold the swapped pair, so it never restores unrelated match state.
 */

import { repositionLivePlayers, type LiveMatchState } from "@/domain/liveMatch";
import { getFormationSlots } from "@/domain/match";

/** What a committed position swap changed, kept for its targeted undo. */
export interface PositionSwapRecord {
  /** The slot the swap started from (the selected or dragged player's slot). */
  readonly fromSlotId: string;
  /** The slot that was tapped or dropped on. */
  readonly toSlotId: string;
  /** The player who stood in `fromSlotId` before the swap. */
  readonly fromPlayerId: string;
  /** The player who stood in `toSlotId` before the swap. */
  readonly toPlayerId: string;
}

/** The on-field player standing in a slot of the current formation, or null. */
function onFieldOccupant(state: LiveMatchState, slotId: string): string | null {
  const inFormation = getFormationSlots(state.format, state.formationId).some((slot) => slot.id === slotId);
  if (!inFormation) return null;
  const playerId = state.liveSlotAssignments[slotId] ?? null;
  return playerId !== null && state.onFieldPlayerIds.includes(playerId) ? playerId : null;
}

/** The formation slot an on-field player stands in, or null. */
export function findLiveSlotOf(state: LiveMatchState, playerId: string): string | null {
  if (!state.onFieldPlayerIds.includes(playerId)) return null;
  const slot = getFormationSlots(state.format, state.formationId).find(
    (candidate) => state.liveSlotAssignments[candidate.id] === playerId
  );
  return slot?.id ?? null;
}

/**
 * The swap this would perform, or null when it is not a valid position swap:
 * the same slot twice, a slot outside the current formation, or a slot
 * without an on-field player.
 */
export function describeLivePositionSwap(
  state: LiveMatchState,
  fromSlotId: string,
  toSlotId: string
): PositionSwapRecord | null {
  if (fromSlotId === toSlotId) return null;
  const fromPlayerId = onFieldOccupant(state, fromSlotId);
  const toPlayerId = onFieldOccupant(state, toSlotId);
  if (fromPlayerId === null || toPlayerId === null) return null;
  return { fromSlotId, toSlotId, fromPlayerId, toPlayerId };
}

/** Whether `fromSlotId` and `toSlotId` can exchange their players. */
export function canSwapLivePositions(state: LiveMatchState, fromSlotId: string, toSlotId: string): boolean {
  return describeLivePositionSwap(state, fromSlotId, toSlotId) !== null;
}

/**
 * Exchange the players in two slots. Returns `state` itself (same reference)
 * when the swap is not valid, so callers can treat it as a no-op.
 */
export function swapLivePositions(state: LiveMatchState, fromSlotId: string, toSlotId: string): LiveMatchState {
  if (!canSwapLivePositions(state, fromSlotId, toSlotId)) return state;
  return repositionLivePlayers(state, fromSlotId, toSlotId);
}

/**
 * Reverse one committed swap. Only acts while both slots still hold the
 * swapped pair; otherwise returns `state` unchanged (same reference).
 */
export function undoLivePositionSwap(state: LiveMatchState, swap: PositionSwapRecord): LiveMatchState {
  const stillSwapped =
    onFieldOccupant(state, swap.fromSlotId) === swap.toPlayerId &&
    onFieldOccupant(state, swap.toSlotId) === swap.fromPlayerId;
  if (!stillSwapped) return state;
  return repositionLivePlayers(state, swap.fromSlotId, swap.toSlotId);
}
