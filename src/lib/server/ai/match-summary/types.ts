import "server-only";

export interface MatchSummaryGoalFor {
  minute: number | null;
  scorerName: string | null;
  assistName: string | null;
}

export interface MatchSummaryGoalAgainst {
  minute: number | null;
}

export interface MatchSummaryInput {
  matchId: string;
  teamName: string;
  opponentName: string;
  dateTime: string | null;
  format: "3v3" | "5v5" | "7v7" | "9v9" | "11v11" | null;
  scoreFor: number;
  scoreAgainst: number;
  goalsFor: MatchSummaryGoalFor[];
  goalsAgainst: MatchSummaryGoalAgainst[];
}

export interface MatchSummaryResult {
  text: string;
  source: "ai" | "fallback";
}
