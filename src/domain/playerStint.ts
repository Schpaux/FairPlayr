/**
 * Player stint — continuous playing time since the player's last rest.
 *
 * Pure reader over the stored live match state; it adds no fields and changes
 * nothing. The stint is reconstructed from two values the engine already keeps
 * on the pause-free match clock (`getElapsedMs`):
 *
 * - `onFieldStartedAtElapsedMs[playerId]` — when the player's current spell on
 *   the pitch began. Coming on sets it; going off clears it to `null`.
 * - `phaseStartedAtElapsedMs` — when the current phase began. The clock is
 *   paused over half-time, so in the second half this is the kickoff.
 *
 * The stint starts at the later of the two, so half-time counts as a rest for
 * everyone on the pitch. Pauses never count because the clock excludes them.
 */

import { getElapsedMs, type LiveMatchState } from "@/domain/liveMatch";

/**
 * Seconds the player has played without a rest: since coming on, or since the
 * second-half kickoff if they were on the pitch at half-time. Zero for players
 * on the bench and during the half-time break.
 */
export function getPlayerStintSeconds(
  state: LiveMatchState,
  playerId: string,
  nowMs: number
): number {
  if (!state.onFieldPlayerIds.includes(playerId)) {
    return 0;
  }

  const onFieldSinceMs = state.onFieldStartedAtElapsedMs[playerId];
  if (onFieldSinceMs === null || onFieldSinceMs === undefined) {
    return 0;
  }

  const stintStartMs = Math.max(onFieldSinceMs, state.phaseStartedAtElapsedMs);

  return Math.floor(Math.max(0, getElapsedMs(state, nowMs) - stintStartMs) / 1000);
}
