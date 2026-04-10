import {
  addPlayer,
  createTeam,
  deletePlayer,
  renamePlayer,
  renameTeam,
  reorderPlayer,
  type Team,
} from "@/domain/team";
import {
  getStoredActiveTeamId,
  getStoredTeamById,
  getStoredTeams,
  saveStoredTeamWorkspace,
  setStoredActiveTeamId,
} from "@/lib/storage/teamStorage";
import type { TeamRepository } from "@/lib/teamData/types";

function readTeamOrThrow(teamId: string): Team {
  const team = getStoredTeamById(teamId);

  if (!team) {
    throw new Error("Team not found in local storage.");
  }

  return team;
}

function persistTeam(team: Team, preferActive = false): Team {
  const teams = getStoredTeams();
  const existingIndex = teams.findIndex((item) => item.id === team.id);
  const nextTeams = [...teams];

  if (existingIndex >= 0) {
    nextTeams[existingIndex] = team;
  } else {
    nextTeams.push(team);
  }

  const activeTeamId = getStoredActiveTeamId();

  saveStoredTeamWorkspace({
    teams: nextTeams,
    activeTeamId: preferActive ? team.id : activeTeamId ?? team.id,
  });

  return team;
}

export function createLocalTeamRepository(): TeamRepository {
  return {
    mode: "guest-local",
    async getTeams() {
      return getStoredTeams();
    },
    async getTeam(teamId) {
      return getStoredTeamById(teamId);
    },
    async getActiveTeamId() {
      return getStoredActiveTeamId();
    },
    async setActiveTeam(teamId) {
      const teams = getStoredTeams();

      if (!teams.some((team) => team.id === teamId)) {
        throw new Error("Team not found in local storage.");
      }

      return setStoredActiveTeamId(teamId);
    },
    async createTeam(name) {
      const team = createTeam(name);
      return persistTeam(team, true);
    },
    async renameTeam(teamId, name) {
      const team = readTeamOrThrow(teamId);
      return persistTeam(renameTeam(team, name));
    },
    async addPlayer(teamId, name) {
      const team = readTeamOrThrow(teamId);
      return persistTeam(addPlayer(team, name));
    },
    async renamePlayer(teamId, playerId, name) {
      const team = readTeamOrThrow(teamId);
      return persistTeam(renamePlayer(team, playerId, name));
    },
    async deletePlayer(teamId, playerId) {
      const team = readTeamOrThrow(teamId);
      return persistTeam(deletePlayer(team, playerId));
    },
    async reorderPlayer(teamId, playerId, direction) {
      const team = readTeamOrThrow(teamId);
      return persistTeam(reorderPlayer(team, playerId, direction));
    },
  };
}
