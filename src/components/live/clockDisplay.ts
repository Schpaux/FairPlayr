/**
 * The live display clock (DESIGN.md §5.1, §6.4, UI-LIVE-04).
 *
 * The clock follows the match's ordinary timeline half by half: the first half
 * runs from 00:00 to the half length, the second half from the half length to
 * the full length, however much stoppage the first half had. Past a half's
 * ordinary end it shows the ordinary end in whole minutes plus the stoppage,
 * "30+10:00".
 *
 * Presentation only: it reads the existing clock and phase fields and never
 * changes elapsed time, playing time or how a half ends.
 */

import { formatClock, getElapsedMsFromClock, type LiveMatchState } from "@/domain/liveMatch";

export interface ClockDisplay {
  /** What the digits show: "16:20", or "30+2:13" in stoppage. */
  text: string;
  /** The ordinary display time in seconds (capped at the half's end). */
  regularSeconds: number;
  /** Seconds past the half's ordinary end; 0 outside stoppage. */
  stoppageSeconds: number;
}

export function formatStoppage(stoppageSeconds: number): string {
  const minutes = Math.floor(stoppageSeconds / 60);
  const seconds = stoppageSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function getClockDisplay(
  state: Pick<
    LiveMatchState,
    "phase" | "halves" | "regularSecondsPerHalf" | "durationSeconds" | "phaseStartedAtElapsedMs" | "clock"
  >,
  nowMs: number
): ClockDisplay {
  const twoHalves = state.halves === 2;
  const halfSeconds = twoHalves ? state.regularSecondsPerHalf : state.durationSeconds;
  const elapsedMs = getElapsedMsFromClock(state.clock, nowMs);
  const phaseStartMs = Math.max(0, state.phaseStartedAtElapsedMs);

  // Which half the clock belongs to, and how much of it has been played.
  // Half-time freezes the first half where it ended (the clock stops there and
  // the phase starts at that point). A match ended during the first half has
  // no second-half start, so it stays a first-half clock.
  let secondHalf = false;
  let playedMs: number;
  // A match ended at half-time (full time, but never played past the first
  // half's end) keeps the first-half clock too.
  const endedAtHalfTime = state.phase === "full_time" && twoHalves && phaseStartMs > 0 && elapsedMs <= phaseStartMs;
  if (state.phase === "half_time" || endedAtHalfTime) {
    playedMs = phaseStartMs;
  } else if (state.phase === "second_half" || (state.phase === "full_time" && twoHalves && phaseStartMs > 0)) {
    secondHalf = true;
    playedMs = elapsedMs - phaseStartMs;
  } else {
    playedMs = elapsedMs - phaseStartMs;
  }

  const played = Math.floor(Math.max(0, playedMs) / 1000);
  const offset = secondHalf ? halfSeconds : 0;

  if (played <= halfSeconds) {
    return { text: formatClock(offset + played), regularSeconds: offset + played, stoppageSeconds: 0 };
  }

  const regularSeconds = offset + halfSeconds;
  const stoppageSeconds = played - halfSeconds;
  return {
    text: `${Math.floor(regularSeconds / 60)}+${formatStoppage(stoppageSeconds)}`,
    regularSeconds,
    stoppageSeconds,
  };
}
