import type { SupabaseClient } from "@supabase/supabase-js";
import { IntegrationError } from "@/lib/server/integrations/spond/errors";
import type {
  CreateMatchInput,
  ExternalEventLinkRow,
  MatchListItem,
  MatchRow,
} from "@/lib/server/matches/types";

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

function mapMatchRows(rows: MatchRow[], links: ExternalEventLinkRow[]): MatchListItem[] {
  const linksByMatchId = new Map(links.map((row) => [row.match_id, row]));

  return rows.map((row) => {
    const link = linksByMatchId.get(row.id);

    return {
      id: row.id,
      teamId: row.team_id,
      title: row.title,
      opponentName: row.opponent_name,
      startsAt: row.starts_at,
      location: row.location,
      status: row.status,
      source: link ? "spond" : "manual",
      externalEventId: link?.external_event_id ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function getTeamMatches(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<MatchListItem[]> {
  await requireTeamMembership(supabase, userId, teamId);

  const { data: matchRows, error: matchError } = await supabase
    .from("matches")
    .select("id, team_id, title, opponent_name, starts_at, location, status, created_by, created_at, updated_at")
    .eq("team_id", teamId)
    .order("starts_at", { ascending: true })
    .returns<MatchRow[]>();

  if (matchError) {
    throw new IntegrationError("MATCH_LIST_FAILED", matchError.message, 500);
  }

  const rows = matchRows ?? [];

  if (rows.length === 0) {
    return [];
  }

  const matchIds = rows.map((row) => row.id);

  const { data: links, error: linksError } = await supabase
    .from("external_event_links")
    .select("id, match_id, team_id, provider, external_event_id, external_team_id, external_event_name, imported_at, created_at")
    .in("match_id", matchIds)
    .eq("provider", "spond")
    .returns<ExternalEventLinkRow[]>();

  if (linksError) {
    throw new IntegrationError("MATCH_LINKS_FAILED", linksError.message, 500);
  }

  return mapMatchRows(rows, links ?? []);
}

export async function getMatchById(
  supabase: SupabaseClient,
  userId: string,
  matchId: string
): Promise<MatchListItem> {
  const { data: row, error } = await supabase
    .from("matches")
    .select("id, team_id, title, opponent_name, starts_at, location, status, created_by, created_at, updated_at")
    .eq("id", matchId)
    .maybeSingle<MatchRow>();

  if (error) {
    throw new IntegrationError("MATCH_READ_FAILED", error.message, 500);
  }

  if (!row) {
    throw new IntegrationError("MATCH_NOT_FOUND", "Fant ikke kampen.", 404);
  }

  await requireTeamMembership(supabase, userId, row.team_id);

  const { data: link, error: linkError } = await supabase
    .from("external_event_links")
    .select("id, match_id, team_id, provider, external_event_id, external_team_id, external_event_name, imported_at, created_at")
    .eq("match_id", row.id)
    .eq("provider", "spond")
    .maybeSingle<ExternalEventLinkRow>();

  if (linkError) {
    throw new IntegrationError("MATCH_LINK_READ_FAILED", linkError.message, 500);
  }

  return mapMatchRows([row], link ? [link] : [])[0];
}

export async function createManualMatch(
  supabase: SupabaseClient,
  userId: string,
  input: CreateMatchInput
): Promise<MatchListItem> {
  await requireTeamMembership(supabase, userId, input.teamId);

  const { data: row, error } = await supabase
    .from("matches")
    .insert({
      team_id: input.teamId,
      title: input.title,
      opponent_name: input.opponentName ?? null,
      starts_at: input.startsAt,
      location: input.location ?? null,
      status: input.status ?? "upcoming",
      created_by: userId,
    })
    .select("id, team_id, title, opponent_name, starts_at, location, status, created_by, created_at, updated_at")
    .single<MatchRow>();

  if (error) {
    throw new IntegrationError("MATCH_CREATE_FAILED", error.message, 500);
  }

  return mapMatchRows([row], [])[0];
}
