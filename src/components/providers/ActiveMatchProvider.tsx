"use client";

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { usePathname } from "@/i18n/navigation";
import {
  clearLocalActiveState,
  clearLocalActiveStateFor,
  endLocalActiveMatch,
  hasActiveConflict,
  persistActiveMatchCloseAction,
  resolveActiveMatch,
  resolveClosedOnDevice,
  resolveLocalActiveMatch,
  type ActiveMatchResolution,
  type CanonicalMatchStatus,
} from "@/lib/match/activeMatchRecovery";
import { retryPendingMatchCompletion, submitMatchCompletion } from "@/lib/match/matchCompletion";
import { syncActiveMatchCreate, syncActiveMatchStart } from "@/lib/match/matchServerCreate";
import { revokeDiscardedMatchShare, syncStoredMatchShare } from "@/lib/match/matchShareSync";
import { listPendingMatchCompletions } from "@/lib/storage/pendingMatchCompletionStorage";
import { getStoredMatchSetup } from "@/lib/storage/matchStorage";

interface ActiveMatchItem {
  id: string;
  title: string;
  teamId: string;
  status: "draft" | "upcoming" | "live" | "completed" | "abandoned";
  startedAt?: string | null;
  runtimeState?: Record<string, unknown> | null;
  /** Set on this device's own match; see ActiveMatchLike. */
  serverMatchId?: string | null;
  setupId?: string;
}

interface ServerSnapshot {
  activeMatch: ActiveMatchItem | null;
  recoverableMatch: ActiveMatchItem | null;
}

interface ActiveMatchContextValue {
  /** The match running on this device (FP-P0-F2), or null. */
  activeMatch: ActiveMatchItem | null;
  activeStatus: CanonicalMatchStatus | null;
  needsRecovery: boolean;
  /** Live screen route for `activeMatch`. */
  activeMatchHref: string;
  /** A server match left open that this device is not running. */
  recoveryMatch: ActiveMatchItem | null;
  /** Details page of `recoveryMatch`, where it is finished or resumed. */
  recoveryMatchHref: string | null;
  /** `recoveryMatch` has a live server snapshot this device could resume. */
  canContinueRecovery: boolean;
  hasActiveConflict: (currentMatchId: string | null) => boolean;
  /**
   * Ends this device's match (stored final state, completion sent or queued)
   * or, when the device runs none, completes the recovery match on the server
   * without touching anything stored on this device.
   */
  forceCloseActiveMatch: () => Promise<void>;
  /** As `forceCloseActiveMatch`, but discards the match's live state. */
  discardActiveMatch: () => Promise<void>;
  refreshActiveMatch: () => Promise<void>;
}

const EMPTY_SERVER: ServerSnapshot = { activeMatch: null, recoverableMatch: null };

const ActiveMatchContext = createContext<ActiveMatchContextValue | null>(null);

export function ActiveMatchProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const workspace = useTeamWorkspace();
  const activeTeamId = workspace.activeTeamId;
  const [resolution, setResolution] = useState<ActiveMatchResolution>(() =>
    resolveActiveMatch(null, null, null)
  );
  // Last server answer for the active team. Kept while a request fails
  // (offline), and always combined with a fresh read of this device.
  const serverRef = useRef<ServerSnapshot>(EMPTY_SERVER);

  const resolveNow = useCallback((): ActiveMatchResolution => {
    const server = auth.status === "authenticated" ? serverRef.current : EMPTY_SERVER;

    return resolveActiveMatch(
      server.activeMatch,
      server.recoverableMatch,
      resolveLocalActiveMatch(),
      resolveClosedOnDevice()
    );
  }, [auth.status]);

  /** Null when the server could not be asked (offline, error). */
  const fetchServerSnapshot = useCallback(async (teamId: string | null): Promise<ServerSnapshot | null> => {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

    try {
      const response = await fetch(`/api/matches/active/resolve${query}`);

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        activeMatch?: ActiveMatchItem | null;
        recoverableMatch?: ActiveMatchItem | null;
      };

      return {
        activeMatch: payload.activeMatch ?? null,
        recoverableMatch: payload.recoverableMatch ?? null,
      };
    } catch {
      return null;
    }
  }, []);

  const refreshActiveMatch = useCallback(async () => {
    if (auth.status === "authenticated") {
      const server = await fetchServerSnapshot(activeTeamId);

      if (server) {
        serverRef.current = server;
      }
    }

    setResolution(resolveNow());
  }, [activeTeamId, auth.status, fetchServerSnapshot, resolveNow]);

  const userId = auth.user?.id ?? null;

  // Acts on the match the coach was shown, never on whatever this device
  // holds by the time the action runs (another tab may have changed it).
  const closeWithMode = useCallback(async (mode: "force-close" | "discard") => {
    const shown = resolution;
    const current = resolveNow();
    const isSignedIn = auth.status === "authenticated";

    if (shown.activeMatch) {
      const device = current.activeMatch;

      // Still the same match on this device? Otherwise do nothing to it.
      if (device && device.setupId === shown.activeMatch.setupId) {
        if (mode === "force-close") {
          // A real end: the final state is kept on the device first, then the
          // completion is sent, or queued when offline.
          const ended = endLocalActiveMatch();

          if (ended?.completion && isSignedIn) {
            await submitMatchCompletion(
              ended.completion.matchId,
              ended.completion.body,
              ended.completion.endedAt,
              ended.completion
            );
          }
        } else {
          // MATCH-13: a row still marked as not created may exist anyway (its
          // answer was lost) or be on its way (a create in flight). The create
          // is idempotent and joins one in flight, so it runs to the end
          // first; the discard then always reaches the row, and a late repeat
          // only gets the existing row back. Someone else's match (nothing
          // to create for this coach) is left alone on the server.
          let onServer = isSignedIn;

          if (onServer && getStoredMatchSetup()?.serverLink?.pendingCreate) {
            const created = userId ? await syncActiveMatchCreate(userId) : null;

            if (created === null) {
              onServer = false;
            } else if (created.status !== "created") {
              throw new Error("ACTIVE_MATCH_CLOSE_FAILED");
            }
          }

          if (onServer) {
            await persistActiveMatchCloseAction({
              matchId: device.serverMatchId ?? null,
              fetchImpl: fetch,
              mode,
            });
          }

          clearLocalActiveState();
          // FEAT-SHARE-01: a discarded match's public link stops working (queued).
          revokeDiscardedMatchShare(device.serverMatchId ?? null, isSignedIn ? userId : null);
        }
      }
    } else if (shown.recoveryMatch) {
      const targetId = shown.recoveryMatch.id;

      if (isSignedIn) {
        await persistActiveMatchCloseAction({ matchId: targetId, fetchImpl: fetch, mode });
      }

      // Never clears another match this device holds.
      clearLocalActiveStateFor(targetId);
      if (mode === "discard") revokeDiscardedMatchShare(targetId, isSignedIn ? userId : null);
    }

    if (mode === "discard" && isSignedIn) void syncStoredMatchShare(userId);
    await refreshActiveMatch();
  }, [auth.status, refreshActiveMatch, resolution, resolveNow, userId]);

  const forceCloseActiveMatch = useCallback(async () => {
    await closeWithMode("force-close");
  }, [closeWithMode]);

  const discardActiveMatch = useCallback(async () => {
    await closeWithMode("discard");
  }, [closeWithMode]);

  const hasConflict = useCallback(
    (currentMatchId: string | null) => hasActiveConflict(currentMatchId, resolution),
    [resolution]
  );

  useEffect(() => {
    // A new team (or account) starts from a clean server view.
    serverRef.current = EMPTY_SERVER;

    if (auth.status !== "authenticated") {
      return;
    }

    let cancelled = false;

    void (async () => {
      const server = await fetchServerSnapshot(activeTeamId);

      if (cancelled) {
        return;
      }

      if (server) {
        serverRef.current = server;
      }

      setResolution(resolveNow());
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTeamId, auth.status, fetchServerSnapshot, resolveNow]);

  // Re-read this device's match on every route change, without a request, so
  // a match started or ended in this session (also offline) shows correctly.
  const pathname = usePathname();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setResolution(resolveNow());
  }, [activeTeamId, pathname, resolveNow]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Completions ended on this device but not yet confirmed (offline, closed
  // mid-request) are sent on start, per reconnect and when the app comes back
  // to the foreground, from any screen; so is the server row of a running
  // match that could not be created at start (MATCH-13). Only the signed-in
  // coach's own matches are sent. Both de-duplicate a send already in flight.
  const syncPendingCompletions = useEffectEvent(async () => {
    let synced = false;

    if (userId) {
      await syncActiveMatchCreate(userId);
      // A planned match started offline turns live on the server now, not
      // only at its completion.
      await syncActiveMatchStart(userId);
      // FEAT-SHARE-01: a share change that could not be sent yet.
      await syncStoredMatchShare(userId);
    }

    for (const pending of listPendingMatchCompletions()) {
      if (pending.userId !== undefined && pending.userId !== userId) {
        continue;
      }

      const result = await retryPendingMatchCompletion(pending.matchId);
      synced = synced || result?.status === "completed";
    }

    if (synced) {
      await refreshActiveMatch();
    }
  });

  useEffect(() => {
    if (auth.status !== "authenticated") {
      return;
    }

    const handleOnline = () => {
      void syncPendingCompletions();
    };
    const handleVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        handleOnline();
      }
    };

    if (navigator.onLine) {
      handleOnline();
    }

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [auth.status, userId]);

  const value = useMemo<ActiveMatchContextValue>(
    () => ({
      activeMatch: resolution.activeMatch as ActiveMatchItem | null,
      activeStatus: resolution.canonicalStatus,
      needsRecovery: resolution.needsRecovery,
      activeMatchHref: resolution.href,
      recoveryMatch: resolution.recoveryMatch as ActiveMatchItem | null,
      recoveryMatchHref: resolution.recoveryHref,
      canContinueRecovery: resolution.canContinue,
      hasActiveConflict: hasConflict,
      forceCloseActiveMatch,
      discardActiveMatch,
      refreshActiveMatch,
    }),
    [discardActiveMatch, forceCloseActiveMatch, hasConflict, refreshActiveMatch, resolution]
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
