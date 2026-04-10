import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IntegrationError } from "@/lib/server/integrations/spond/errors";
import type { MatchEventItem, MatchEventRow, MatchRow } from "@/lib/server/matches/types";
import type { MatchSummaryInput } from "@/lib/server/ai/match-summary/types";

const MATCH_SELECT = "id, team_id, title, opponent_name, starts_at, format, score_for, score_against";
const MATCH_EVENT_SELECT = "id, match_id, type, minute, timestamp_ms, team_side, primary_player_id, secondary_player_id, payload, created_at, updated_at";

interface TeamNameRow {
  id: string;
  name: string;
}

async function requireTeamMembership(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle<{ team_id: string }>();

  if (error) {
    throw new IntegrationError("TEAM_LOOKUP_FAILED", error.message, 500);
  }

  if (!data) {
    throw new IntegrationError("TEAM_NOT_FOUND", "Du har ikke tilgang til dette laget.", 404);
  }
}

function mapMatchEvents(rows: MatchEventRow[]): MatchEventItem[] {
  return rows.map((row) => ({
    id: row.id,
    matchId: row.match_id,
    type: row.type,
    minute: row.minute,
    timestampMs: row.timestamp_ms,
    teamSide: row.team_side,
    primaryPlayerId: row.primary_player_id,
    secondaryPlayerId: row.secondary_player_id,
    payload: row.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function resolveMinute(event: MatchEventItem): number | null {
  if (typeof event.minute === "number") {
    return Math.max(0, Math.floor(event.minute));
  }

  if (typeof event.timestampMs === "number") {
    return Math.max(0, Math.floor(event.timestampMs / 60000));
  }

  return null;
}

function payloadName(payload: Record<string, unknown> | null, key: string): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function buildMatchSummaryInput(
  supabase: SupabaseClient,
  userId: string,
  matchId: string
): Promise<MatchSummaryInput> {
  const { data: matchRow, error: matchError } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .eq("id", matchId)
    .maybeSingle<MatchRow>();

  if (matchError) {
    throw new IntegrationError("MATCH_READ_FAILED", matchError.message, 500);
  }

  if (!matchRow) {
    throw new IntegrationError("MATCH_NOT_FOUND", "Fant ikke kampen.", 404);
  }

  await requireTeamMembership(supabase, userId, matchRow.team_id);

  const { data: eventRows, error: eventError } = await supabase
    .from("match_events")
    .select(MATCH_EVENT_SELECT)
    .eq("match_id", matchId)
    .order("timestamp_ms", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .returns<MatchEventRow[]>();

  if (eventError) {
    throw new IntegrationError("MATCH_EVENTS_READ_FAILED", eventError.message, 500);
  }

  const events = mapMatchEvents(eventRows ?? []);

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, name")
    .eq("id", matchRow.team_id)
    .maybeSingle<TeamNameRow>();

  if (teamError) {
    throw new IntegrationError("MATCH_TEAM_READ_FAILED", teamError.message, 500);
  }

  const goalsFor = events
    .filter((event) => event.type === "goal_for")
    .map((event) => ({
      minute: resolveMinute(event),
      scorerName: payloadName(event.payload, "primaryPlayerName"),
      assistName: payloadName(event.payload, "secondaryPlayerName"),
    }));

  const goalsAgainst = events
    .filter((event) => event.type === "goal_against")
    .map((event) => ({
      minute: resolveMinute(event),
    }));

  return {
    matchId,
    teamName: team?.name?.trim() || matchRow.title || "Laget",
    opponentName: matchRow.opponent_name?.trim() || "motstanderen",
    dateTime: matchRow.starts_at ?? null,
    format: matchRow.format ?? null,
    scoreFor: Math.max(0, Math.floor(matchRow.score_for ?? 0)),
    scoreAgainst: Math.max(0, Math.floor(matchRow.score_against ?? 0)),
    goalsFor,
    goalsAgainst,
  };
}
