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

interface PlayerRow {
  id: string;
  name: string;
  number: number | null;
  preferred_position: string | null;
  created_at: string;
  updated_at: string;
}

function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    number: row.number ?? undefined,
    preferredPosition: row.preferred_position ?? undefined,
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

async function getOwnedTeamRow(supabase: SupabaseClient, ownerId: string) {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, created_at, updated_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<TeamRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getPlayersByTeamId(supabase: SupabaseClient, teamId: string) {
  const { data, error } = await supabase
    .from("players")
    .select("id, name, number, preferred_position, created_at, updated_at")
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
  userId: string
): Promise<Team | null> {
  const teamRow = await getOwnedTeamRow(supabase, userId);

  if (!teamRow) {
    return null;
  }

  const players = await getPlayersByTeamId(supabase, teamRow.id);
  return toTeam(teamRow, players);
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
    async getTeam() {
      return readCloudTeam(supabase, userId);
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

      return toTeam(teamRow, []);
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

      const next = await readCloudTeam(supabase, userId);

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
      });

      if (error) {
        throw new Error(error.message);
      }

      const next = await readCloudTeam(supabase, userId);

      if (!next) {
        throw new Error("Team not found.");
      }

      return next;
    },
    async renamePlayer(_teamId, playerId, name) {
      const { error } = await supabase
        .from("players")
        .update({ name })
        .eq("id", playerId);

      if (error) {
        throw new Error(error.message);
      }

      const next = await readCloudTeam(supabase, userId);

      if (!next) {
        throw new Error("Team not found.");
      }

      return next;
    },
    async deletePlayer(_teamId, playerId) {
      const { error } = await supabase
        .from("players")
        .delete()
        .eq("id", playerId);

      if (error) {
        throw new Error(error.message);
      }

      const next = await readCloudTeam(supabase, userId);

      if (!next) {
        throw new Error("Team not found.");
      }

      return next;
    },
    async reorderPlayer() {
      const next = await readCloudTeam(supabase, userId);

      if (!next) {
        throw new Error("Team not found.");
      }

      return next;
    },
  };
}
