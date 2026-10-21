import type { Team } from "@/domain/team";

export type TeamStorageMode = "guest-local" | "cloud";

/** Where the last team read came from: the server, or the local mirror (read-only). */
export type TeamDataSource = "server" | "mirror" | "local";

export interface TeamRepository {
  mode: TeamStorageMode;
  /** Optional: repositories without a mirror always read their own store. */
  getDataSource?: () => TeamDataSource;
  getTeams: () => Promise<Team[]>;
  getTeam: (teamId: string) => Promise<Team | null>;
  getActiveTeamId: () => Promise<string | null>;
  setActiveTeam: (teamId: string) => Promise<string | null>;
  createTeam: (name: string) => Promise<Team>;
  deleteTeam: (teamId: string) => Promise<{ deletedTeamId: string; nextActiveTeamId: string | null }>;
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
