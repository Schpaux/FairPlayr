/**
 * FEAT-SHARE-01: the match clock a visitor sees, worked out on the visitor's
 * device from the coach's last clock basis (so it runs between updates). The
 * digits are the live screen's own (clockDisplay.ts): "16:20", and past a
 * half's ordinary end "25+2:13".
 */

import { getClockDisplay } from "@/components/live/clockDisplay";
import type { PublicLiveState } from "@/domain/matchShare";

export type PublicClockState = "running" | "stopped" | "halfTime" | "fullTime";

export interface PublicMatchClock {
  text: string;
  state: PublicClockState;
  /** Past the half's ordinary end (overtid / tilleggstid). */
  stoppage: boolean;
  /** 1 or 2 in a two-half match while a half is on; null otherwise. */
  half: 1 | 2 | null;
}

/** Null before the first ▶ (or without a clock): then there is no match clock. */
export function publicMatchClock(live: PublicLiveState | null, nowMs: number): PublicMatchClock | null {
  if (!live?.clock || live.clock.startedAtMs === null || !live.phase || live.regularSecondsPerHalf === null) {
    return null;
  }

  const halves = live.halves ?? 1;
  const display = getClockDisplay(
    {
      phase: live.phase,
      halves,
      regularSecondsPerHalf: live.regularSecondsPerHalf,
      durationSeconds: live.regularSecondsPerHalf * halves,
      phaseStartedAtElapsedMs: live.phaseStartedAtElapsedMs ?? 0,
      clock: live.clock,
    },
    nowMs
  );

  const inHalf = live.phase === "first_half" || live.phase === "second_half";
  const state: PublicClockState =
    live.phase === "full_time" || live.status === "ended"
      ? "fullTime"
      : live.phase === "half_time"
        ? "halfTime"
        : live.clock.isRunning
          ? "running"
          : "stopped";

  return {
    text: display.text,
    state,
    stoppage: inHalf && display.stoppageSeconds > 0,
    half: inHalf && halves === 2 ? (live.phase === "first_half" ? 1 : 2) : null,
  };
}
