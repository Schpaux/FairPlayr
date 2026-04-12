import "server-only";

export interface MatchSummaryGoalFor {
  minute: number | null;
  scorerName: string | null;
  assistName: string | null;
}

export interface MatchSummaryGoalAgainst {
  minute: number | null;
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

export interface MatchSummaryInput {
  matchId: string;
  teamName: string;
  opponentName: string;
  dateTime: string | null;
  format: "3v3" | "5v5" | "7v7" | "9v9" | "11v11" | null;
  /** Total scheduled match duration in minutes (from runtime state or setup). */
  matchDurationMinutes: number | null;
  scoreFor: number;
  scoreAgainst: number;
  goalsFor: MatchSummaryGoalFor[];
  goalsAgainst: MatchSummaryGoalAgainst[];
  /** Recorded substitutions for own team, in chronological order. */
  substitutions: MatchSummarySubstitution[];
  /** Number of distinct players who appeared on the pitch. */
  playersUsed: number;
  /** Per-player playing time, sorted by most minutes first. */
  playerTimes: MatchSummaryPlayerTime[];
}

export interface MatchSummaryResult {
  text: string;
  source: "ai" | "fallback";
}
