/**
 * Action strip model (DESIGN.md §5.4): the single "what now" slot.
 *
 * Pure: picks exactly one message from view-level facts, in the approved
 * priority order. It decides nothing about the match; every button it implies
 * maps onto a handler that already exists on MatchLiveManager.
 */

import type { LiveMatchPhase, LiveMatchStatus } from "@/domain/liveMatch";

export interface StripInput {
  status: LiveMatchStatus;
  phase: LiveMatchPhase;
  halves: 1 | 2;
  /** The current half's regular time is used up (the clock keeps running). */
  inStoppage: boolean;
  /** A substitution is inside its undo window. */
  hasPendingUndo: boolean;
  /** A field player is selected for substitution. */
  hasSelection: boolean;
  /** A bench player is being dragged onto the pitch. */
  isDragging: boolean;
  /** The existing suggestion engine returned a pair. */
  hasSuggestion: boolean;
}

export type StripKind =
  | "undo"
  | "selection"
  | "dragging"
  | "kickoff"
  | "halfTime"
  | "fullTime"
  | "timeUp"
  | "suggestion"
  | "idle";

export function resolveStripKind(input: StripInput): StripKind {
  if (input.hasPendingUndo) return "undo";
  if (input.isDragging) return "dragging";
  if (input.hasSelection) return "selection";
  if (input.status === "ended") return "fullTime";
  if (input.status === "not_started") return "kickoff";
  if (input.phase === "half_time") return "halfTime";
  if (input.inStoppage && isInPlay(input)) return "timeUp";
  if (input.hasSuggestion) return "suggestion";
  return "idle";
}

/** Goals are live only while a half is being played, running or paused. */
export function isInPlay(input: Pick<StripInput, "status" | "phase">): boolean {
  if (input.status !== "running" && input.status !== "paused") return false;
  return input.phase === "first_half" || input.phase === "second_half";
}

/** The phase that is being played is the match's last one. */
export function isLastPhase(input: Pick<StripInput, "phase" | "halves">): boolean {
  return input.halves === 1 || input.phase !== "first_half";
}
