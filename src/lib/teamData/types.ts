import type { Team } from "@/domain/team";

export type TeamStorageMode = "guest-local" | "cloud";

export interface TeamRepository {
  mode: TeamStorageMode;
  getTeam: () => Promise<Team | null>;
  createTeam: (name: string) => Promise<Team>;
  renameTeam: (teamId: string, name: string) => Promise<Team>;
  addPlayer: (teamId: string, name: string) => Promise<Team>;
  renamePlayer: (teamId: string, playerId: string, name: string) => Promise<Team>;
  deletePlayer: (teamId: string, playerId: string) => Promise<Team>;
  reorderPlayer: (
    teamId: string,
    playerId: string,
    direction: "up" | "down"
  ) => Promise<Team>;
}
