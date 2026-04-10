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
  NormalizedExternalRsvpEntry,
  SpondRsvpStatus,
  SpondCredentials,
} from "@/lib/server/integrations/spond/types";

interface PlayerRow {
  id: string;
  external_id: string | null;
  name: string;
  is_active: boolean;
}

interface MatchInsertRow {
  id: string;
  team_id: string;
  title: string;
  starts_at: string;
}

interface ExternalEventLinkLookupRow {
  id?: string;
  team_id?: string;
  match_id: string;
  external_event_id: string;
  rsvp_last_synced_at?: string | null;
}

interface MatchLookupRow {
  id: string;
  team_id: string;
}

interface TeamMemberLookupRow {
  id: string;
  external_id: string | null;
  name: string;
}

interface MatchRsvpSnapshotRow {
  id: string;
  match_id: string;
  team_id: string;
  provider: "spond";
  external_event_id: string;
  synced_by: string;
  accepted_count: number;
  declined_count: number;
  unanswered_count: number;
  unconfirmed_count: number;
  waitinglist_count: number;
  total_count: number;
  created_at: string;
}

interface MatchRsvpSnapshotEntryRow {
  snapshot_id: string;
  external_member_id: string;
  player_id: string | null;
  member_name: string;
  response_status: SpondRsvpStatus;
  is_owner: boolean;
}

interface MatchRsvpSnapshotResult {
  snapshotId: string;
  syncedAt: string;
  counts: {
    accepted: number;
    declined: number;
    unanswered: number;
    unconfirmed: number;
    waitinglist: number;
    total: number;
  };
  entries: Array<{
    externalMemberId: string;
    playerId: string | null;
    memberName: string;
    response: SpondRsvpStatus;
    isOwner: boolean;
  }>;
}

function normalizeOwnerResponse(value: string | undefined): SpondRsvpStatus | null {
  switch (value?.toLowerCase()) {
    case "accepted":
      return "accepted";
    case "declined":
      return "declined";
    case "unanswered":
      return "unanswered";
    case "unconfirmed":
      return "unconfirmed";
    case "waitinglist":
      return "waitinglist";
    default:
      return null;
  }
}

function selectHigherPriorityStatus(
  current: SpondRsvpStatus,
  incoming: SpondRsvpStatus
): SpondRsvpStatus {
  const priority: Record<SpondRsvpStatus, number> = {
    accepted: 5,
    declined: 4,
    waitinglist: 3,
    unconfirmed: 2,
    unanswered: 1,
  };

  return priority[incoming] > priority[current] ? incoming : current;
}

function normalizeRsvpEntries(event: {
  responses?: {
    acceptedIds?: string[];
    declinedIds?: string[];
    unansweredIds?: string[];
    unconfirmedIds?: string[];
    waitinglistIds?: string[];
  };
  owners?: Array<{ id: string; response?: string }>;
}): NormalizedExternalRsvpEntry[] {
  const byMemberId = new Map<string, { response: SpondRsvpStatus; isOwner: boolean }>();

  const assign = (memberIds: string[] | undefined, response: SpondRsvpStatus, isOwner: boolean) => {
    for (const memberId of memberIds ?? []) {
      const existing = byMemberId.get(memberId);

      if (!existing) {
        byMemberId.set(memberId, { response, isOwner });
        continue;
      }

      byMemberId.set(memberId, {
        response: selectHigherPriorityStatus(existing.response, response),
        isOwner: existing.isOwner || isOwner,
      });
    }
  };

  assign(event.responses?.acceptedIds, "accepted", false);
  assign(event.responses?.declinedIds, "declined", false);
  assign(event.responses?.unansweredIds, "unanswered", false);
  assign(event.responses?.unconfirmedIds, "unconfirmed", false);
  assign(event.responses?.waitinglistIds, "waitinglist", false);

  for (const owner of event.owners ?? []) {
    const response = normalizeOwnerResponse(owner.response);

    if (!owner.id || !response) {
      continue;
    }

    assign([owner.id], response, true);
  }

  return Array.from(byMemberId.entries()).map(([externalMemberId, value]) => ({
    externalMemberId,
    response: value.response,
    isOwner: value.isOwner,
  }));
}

async function markIntegrationConnectionSynced(
  supabase: SupabaseClient,
  connectionId: string
): Promise<void> {
  const { error: syncError } = await supabase
    .from("integration_connections")
    .update({ last_sync_at: new Date().toISOString(), last_error: null, status: "connected" })
    .eq("id", connectionId);

  if (syncError) {
    throw new IntegrationError("SYNC_MARK_FAILED", syncError.message, 500);
  }
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
    .select("id, team_id, provider, external_team_id, external_team_name, members_last_synced_at, events_last_synced_at, created_by, created_at")
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
  teamLink:
    | {
        externalTeamId: string;
        externalTeamName: string;
        membersLastSyncedAt: string | null;
        eventsLastSyncedAt: string | null;
      }
    | null;
}> {
  const connection = await getConnection(supabase, userId);

  let teamLink:
    | {
        externalTeamId: string;
        externalTeamName: string;
        membersLastSyncedAt: string | null;
        eventsLastSyncedAt: string | null;
      }
    | null = null;

  if (teamId) {
    await requireTeamMembership(supabase, userId, teamId);
    const link = await getTeamLink(supabase, teamId);
    teamLink = link
      ? {
          externalTeamId: link.external_team_id,
          externalTeamName: link.external_team_name,
          membersLastSyncedAt: link.members_last_synced_at,
          eventsLastSyncedAt: link.events_last_synced_at,
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
): Promise<{
  created: number;
  updated: number;
  reactivated: number;
  inactivated: number;
  unchanged: number;
  total: number;
  syncedAt: string;
}> {
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

  const { data: existingRows, error: existingError } = await supabase
    .from("players")
    .select("id, external_id, name, is_active")
    .eq("team_id", teamId)
    .eq("external_provider", "spond")
    .returns<PlayerRow[]>();

  if (existingError) {
    throw new IntegrationError("PLAYER_LOOKUP_FAILED", existingError.message, 500);
  }

  const existingByExternalId = new Map(
    (existingRows ?? [])
      .filter((row) => typeof row.external_id === "string" && row.external_id.length > 0)
      .map((row) => [row.external_id as string, row])
  );

  let created = 0;
  let updated = 0;
  let reactivated = 0;
  let unchanged = 0;
  let inactivated = 0;

  const seenExternalIds = new Set<string>();

  for (const member of members) {
    seenExternalIds.add(member.externalId);
    const existing = existingByExternalId.get(member.externalId);

    if (existing) {
      const shouldRename = existing.name !== member.name;
      const shouldReactivate = !existing.is_active;

      if (shouldRename || shouldReactivate) {
        const { error } = await supabase
          .from("players")
          .update({ name: member.name, is_active: true })
          .eq("id", existing.id);

        if (error) {
          throw new IntegrationError("PLAYER_UPDATE_FAILED", error.message, 500);
        }

        if (shouldRename) {
          updated += 1;
        }

        if (shouldReactivate) {
          reactivated += 1;
        }
      } else {
        unchanged += 1;
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

  const playersToInactivate = (existingRows ?? []).filter((row) => {
    if (!row.external_id) {
      return false;
    }

    if (!row.is_active) {
      return false;
    }

    return !seenExternalIds.has(row.external_id);
  });

  for (const player of playersToInactivate) {
    const { error } = await supabase
      .from("players")
      .update({ is_active: false })
      .eq("id", player.id);

    if (error) {
      throw new IntegrationError("PLAYER_DEACTIVATE_FAILED", error.message, 500);
    }

    inactivated += 1;
  }

  const syncedAt = new Date().toISOString();

  const { error: linkSyncError } = await supabase
    .from("external_team_links")
    .update({ members_last_synced_at: syncedAt })
    .eq("id", link.id);

  if (linkSyncError) {
    throw new IntegrationError("TEAM_LINK_SYNC_MARK_FAILED", linkSyncError.message, 500);
  }

  await markIntegrationConnectionSynced(supabase, connection.id);

  return {
    created,
    updated,
    reactivated,
    inactivated,
    unchanged,
    total: members.length,
    syncedAt,
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

export async function syncSpondUpcomingEventsForTeam(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<{
  teamLink: { externalTeamId: string; externalTeamName: string };
  events: Array<NormalizedExternalEvent & { importedMatchId: string | null }>;
  syncedAt: string;
  total: number;
}> {
  const result = await getSpondUpcomingEventsForTeam(supabase, userId, teamId);
  const syncedAt = new Date().toISOString();

  const { data: link, error: linkError } = await supabase
    .from("external_team_links")
    .select("id")
    .eq("team_id", teamId)
    .eq("provider", "spond")
    .maybeSingle<{ id: string }>();

  if (linkError) {
    throw new IntegrationError("TEAM_LINK_SYNC_MARK_FAILED", linkError.message, 500);
  }

  if (!link) {
    throw new IntegrationError("TEAM_LINK_NOT_FOUND", "Velg en Spond-gruppe først.", 400);
  }

  const { error: syncError } = await supabase
    .from("external_team_links")
    .update({ events_last_synced_at: syncedAt })
    .eq("id", link.id);

  if (syncError) {
    throw new IntegrationError("TEAM_LINK_SYNC_MARK_FAILED", syncError.message, 500);
  }

  const connection = await getConnection(supabase, userId);

  if (!connection) {
    throw new IntegrationError("CONNECTION_NOT_FOUND", "Spond er ikke koblet til ennå.", 404);
  }

  await markIntegrationConnectionSynced(supabase, connection.id);

  return {
    ...result,
    syncedAt,
    total: result.events.length,
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

  await markIntegrationConnectionSynced(supabase, connection.id);

  return {
    matchId: createdMatch.id,
    alreadyImported: false,
  };
}

export async function syncSpondRsvpForMatch(
  supabase: SupabaseClient,
  userId: string,
  matchId: string
): Promise<MatchRsvpSnapshotResult> {
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, team_id")
    .eq("id", matchId)
    .maybeSingle<MatchLookupRow>();

  if (matchError) {
    throw new IntegrationError("MATCH_READ_FAILED", matchError.message, 500);
  }

  if (!match) {
    throw new IntegrationError("MATCH_NOT_FOUND", "Fant ikke kampen.", 404);
  }

  await requireTeamMembership(supabase, userId, match.team_id);

  const connection = await getConnection(supabase, userId);

  if (!connection) {
    throw new IntegrationError("CONNECTION_NOT_FOUND", "Spond er ikke koblet til ennå.", 404);
  }

  const teamLink = await getTeamLink(supabase, match.team_id);

  if (!teamLink) {
    throw new IntegrationError("TEAM_LINK_NOT_FOUND", "Velg en Spond-gruppe først.", 400);
  }

  const { data: eventLink, error: eventLinkError } = await supabase
    .from("external_event_links")
    .select("id, team_id, match_id, external_event_id")
    .eq("match_id", match.id)
    .eq("team_id", match.team_id)
    .eq("provider", "spond")
    .maybeSingle<ExternalEventLinkLookupRow>();

  if (eventLinkError) {
    throw new IntegrationError("EVENT_LINK_LOOKUP_FAILED", eventLinkError.message, 500);
  }

  if (!eventLink?.id) {
    throw new IntegrationError("MATCH_NOT_SPOND", "Kampen er ikke koblet til et Spond-arrangement.", 400);
  }

  const credentials = decryptJson<SpondCredentials>(connection.credentials_encrypted);
  const [groups, event] = await Promise.all([
    spondProvider.getGroups(credentials),
    spondProvider.getEvent(credentials, eventLink.external_event_id),
  ]);

  const linkedGroup = groups.find((group) => group.id === teamLink.external_team_id);
  const memberNameById = new Map<string, string>();

  for (const member of linkedGroup?.members ?? []) {
    const fallbackName = `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim();
    const displayName = fallbackName || member.email?.trim() || member.id;
    memberNameById.set(member.id, displayName);
  }

  const normalizedEntries = normalizeRsvpEntries(event);
  const externalIds = normalizedEntries.map((entry) => entry.externalMemberId);

  let playersByExternalId = new Map<string, TeamMemberLookupRow>();

  if (externalIds.length > 0) {
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, external_id, name")
      .eq("team_id", match.team_id)
      .eq("external_provider", "spond")
      .in("external_id", externalIds)
      .returns<TeamMemberLookupRow[]>();

    if (playersError) {
      throw new IntegrationError("PLAYER_LOOKUP_FAILED", playersError.message, 500);
    }

    playersByExternalId = new Map(
      (players ?? [])
        .filter((player) => typeof player.external_id === "string" && player.external_id.length > 0)
        .map((player) => [player.external_id as string, player])
    );
  }

  const counts = {
    accepted: normalizedEntries.filter((entry) => entry.response === "accepted").length,
    declined: normalizedEntries.filter((entry) => entry.response === "declined").length,
    unanswered: normalizedEntries.filter((entry) => entry.response === "unanswered").length,
    unconfirmed: normalizedEntries.filter((entry) => entry.response === "unconfirmed").length,
    waitinglist: normalizedEntries.filter((entry) => entry.response === "waitinglist").length,
    total: normalizedEntries.length,
  };

  const { data: snapshot, error: snapshotError } = await supabase
    .from("match_rsvp_snapshots")
    .insert({
      match_id: match.id,
      team_id: match.team_id,
      provider: "spond",
      external_event_id: eventLink.external_event_id,
      synced_by: userId,
      accepted_count: counts.accepted,
      declined_count: counts.declined,
      unanswered_count: counts.unanswered,
      unconfirmed_count: counts.unconfirmed,
      waitinglist_count: counts.waitinglist,
      total_count: counts.total,
    })
    .select("id, match_id, team_id, provider, external_event_id, synced_by, accepted_count, declined_count, unanswered_count, unconfirmed_count, waitinglist_count, total_count, created_at")
    .single<MatchRsvpSnapshotRow>();

  if (snapshotError) {
    throw new IntegrationError("RSVP_SNAPSHOT_CREATE_FAILED", snapshotError.message, 500);
  }

  const entriesToInsert = normalizedEntries.map((entry) => {
    const linkedPlayer = playersByExternalId.get(entry.externalMemberId);
    const memberName =
      linkedPlayer?.name ?? memberNameById.get(entry.externalMemberId) ?? entry.externalMemberId;

    return {
      snapshot_id: snapshot.id,
      team_id: match.team_id,
      player_id: linkedPlayer?.id ?? null,
      external_member_id: entry.externalMemberId,
      member_name: memberName,
      response_status: entry.response,
      is_owner: entry.isOwner,
    };
  });

  if (entriesToInsert.length > 0) {
    const { error: entriesError } = await supabase
      .from("match_rsvp_snapshot_entries")
      .insert(entriesToInsert);

    if (entriesError) {
      throw new IntegrationError("RSVP_ENTRIES_CREATE_FAILED", entriesError.message, 500);
    }
  }

  const syncedAt = snapshot.created_at;

  const { error: eventSyncError } = await supabase
    .from("external_event_links")
    .update({ rsvp_last_synced_at: syncedAt })
    .eq("id", eventLink.id);

  if (eventSyncError) {
    throw new IntegrationError("EVENT_LINK_SYNC_MARK_FAILED", eventSyncError.message, 500);
  }

  await markIntegrationConnectionSynced(supabase, connection.id);

  return {
    snapshotId: snapshot.id,
    syncedAt,
    counts,
    entries: entriesToInsert.map((entry) => ({
      externalMemberId: entry.external_member_id,
      playerId: entry.player_id,
      memberName: entry.member_name,
      response: entry.response_status,
      isOwner: entry.is_owner,
    })),
  };
}

export async function getLatestSpondRsvpSnapshotForMatch(
  supabase: SupabaseClient,
  userId: string,
  matchId: string
): Promise<MatchRsvpSnapshotResult | null> {
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, team_id")
    .eq("id", matchId)
    .maybeSingle<MatchLookupRow>();

  if (matchError) {
    throw new IntegrationError("MATCH_READ_FAILED", matchError.message, 500);
  }

  if (!match) {
    throw new IntegrationError("MATCH_NOT_FOUND", "Fant ikke kampen.", 404);
  }

  await requireTeamMembership(supabase, userId, match.team_id);

  const { data: snapshot, error: snapshotError } = await supabase
    .from("match_rsvp_snapshots")
    .select("id, match_id, team_id, provider, external_event_id, synced_by, accepted_count, declined_count, unanswered_count, unconfirmed_count, waitinglist_count, total_count, created_at")
    .eq("match_id", match.id)
    .eq("provider", "spond")
    .order("created_at", { ascending: false })
    .maybeSingle<MatchRsvpSnapshotRow>();

  if (snapshotError) {
    throw new IntegrationError("RSVP_SNAPSHOT_READ_FAILED", snapshotError.message, 500);
  }

  if (!snapshot) {
    return null;
  }

  const { data: entries, error: entriesError } = await supabase
    .from("match_rsvp_snapshot_entries")
    .select("snapshot_id, external_member_id, player_id, member_name, response_status, is_owner")
    .eq("snapshot_id", snapshot.id)
    .order("member_name", { ascending: true })
    .returns<MatchRsvpSnapshotEntryRow[]>();

  if (entriesError) {
    throw new IntegrationError("RSVP_ENTRIES_READ_FAILED", entriesError.message, 500);
  }

  return {
    snapshotId: snapshot.id,
    syncedAt: snapshot.created_at,
    counts: {
      accepted: snapshot.accepted_count,
      declined: snapshot.declined_count,
      unanswered: snapshot.unanswered_count,
      unconfirmed: snapshot.unconfirmed_count,
      waitinglist: snapshot.waitinglist_count,
      total: snapshot.total_count,
    },
    entries: (entries ?? []).map((entry) => ({
      externalMemberId: entry.external_member_id,
      playerId: entry.player_id,
      memberName: entry.member_name,
      response: entry.response_status,
      isOwner: entry.is_owner,
    })),
  };
}
