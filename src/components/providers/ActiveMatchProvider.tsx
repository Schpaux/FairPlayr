"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";

interface ActiveMatchItem {
  id: string;
  title: string;
  teamId: string;
  status: "draft" | "upcoming" | "live" | "completed";
  startedAt: string | null;
}

interface ActiveMatchContextValue {
  activeMatch: ActiveMatchItem | null;
  refreshActiveMatch: () => Promise<void>;
}

const ActiveMatchContext = createContext<ActiveMatchContextValue | null>(null);

export function ActiveMatchProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const workspace = useTeamWorkspace();
  const [activeMatch, setActiveMatch] = useState<ActiveMatchItem | null>(null);
  const activeTeamId = workspace.activeTeamId;

  const fetchActiveMatch = useCallback(async (teamId: string) => {
    const response = await fetch(`/api/matches/active?teamId=${encodeURIComponent(teamId)}`);
    const payload = (await response.json()) as {
      match?: ActiveMatchItem | null;
    };

    if (!response.ok) {
      return null;
    }

    return payload.match ?? null;
  }, []);

  const refreshActiveMatch = useCallback(async () => {
    if (auth.status !== "authenticated" || !activeTeamId) {
      return;
    }

    const match = await fetchActiveMatch(activeTeamId);
    setActiveMatch(match);
  }, [activeTeamId, auth.status, fetchActiveMatch]);

  useEffect(() => {
    if (auth.status !== "authenticated" || !activeTeamId) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      const match = await fetchActiveMatch(activeTeamId);
      if (!cancelled) {
        setActiveMatch(match);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [activeTeamId, auth.status, fetchActiveMatch]);

  const resolvedActiveMatch = auth.status === "authenticated" && activeTeamId ? activeMatch : null;

  const value = useMemo<ActiveMatchContextValue>(
    () => ({
      activeMatch: resolvedActiveMatch,
      refreshActiveMatch,
    }),
    [refreshActiveMatch, resolvedActiveMatch]
  );

  return <ActiveMatchContext.Provider value={value}>{children}</ActiveMatchContext.Provider>;
}

export function useActiveMatch() {
  const context = useContext(ActiveMatchContext);

  if (!context) {
    throw new Error("useActiveMatch must be used within ActiveMatchProvider.");
  }

  return context;
}
