import type { SupabaseClient } from "@supabase/supabase-js";
import type { Player, Team } from "@/domain/team";
import type { TeamRepository } from "@/lib/teamData/types";
import { ensureUserProfile } from "@/lib/supabase/profile";

interface TeamRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface TeamMemberRow {
  team_id: string;
}

interface ProfilePreferenceRow {
  active_team_id: string | null;
}

interface PlayerRow {
  id: string;
  name: string;
  number: number | null;
  preferred_position: string | null;
  source: "manual" | "spond";
  external_provider: string | null;
  external_id: string | null;
  is_managed: boolean;
  created_at: string;
  updated_at: string;
}

function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    number: row.number ?? undefined,
    preferredPosition: row.preferred_position ?? undefined,
    source: row.source,
    externalProvider: row.external_provider,
    externalId: row.external_id,
    isManaged: row.is_managed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTeam(row: TeamRow, players: PlayerRow[]): Team {
  return {
    id: row.id,
    name: row.name,
    players: players.map(toPlayer),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getMemberTeamIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .returns<TeamMemberRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return Array.from(new Set((data ?? []).map((row) => row.team_id)));
}

async function getTeamsByIds(supabase: SupabaseClient, teamIds: string[]): Promise<TeamRow[]> {
  if (teamIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("teams")
    .select("id, name, created_at, updated_at")
    .in("id", teamIds)
    .order("created_at", { ascending: true })
    .returns<TeamRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function readProfileActiveTeamId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("active_team_id")
    .eq("id", userId)
    .maybeSingle<ProfilePreferenceRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data?.active_team_id ?? null;
}

async function persistActiveTeamId(
  supabase: SupabaseClient,
  userId: string,
  teamId: string | null
): Promise<string | null> {
  const { error } = await supabase
    .from("profiles")
    .update({ active_team_id: teamId })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return teamId;
}

async function resolveNextActiveTeamId(
  supabase: SupabaseClient,
  userId: string,
  deletedTeamId: string
): Promise<string | null> {
  const teamIds = await getMemberTeamIds(supabase, userId);
  const remainingTeamIds = teamIds.filter((teamId) => teamId !== deletedTeamId);

  if (remainingTeamIds.length === 0) {
    return null;
  }

  const teamRows = await getTeamsByIds(supabase, remainingTeamIds);
  return teamRows[0]?.id ?? null;
}

async function getPlayersByTeamId(supabase: SupabaseClient, teamId: string) {
  const { data, error } = await supabase
    .from("players")
    .select("id, name, number, preferred_position, source, external_provider, external_id, is_managed, created_at, updated_at")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .returns<PlayerRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function readCloudTeam(
  supabase: SupabaseClient,
  teamId: string
): Promise<Team | null> {
  const { data: teamRow, error: teamError } = await supabase
    .from("teams")
    .select("id, name, created_at, updated_at")
    .eq("id", teamId)
    .maybeSingle<TeamRow>();

  if (teamError) {
    throw new Error(teamError.message);
  }

  if (!teamRow) {
    return null;
  }

  const players = await getPlayersByTeamId(supabase, teamRow.id);
  return toTeam(teamRow, players);
}

async function readCloudTeams(supabase: SupabaseClient, userId: string): Promise<Team[]> {
  const teamIds = await getMemberTeamIds(supabase, userId);
  const teamRows = await getTeamsByIds(supabase, teamIds);

  if (teamRows.length === 0) {
    return [];
  }

  const players = await Promise.all(
    teamRows.map(async (teamRow) => {
      const teamPlayers = await getPlayersByTeamId(supabase, teamRow.id);
      return [teamRow.id, teamPlayers] as const;
    })
  );

  const playersByTeamId = new Map(players);

  return teamRows.map((teamRow) => toTeam(teamRow, playersByTeamId.get(teamRow.id) ?? []));
}

export function createSupabaseTeamRepository({
  supabase,
  userId,
  userEmail,
}: {
  supabase: SupabaseClient;
  userId: string;
  userEmail?: string | null;
}): TeamRepository {
  return {
    mode: "cloud",
    async getTeams() {
      return readCloudTeams(supabase, userId);
    },
    async getTeam(teamId) {
      return readCloudTeam(supabase, teamId);
    },
    async getActiveTeamId() {
      return readProfileActiveTeamId(supabase, userId);
    },
    async setActiveTeam(teamId) {
      const teamIds = await getMemberTeamIds(supabase, userId);

      if (!teamIds.includes(teamId)) {
        throw new Error("Team not found for this user.");
      }

      await ensureUserProfile({
        supabase,
        userId,
        userEmail,
      });

      return persistActiveTeamId(supabase, userId, teamId);
    },
    async createTeam(name) {
      await ensureUserProfile({
        supabase,
        userId,
        userEmail,
      });

      const { data: teamRow, error: teamError } = await supabase
        .from("teams")
        .insert({
          name,
          owner_id: userId,
          default_match_format: "5v5",
        })
        .select("id, name, created_at, updated_at")
        .single<TeamRow>();

      if (teamError) {
        throw new Error(teamError.message);
      }

      const { error: membershipError } = await supabase.from("team_members").insert({
        team_id: teamRow.id,
        user_id: userId,
        role: "owner",
      });

      if (membershipError) {
        throw new Error(membershipError.message);
      }

      const activeTeamId = await readProfileActiveTeamId(supabase, userId);

      if (!activeTeamId) {
        await persistActiveTeamId(supabase, userId, teamRow.id);
      }

      return toTeam(teamRow, []);
    },
    async deleteTeam(teamId) {
      const teamIds = await getMemberTeamIds(supabase, userId);

      if (!teamIds.includes(teamId)) {
        throw new Error("Team not found for this user.");
      }

      const { error } = await supabase
        .from("teams")
        .delete()
        .eq("id", teamId)
        .eq("owner_id", userId);

      if (error) {
        throw new Error(error.message);
      }

      const currentActiveTeamId = await readProfileActiveTeamId(supabase, userId);
      const nextActiveTeamId =
        currentActiveTeamId === teamId
          ? await resolveNextActiveTeamId(supabase, userId, teamId)
          : currentActiveTeamId;

      await persistActiveTeamId(supabase, userId, nextActiveTeamId);

      return {
        deletedTeamId: teamId,
        nextActiveTeamId,
      };
    },
    async renameTeam(teamId, name) {
      const { error } = await supabase
        .from("teams")
        .update({ name })
        .eq("id", teamId)
        .eq("owner_id", userId);

      if (error) {
        throw new Error(error.message);
      }

      const next = await readCloudTeam(supabase, teamId);

      if (!next) {
        throw new Error("Team not found.");
      }

      return next;
    },
    async addPlayer(teamId, name) {
      const { error } = await supabase.from("players").insert({
        team_id: teamId,
        name,
        is_active: true,
        source: "manual",
        is_managed: false,
      });

      if (error) {
        throw new Error(error.message);
      }

      const next = await readCloudTeam(supabase, teamId);

      if (!next) {
        throw new Error("Team not found.");
      }

      return next;
    },
    async renamePlayer(teamId, playerId, name) {
      const { error } = await supabase
        .from("players")
        .update({ name })
        .eq("id", playerId);

      if (error) {
        throw new Error(error.message);
      }

      const next = await readCloudTeam(supabase, teamId);

      if (!next) {
        throw new Error("Team not found.");
      }

      return next;
    },
    async deletePlayer(teamId, playerId) {
      const { data, error } = await supabase
        .from("players")
        .delete()
        .eq("id", playerId)
        .eq("source", "manual")
        .select("id");

      if (error) {
        throw new Error(error.message);
      }

      if (!data || data.length === 0) {
        throw new Error("PLAYER_MANAGED");
      }

      const next = await readCloudTeam(supabase, teamId);

      if (!next) {
        throw new Error("Team not found.");
      }

      return next;
    },
    async reorderPlayer(teamId) {
      const next = await readCloudTeam(supabase, teamId);

      if (!next) {
        throw new Error("Team not found.");
      }

      return next;
    },
  };
}
