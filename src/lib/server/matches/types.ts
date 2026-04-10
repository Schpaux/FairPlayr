export type MatchStatus = "draft" | "upcoming" | "live" | "completed";

export interface MatchRow {
  id: string;
  team_id: string;
  title: string;
  opponent_name: string | null;
  starts_at: string;
  location: string | null;
  status: MatchStatus;
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
  status: MatchStatus;
  source: "manual" | "spond";
  externalEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMatchInput {
  teamId: string;
  title: string;
  opponentName?: string | null;
  startsAt: string;
  location?: string | null;
  status?: MatchStatus;
}
