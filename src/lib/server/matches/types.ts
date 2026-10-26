export type MatchStatus = "draft" | "upcoming" | "live" | "completed";
export type MatchFormat = "3v3" | "5v5" | "7v7" | "9v9" | "11v11";
export type MatchReportStatus = "not_requested" | "pending" | "ready" | "failed";

export type MatchEventType =
  | "goal_for"
  | "goal_against"
  | "substitution"
  | "penalty"
  | "corner"
  | "free_kick"
  | "card_yellow"
  | "card_red"
  | "own_goal"
  | "period_start"
  | "period_end";

export type MatchEventTeamSide = "own" | "opponent" | null;

export interface MatchRow {
  id: string;
  team_id: string;
  title: string;
  opponent_name: string | null;
  starts_at: string;
  location: string | null;
  format?: MatchFormat;
  status: MatchStatus;
  report_enabled?: boolean;
  report_status?: MatchReportStatus;
  report_text?: string | null;
  report_generated_at?: string | null;
  score_for?: number;
  score_against?: number;
  started_at?: string | null;
  ended_at?: string | null;
  runtime_state?: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ExternalEventLinkRow {
  id: string;
  match_id: string;
  team_id: string;
  provider: "spond";
  external_event_id: string;
  external_team_id: string | null;
  external_event_name: string | null;
  rsvp_last_synced_at: string | null;
  imported_at: string;
  created_at: string;
}

export interface MatchListItem {
  id: string;
  teamId: string;
  title: string;
  opponentName: string | null;
  startsAt: string;
  location: string | null;
  format: MatchFormat;
  status: MatchStatus;
  reportEnabled: boolean;
  reportStatus: MatchReportStatus;
  reportText: string | null;
  reportGeneratedAt: string | null;
  scoreFor: number;
  scoreAgainst: number;
  startedAt: string | null;
  endedAt: string | null;
  runtimeState: Record<string, unknown> | null;
  source: "manual" | "spond";
  externalEventId: string | null;
  rsvpLastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMatchInput {
  teamId: string;
  title: string;
  opponentName?: string | null;
  startsAt: string;
  location?: string | null;
  format?: MatchFormat;
  reportEnabled?: boolean;
  status?: MatchStatus;
  /**
   * Row id chosen by the device (MATCH-13). A repeat with the same id answers
   * with the existing row instead of creating a second match.
   */
  id?: string;
  /** When the match was started on the device; only for a live or completed match. */
  startedAt?: string;
}

export interface UpdateMatchStatusInput {
  matchId: string;
  status?: MatchStatus;
  runtimeState?: Record<string, unknown> | null;
  scoreFor?: number;
  scoreAgainst?: number;
  reportEnabled?: boolean;
  reportStatus?: MatchReportStatus;
  reportText?: string | null;
  reportGeneratedAt?: string | null;
  /** ISO time the coach ended the match on the device (completion only). */
  endedAt?: string;
  /** ISO time the coach started the match on the device (start only; a start synced later). */
  startedAt?: string;
}

export interface MatchEventRow {
  id: string;
  match_id: string;
  type: MatchEventType;
  minute: number | null;
  timestamp_ms: number | null;
  team_side: MatchEventTeamSide;
  primary_player_id: string | null;
  secondary_player_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface MatchEventItem {
  id: string;
  matchId: string;
  type: MatchEventType;
  minute: number | null;
  timestampMs: number | null;
  teamSide: MatchEventTeamSide;
  primaryPlayerId: string | null;
  secondaryPlayerId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
