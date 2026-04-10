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
  getStoredTeam,
  saveStoredTeam,
  clearStoredTeam,
} from "@/lib/storage/teamStorage";
import type { TeamRepository } from "@/lib/teamData/types";

function readTeamOrThrow(): Team {
  const team = getStoredTeam();

  if (!team) {
    throw new Error("Team not found in local storage.");
  }

  return team;
}

function persistTeam(team: Team): Team {
  saveStoredTeam(team);
  return team;
}

export function createLocalTeamRepository(): TeamRepository {
  return {
    mode: "guest-local",
    async getTeam() {
      return getStoredTeam();
    },
    async createTeam(name) {
      const team = createTeam(name);
      return persistTeam(team);
    },
    async renameTeam(_teamId, name) {
      const team = readTeamOrThrow();
      return persistTeam(renameTeam(team, name));
    },
    async addPlayer(_teamId, name) {
      const team = readTeamOrThrow();
      return persistTeam(addPlayer(team, name));
    },
    async renamePlayer(_teamId, playerId, name) {
      const team = readTeamOrThrow();
      return persistTeam(renamePlayer(team, playerId, name));
    },
    async deletePlayer(_teamId, playerId) {
      const team = readTeamOrThrow();
      const nextTeam = deletePlayer(team, playerId);

      if (nextTeam.players.length === 0 && !nextTeam.name.trim()) {
        clearStoredTeam();
        return nextTeam;
      }

      return persistTeam(nextTeam);
    },
    async reorderPlayer(_teamId, playerId, direction) {
      const team = readTeamOrThrow();
      return persistTeam(reorderPlayer(team, playerId, direction));
    },
  };
}
