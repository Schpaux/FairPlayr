"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Team } from "@/domain/team";
import type { TeamStorageMode } from "@/lib/teamData/types";
import { createTeamRepository } from "@/lib/teamData/createTeamRepository";
import { useAuth } from "@/components/providers/AuthProvider";

interface TeamWorkspaceContextValue {
  mode: TeamStorageMode;
  isLoading: boolean;
  teams: Team[];
  activeTeamId: string | null;
  activeTeam: Team | null;
  error: string | null;
  refresh: () => Promise<void>;
  createTeam: (name: string) => Promise<Team>;
  deleteTeam: (teamId: string) => Promise<void>;
  renameTeam: (teamId: string, name: string) => Promise<Team>;
  setActiveTeam: (teamId: string) => Promise<void>;
  addPlayer: (teamId: string, name: string) => Promise<Team>;
  renamePlayer: (teamId: string, playerId: string, name: string) => Promise<Team>;
  deletePlayer: (teamId: string, playerId: string) => Promise<Team>;
  reorderPlayer: (teamId: string, playerId: string, direction: "up" | "down") => Promise<Team>;
}

const TeamWorkspaceContext = createContext<TeamWorkspaceContextValue | null>(null);

export function TeamWorkspaceProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  const repository = useMemo(
    () =>
      createTeamRepository({
        supabase: auth.supabase,
        userId: auth.user?.id,
        userEmail: auth.user?.email,
      }),
    [auth.supabase, auth.user?.id, auth.user?.email]
  );

  const [isLoading, setIsLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (auth.status === "loading") {
      return;
    }

    setIsLoading(true);

    try {
      const [nextTeams, persistedActiveTeamId] = await Promise.all([
        repository.getTeams(),
        repository.getActiveTeamId(),
      ]);

      let resolvedActiveTeamId = persistedActiveTeamId;

      if (!resolvedActiveTeamId || !nextTeams.some((team) => team.id === resolvedActiveTeamId)) {
        resolvedActiveTeamId = nextTeams[0]?.id ?? null;

        if (resolvedActiveTeamId) {
          resolvedActiveTeamId = await repository.setActiveTeam(resolvedActiveTeamId);
        }
      }

      setTeams(nextTeams);
      setActiveTeamId(resolvedActiveTeamId);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load teams.");
      setTeams([]);
      setActiveTeamId(null);
    } finally {
      setIsLoading(false);
    }
  }, [auth.status, repository]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upsertTeamInState = useCallback((team: Team) => {
    setTeams((previous) => {
      const index = previous.findIndex((item) => item.id === team.id);

      if (index < 0) {
        return [...previous, team];
      }

      const next = [...previous];
      next[index] = team;
      return next;
    });
  }, []);

  const value = useMemo<TeamWorkspaceContextValue>(
    () => ({
      mode: repository.mode,
      isLoading,
      teams,
      activeTeamId,
      activeTeam: teams.find((team) => team.id === activeTeamId) ?? null,
      error,
      refresh,
      createTeam: async (name) => {
        const team = await repository.createTeam(name);
        upsertTeamInState(team);
        const nextActiveTeamId = await repository.setActiveTeam(team.id);
        setActiveTeamId(nextActiveTeamId);
        return team;
      },
      deleteTeam: async (teamId) => {
        const result = await repository.deleteTeam(teamId);

        setTeams((previous) => previous.filter((team) => team.id !== result.deletedTeamId));
        setActiveTeamId(result.nextActiveTeamId);
      },
      renameTeam: async (teamId, name) => {
        const team = await repository.renameTeam(teamId, name);
        upsertTeamInState(team);
        return team;
      },
      setActiveTeam: async (teamId) => {
        const nextActiveTeamId = await repository.setActiveTeam(teamId);
        setActiveTeamId(nextActiveTeamId);
      },
      addPlayer: async (teamId, name) => {
        const team = await repository.addPlayer(teamId, name);
        upsertTeamInState(team);
        return team;
      },
      renamePlayer: async (teamId, playerId, name) => {
        const team = await repository.renamePlayer(teamId, playerId, name);
        upsertTeamInState(team);
        return team;
      },
      deletePlayer: async (teamId, playerId) => {
        const team = await repository.deletePlayer(teamId, playerId);
        upsertTeamInState(team);
        return team;
      },
      reorderPlayer: async (teamId, playerId, direction) => {
        const team = await repository.reorderPlayer(teamId, playerId, direction);
        upsertTeamInState(team);
        return team;
      },
    }),
    [activeTeamId, error, isLoading, refresh, repository, teams, upsertTeamInState]
  );

  return (
    <TeamWorkspaceContext.Provider value={value}>{children}</TeamWorkspaceContext.Provider>
  );
}

export function useTeamWorkspace() {
  const context = useContext(TeamWorkspaceContext);

  if (!context) {
    throw new Error("useTeamWorkspace must be used within TeamWorkspaceProvider.");
  }

  return context;
}
