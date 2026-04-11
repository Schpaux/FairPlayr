"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import {
  clearLocalActiveState,
  hasActiveConflict,
  persistActiveMatchCloseAction,
  resolveActiveMatch,
  resolveLocalActiveMatch,
  toCanonicalStatus,
  type ActiveMatchResolution,
  type CanonicalMatchStatus,
} from "@/lib/match/activeMatchRecovery";

interface ActiveMatchItem {
  id: string;
  title: string;
  teamId: string;
  status: "draft" | "upcoming" | "live" | "completed" | "abandoned";
  startedAt: string | null;
  runtimeState?: Record<string, unknown> | null;
}

interface ActiveMatchContextValue {
  activeMatch: ActiveMatchItem | null;
  activeStatus: CanonicalMatchStatus | null;
  needsRecovery: boolean;
  activeMatchHref: string;
  hasActiveConflict: (currentMatchId: string | null) => boolean;
  forceCloseActiveMatch: () => Promise<void>;
  discardActiveMatch: () => Promise<void>;
  refreshActiveMatch: () => Promise<void>;
}

const ActiveMatchContext = createContext<ActiveMatchContextValue | null>(null);

export function ActiveMatchProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const workspace = useTeamWorkspace();
  const [activeMatch, setActiveMatch] = useState<ActiveMatchItem | null>(null);
  const [activeStatus, setActiveStatus] = useState<CanonicalMatchStatus | null>(null);
  const [needsRecovery, setNeedsRecovery] = useState(false);
  const [activeMatchHref, setActiveMatchHref] = useState("/match/live?recovery=1");
  const activeTeamId = workspace.activeTeamId;

  const resolveServerActiveMatch = useCallback(async (teamId: string | null) => {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const response = await fetch(`/api/matches/active/resolve${query}`);
    const payload = (await response.json()) as {
      activeMatch?: ActiveMatchItem | null;
      recoverableMatch?: ActiveMatchItem | null;
    };

    if (!response.ok) {
      return {
        activeMatch: null,
        recoverableMatch: null,
      };
    }

    return {
      activeMatch: payload.activeMatch ?? null,
      recoverableMatch: payload.recoverableMatch ?? null,
    };
  }, []);

  const refreshActiveMatch = useCallback(async () => {
    if (auth.status !== "authenticated") {
      return;
    }

    const resolvedServer = await resolveServerActiveMatch(activeTeamId);
    const localActive = resolveLocalActiveMatch();
    const resolution = resolveActiveMatch(
      resolvedServer.activeMatch,
      resolvedServer.recoverableMatch,
      localActive
    );

    setActiveMatch(resolution.activeMatch as ActiveMatchItem | null);
    setActiveStatus(resolution.canonicalStatus);
    setNeedsRecovery(resolution.needsRecovery);
    setActiveMatchHref(resolution.href);
  }, [activeTeamId, auth.status, resolveServerActiveMatch]);

  const closeWithMode = useCallback(async (mode: "force-close" | "discard") => {
    const targetId = activeMatch?.id ?? null;

    if (auth.status === "authenticated") {
      await persistActiveMatchCloseAction({
        matchId: targetId,
        fetchImpl: fetch,
        mode,
      });
    }

    clearLocalActiveState();
    await refreshActiveMatch();
  }, [activeMatch?.id, auth.status, refreshActiveMatch]);

  const forceCloseActiveMatch = useCallback(async () => {
    await closeWithMode("force-close");
  }, [closeWithMode]);

  const discardActiveMatch = useCallback(async () => {
    await closeWithMode("discard");
  }, [closeWithMode]);

  const hasConflict = useCallback((currentMatchId: string | null) => {
    const resolution: ActiveMatchResolution = {
      activeMatch,
      canonicalStatus: activeStatus,
      source: "server",
      needsRecovery,
      canContinue: Boolean(activeMatch),
      canForceClose: Boolean(activeMatch),
      canDiscard: Boolean(activeMatch),
      href: activeMatchHref,
    };

    return hasActiveConflict(currentMatchId, resolution);
  }, [activeMatch, activeMatchHref, activeStatus, needsRecovery]);

  useEffect(() => {
    if (auth.status !== "authenticated") {
      const localActive = resolveLocalActiveMatch();
      const resolution = resolveActiveMatch(null, null, localActive);
      setActiveMatch(resolution.activeMatch as ActiveMatchItem | null);
      setActiveStatus(resolution.canonicalStatus);
      setNeedsRecovery(resolution.needsRecovery);
      setActiveMatchHref(resolution.href);
      return;
    }

    let cancelled = false;

    const run = async () => {
      const resolvedServer = await resolveServerActiveMatch(activeTeamId);
      const localActive = resolveLocalActiveMatch();
      const resolution = resolveActiveMatch(
        resolvedServer.activeMatch,
        resolvedServer.recoverableMatch,
        localActive
      );

      if (!cancelled) {
        setActiveMatch(resolution.activeMatch as ActiveMatchItem | null);
        setActiveStatus(resolution.canonicalStatus);
        setNeedsRecovery(resolution.needsRecovery);
        setActiveMatchHref(resolution.href);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [activeTeamId, auth.status, resolveServerActiveMatch]);

  const resolvedActiveMatch = activeMatch;
  const resolvedStatus = resolvedActiveMatch ? toCanonicalStatus(resolvedActiveMatch.status) : activeStatus;

  const value = useMemo<ActiveMatchContextValue>(
    () => ({
      activeMatch: resolvedActiveMatch,
      activeStatus: resolvedStatus,
      needsRecovery,
      activeMatchHref,
      hasActiveConflict: hasConflict,
      forceCloseActiveMatch,
      discardActiveMatch,
      refreshActiveMatch,
    }),
    [
      activeMatchHref,
      discardActiveMatch,
      forceCloseActiveMatch,
      hasConflict,
      needsRecovery,
      refreshActiveMatch,
      resolvedActiveMatch,
      resolvedStatus,
    ]
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
