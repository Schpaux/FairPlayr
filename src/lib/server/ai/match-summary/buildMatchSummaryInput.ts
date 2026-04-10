import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IntegrationError } from "@/lib/server/integrations/spond/errors";
import { getMatchById, getMatchEvents } from "@/lib/server/matches/service";
import type { MatchEventItem } from "@/lib/server/matches/types";
import type { MatchSummaryInput } from "@/lib/server/ai/match-summary/types";

interface TeamNameRow {
  id: string;
  name: string;
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
  const match = await getMatchById(supabase, userId, matchId);
  const events = await getMatchEvents(supabase, userId, matchId);

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, name")
    .eq("id", match.teamId)
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
    matchId: match.id,
    teamName: team?.name?.trim() || match.title || "Laget",
    opponentName: match.opponentName?.trim() || "motstanderen",
    dateTime: match.startsAt ?? null,
    format: match.format ?? null,
    scoreFor: Math.max(0, Math.floor(match.scoreFor)),
    scoreAgainst: Math.max(0, Math.floor(match.scoreAgainst)),
    goalsFor,
    goalsAgainst,
  };
}
