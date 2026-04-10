"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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

  const refreshActiveMatch = async () => {
    if (auth.status !== "authenticated" || !workspace.activeTeamId) {
      setActiveMatch(null);
      return;
    }

    const response = await fetch(`/api/matches/active?teamId=${encodeURIComponent(workspace.activeTeamId)}`);
    const payload = (await response.json()) as {
      match?: ActiveMatchItem | null;
    };

    if (!response.ok) {
      setActiveMatch(null);
      return;
    }

    setActiveMatch(payload.match ?? null);
  };

  useEffect(() => {
    void refreshActiveMatch();
  }, [auth.status, workspace.activeTeamId]);

  const value = useMemo<ActiveMatchContextValue>(
    () => ({
      activeMatch,
      refreshActiveMatch,
    }),
    [activeMatch]
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
