import "server-only";

export interface MatchSummaryGoalFor {
  minute: number | null;
  scorerName: string | null;
  assistName: string | null;
  /** Player ids, only for telling players apart in the code map (pseudonymize.ts); never sent. */
  scorerId?: string | null;
  assistId?: string | null;
}

export interface MatchSummaryGoalAgainst {
  minute: number | null;
}

/** A goal of either side, in the order the goals were recorded. */
export interface MatchSummaryGoal {
  side: "own" | "opponent";
  minute: number | null;
  scorerName: string | null;
  assistName: string | null;
  /** Player ids, only for telling players apart in the code map (pseudonymize.ts); never sent. */
  scorerId?: string | null;
  assistId?: string | null;
}

export interface MatchSummarySubstitution {
  minute: number | null;
  playerInName: string | null;
  playerOutName: string | null;
}

export interface MatchSummaryPlayerTime {
  playerName: string;
  minutesPlayed: number;
}

export interface MatchSummaryStartingPlayer {
  name: string;
}

export interface MatchSummaryPlayerUsed {
  name: string;
  /** Accumulated playing time in minutes, or null if not reliably tracked. */
  minutesPlayed: number | null;
  /** True if this player was in the starting lineup. */
  started: boolean;
  /** True if this player came on as a substitute. */
  cameOn: boolean;
}

export interface MatchSummaryEvent {
  type: "match_start" | "goal_for" | "goal_against" | "substitution" | "match_end";
  minute: number | null;
  /** Human-readable detail string in Norwegian, for AI narrative context. */
  detail: string;
}

export interface MatchSummaryInput {
  matchId: string;
  teamName: string;
  opponentName: string;
  dateTime: string | null;
  /** Match venue / location, if available. */
  venue: string | null;
  format: "3v3" | "5v5" | "7v7" | "9v9" | "11v11" | null;
  /** Total scheduled match duration in minutes (from runtime state or setup). */
  matchDurationMinutes: number | null;
  scoreFor: number;
  scoreAgainst: number;
  /** Players in the starting lineup, in squad order. Empty if snapshot unavailable. */
  startingPlayers: MatchSummaryStartingPlayer[];
  goalsFor: MatchSummaryGoalFor[];
  goalsAgainst: MatchSummaryGoalAgainst[];
  /** Both sides' recorded goals in recorded order (FEAT-SHARE-02). Optional for older callers. */
  goalTimeline?: MatchSummaryGoal[];
  /** Recorded substitutions for own team, in chronological order. */
  substitutions: MatchSummarySubstitution[];
  /** Number of distinct players who appeared on the pitch (union of starters + subs + tracked time). */
  playersUsed: number;
  /** All players who appeared, with role metadata. Starters first, then subs, sorted by minutes desc. */
  playersUsedList: MatchSummaryPlayerUsed[];
  /** Per-player playing time, sorted by most minutes first. Subset of playersUsedList (only tracked players). */
  playerTimes: MatchSummaryPlayerTime[];
  /** Chronological match events for AI narrative context. */
  matchEvents: MatchSummaryEvent[];
}

/**
 * Short failure codes: never model output, upstream error bodies or names,
 * since they are stored with the report and logged.
 */
export type MatchSummaryFailureCode =
  | "ai_config"
  | "ai_call_failed"
  | "ai_invalid_output"
  | "ai_unknown_code"
  | "ai_wrong_result"
  | "ai_unsupported_detail";

export interface MatchSummaryResult {
  text: string;
  source: "ai" | "fallback";
  failureReason?: MatchSummaryFailureCode;
}
