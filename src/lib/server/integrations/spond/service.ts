import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptJson, encryptJson } from "@/lib/server/integrations/spond/crypto";
import { IntegrationError } from "@/lib/server/integrations/spond/errors";
import { toAccountLabel, toNormalizedEvent, toNormalizedGroup, toNormalizedMembers } from "@/lib/server/integrations/spond/mapper";
import { spondProvider } from "@/lib/server/integrations/spond/provider";
import type {
  ExternalTeamLinkRow,
  IntegrationConnectionRow,
  NormalizedExternalEvent,
  NormalizedExternalGroup,
  SpondCredentials,
} from "@/lib/server/integrations/spond/types";

interface PlayerRow {
  id: string;
  external_id: string | null;
  name: string;
}

interface MatchInsertRow {
  id: string;
  team_id: string;
  title: string;
  starts_at: string;
}

interface ExternalEventLinkLookupRow {
  match_id: string;
  external_event_id: string;
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

async function getConnection(
  supabase: SupabaseClient,
  userId: string
): Promise<IntegrationConnectionRow | null> {
  const { data, error } = await supabase
    .from("integration_connections")
    .select("id, user_id, provider, status, account_label, credentials_encrypted, last_sync_at, last_error, created_at, updated_at")
    .eq("user_id", userId)
    .eq("provider", "spond")
    .maybeSingle<IntegrationConnectionRow>();

  if (error) {
    throw new IntegrationError("CONNECTION_READ_FAILED", error.message, 500);
  }

  return data ?? null;
}

async function getTeamLink(
  supabase: SupabaseClient,
  teamId: string
): Promise<ExternalTeamLinkRow | null> {
  const { data, error } = await supabase
    .from("external_team_links")
    .select("id, team_id, provider, external_team_id, external_team_name, created_by, created_at")
    .eq("team_id", teamId)
    .eq("provider", "spond")
    .maybeSingle<ExternalTeamLinkRow>();

  if (error) {
    throw new IntegrationError("TEAM_LINK_READ_FAILED", error.message, 500);
  }

  return data ?? null;
}

export async function connectSpond(
  supabase: SupabaseClient,
  userId: string,
  credentials: SpondCredentials
): Promise<{ accountLabel: string | null }> {
  const verified = await spondProvider.verifyCredentials(credentials);
  const encryptedCredentials = encryptJson(credentials);

  const { error } = await supabase.from("integration_connections").upsert(
    {
      user_id: userId,
      provider: "spond",
      status: "connected",
      account_label: toAccountLabel(verified.profile),
      credentials_encrypted: encryptedCredentials,
      last_error: null,
    },
    {
      onConflict: "user_id,provider",
      ignoreDuplicates: false,
    }
  );

  if (error) {
    throw new IntegrationError("CONNECTION_SAVE_FAILED", error.message, 500);
  }

  return {
    accountLabel: toAccountLabel(verified.profile),
  };
}

export async function getSpondGroups(
  supabase: SupabaseClient,
  userId: string
): Promise<NormalizedExternalGroup[]> {
  const connection = await getConnection(supabase, userId);

  if (!connection) {
    throw new IntegrationError("CONNECTION_NOT_FOUND", "Spond er ikke koblet til ennå.", 404);
  }

  const credentials = decryptJson<SpondCredentials>(connection.credentials_encrypted);
  const groups = await spondProvider.getGroups(credentials);
  return groups.map(toNormalizedGroup);
}

export async function upsertTeamSpondLink(
  supabase: SupabaseClient,
  userId: string,
  teamId: string,
  externalTeamId: string,
  externalTeamName: string
): Promise<void> {
  await requireTeamMembership(supabase, userId, teamId);

  const { error } = await supabase.from("external_team_links").upsert(
    {
      team_id: teamId,
      provider: "spond",
      external_team_id: externalTeamId,
      external_team_name: externalTeamName,
      created_by: userId,
    },
    {
      onConflict: "team_id,provider",
      ignoreDuplicates: false,
    }
  );

  if (error) {
    throw new IntegrationError("TEAM_LINK_SAVE_FAILED", error.message, 500);
  }
}

export async function getSpondStatus(
  supabase: SupabaseClient,
  userId: string,
  teamId?: string
): Promise<{
  connected: boolean;
  accountLabel: string | null;
  teamLink: { externalTeamId: string; externalTeamName: string } | null;
}> {
  const connection = await getConnection(supabase, userId);

  let teamLink: { externalTeamId: string; externalTeamName: string } | null = null;

  if (teamId) {
    await requireTeamMembership(supabase, userId, teamId);
    const link = await getTeamLink(supabase, teamId);
    teamLink = link
      ? {
          externalTeamId: link.external_team_id,
          externalTeamName: link.external_team_name,
        }
      : null;
  }

  return {
    connected: Boolean(connection && connection.status === "connected"),
    accountLabel: connection?.account_label ?? null,
    teamLink,
  };
}

export async function importSpondMembersToTeam(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<{ created: number; updated: number; total: number }> {
  await requireTeamMembership(supabase, userId, teamId);

  const connection = await getConnection(supabase, userId);

  if (!connection) {
    throw new IntegrationError("CONNECTION_NOT_FOUND", "Spond er ikke koblet til ennå.", 404);
  }

  const link = await getTeamLink(supabase, teamId);

  if (!link) {
    throw new IntegrationError("TEAM_LINK_NOT_FOUND", "Velg en Spond-gruppe først.", 400);
  }

  const credentials = decryptJson<SpondCredentials>(connection.credentials_encrypted);
  const groups = await spondProvider.getGroups(credentials);
  const selectedGroup = groups.find((group) => group.id === link.external_team_id);

  if (!selectedGroup) {
    throw new IntegrationError("GROUP_NOT_FOUND", "Fant ikke valgt Spond-gruppe.", 404);
  }

  const members = toNormalizedMembers(selectedGroup);

  if (members.length === 0) {
    throw new IntegrationError("NO_MEMBERS_FOUND", "Fant ingen medlemmer i valgt gruppe.", 400);
  }

  const externalIds = members.map((member) => member.externalId);

  const { data: existingRows, error: existingError } = await supabase
    .from("players")
    .select("id, external_id, name")
    .eq("team_id", teamId)
    .eq("external_provider", "spond")
    .in("external_id", externalIds)
    .returns<PlayerRow[]>();

  if (existingError) {
    throw new IntegrationError("PLAYER_LOOKUP_FAILED", existingError.message, 500);
  }

  const existingByExternalId = new Map((existingRows ?? []).map((row) => [row.external_id, row]));

  let created = 0;
  let updated = 0;

  for (const member of members) {
    const existing = existingByExternalId.get(member.externalId);

    if (existing) {
      if (existing.name !== member.name) {
        const { error } = await supabase
          .from("players")
          .update({ name: member.name, is_active: true })
          .eq("id", existing.id);

        if (error) {
          throw new IntegrationError("PLAYER_UPDATE_FAILED", error.message, 500);
        }

        updated += 1;
      }

      continue;
    }

    const { error } = await supabase.from("players").insert({
      team_id: teamId,
      name: member.name,
      is_active: true,
      source: "spond",
      external_provider: "spond",
      external_id: member.externalId,
      is_managed: true,
    });

    if (error) {
      throw new IntegrationError("PLAYER_IMPORT_FAILED", error.message, 500);
    }

    created += 1;
  }

  const { error: syncError } = await supabase
    .from("integration_connections")
    .update({ last_sync_at: new Date().toISOString(), last_error: null, status: "connected" })
    .eq("id", connection.id);

  if (syncError) {
    throw new IntegrationError("SYNC_MARK_FAILED", syncError.message, 500);
  }

  return {
    created,
    updated,
    total: members.length,
  };
}

export async function getSpondUpcomingEventsForTeam(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<{
  teamLink: { externalTeamId: string; externalTeamName: string };
  events: Array<NormalizedExternalEvent & { importedMatchId: string | null }>;
}> {
  await requireTeamMembership(supabase, userId, teamId);

  const connection = await getConnection(supabase, userId);

  if (!connection) {
    throw new IntegrationError("CONNECTION_NOT_FOUND", "Spond er ikke koblet til ennå.", 404);
  }

  const teamLink = await getTeamLink(supabase, teamId);

  if (!teamLink) {
    throw new IntegrationError("TEAM_LINK_NOT_FOUND", "Velg en Spond-gruppe først.", 400);
  }

  const credentials = decryptJson<SpondCredentials>(connection.credentials_encrypted);
  const events = await spondProvider.getUpcomingEvents(credentials, teamLink.external_team_id);
  const normalized = events.map(toNormalizedEvent);

  const externalIds = normalized.map((event) => event.externalId);

  let importedByExternalId = new Map<string, string>();

  if (externalIds.length > 0) {
    const { data: existingLinks, error } = await supabase
      .from("external_event_links")
      .select("match_id, external_event_id")
      .eq("team_id", teamId)
      .eq("provider", "spond")
      .in("external_event_id", externalIds)
      .returns<ExternalEventLinkLookupRow[]>();

    if (error) {
      throw new IntegrationError("EVENT_LINK_LOOKUP_FAILED", error.message, 500);
    }

    importedByExternalId = new Map(
      (existingLinks ?? []).map((row) => [row.external_event_id, row.match_id])
    );
  }

  return {
    teamLink: {
      externalTeamId: teamLink.external_team_id,
      externalTeamName: teamLink.external_team_name,
    },
    events: normalized.map((event) => ({
      ...event,
      importedMatchId: importedByExternalId.get(event.externalId) ?? null,
    })),
  };
}

export async function importSpondEventToMatch(
  supabase: SupabaseClient,
  userId: string,
  teamId: string,
  externalEventId: string
): Promise<{ matchId: string; alreadyImported: boolean }> {
  await requireTeamMembership(supabase, userId, teamId);

  const connection = await getConnection(supabase, userId);

  if (!connection) {
    throw new IntegrationError("CONNECTION_NOT_FOUND", "Spond er ikke koblet til ennå.", 404);
  }

  const teamLink = await getTeamLink(supabase, teamId);

  if (!teamLink) {
    throw new IntegrationError("TEAM_LINK_NOT_FOUND", "Velg en Spond-gruppe først.", 400);
  }

  const { data: existingLink, error: existingLinkError } = await supabase
    .from("external_event_links")
    .select("match_id")
    .eq("team_id", teamId)
    .eq("provider", "spond")
    .eq("external_event_id", externalEventId)
    .maybeSingle<{ match_id: string }>();

  if (existingLinkError) {
    throw new IntegrationError("EVENT_LINK_LOOKUP_FAILED", existingLinkError.message, 500);
  }

  if (existingLink) {
    return {
      matchId: existingLink.match_id,
      alreadyImported: true,
    };
  }

  const credentials = decryptJson<SpondCredentials>(connection.credentials_encrypted);
  const events = await spondProvider.getUpcomingEvents(credentials, teamLink.external_team_id);
  const normalized = events.map(toNormalizedEvent);
  const selected = normalized.find((event) => event.externalId === externalEventId);

  if (!selected) {
    throw new IntegrationError("EVENT_NOT_FOUND", "Fant ikke valgt Spond-arrangement.", 404);
  }

  if (!selected.startsAt) {
    throw new IntegrationError("EVENT_MISSING_START", "Arrangementet mangler tidspunkt og kan ikke importeres.", 400);
  }

  const { data: createdMatch, error: createMatchError } = await supabase
    .from("matches")
    .insert({
      team_id: teamId,
      title: selected.title,
      starts_at: selected.startsAt,
      location: selected.location,
      status: "upcoming",
      created_by: userId,
    })
    .select("id, team_id, title, starts_at")
    .single<MatchInsertRow>();

  if (createMatchError) {
    throw new IntegrationError("MATCH_CREATE_FAILED", createMatchError.message, 500);
  }

  const { error: createLinkError } = await supabase
    .from("external_event_links")
    .insert({
      match_id: createdMatch.id,
      team_id: teamId,
      provider: "spond",
      external_event_id: selected.externalId,
      external_team_id: teamLink.external_team_id,
      external_event_name: selected.title,
    });

  if (createLinkError) {
    throw new IntegrationError("EVENT_LINK_CREATE_FAILED", createLinkError.message, 500);
  }

  const { error: syncError } = await supabase
    .from("integration_connections")
    .update({ last_sync_at: new Date().toISOString(), last_error: null, status: "connected" })
    .eq("id", connection.id);

  if (syncError) {
    throw new IntegrationError("SYNC_MARK_FAILED", syncError.message, 500);
  }

  return {
    matchId: createdMatch.id,
    alreadyImported: false,
  };
}
