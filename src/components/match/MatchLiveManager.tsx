"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Minus, Plus, ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import type { Player } from "@/domain/team";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  createLiveMatchFromSetup,
  endCurrentHalf,
  endLiveMatch,
  formatClock,
  formatPlaytime,
  getCurrentHalfNumber,
  getElapsedSeconds,
  getPhaseStoppageElapsedSeconds,
  getPlayerAccumulatedSeconds,
  getRemainingSeconds,
  isInStoppageTime,
  pauseLiveMatch,
  reconcileLiveMatchWithSquad,
  resumeLiveMatch,
  startLiveMatch,
  substitutePlayers,
  updateScore,
  type LiveMatchState,
} from "@/domain/liveMatch";
import { getFormationSlots } from "@/domain/match";
import { getSubstitutionSuggestion } from "@/domain/substitutionSuggestion";
import { getPlayerFatigue, type FatigueLevel } from "@/domain/playerFatigue";
import {
  createGoalEvent,
  createSubstitutionEvent,
  updateGoalEventContributors,
} from "@/domain/matchEvent";
import {
  endMatch,
  getStoredMatchSetup,
  type MatchStatus,
} from "@/lib/storage/matchStorage";
import {
  clearStoredLiveMatch,
  getStoredLiveMatch,
  normalizeLiveMatchState,
  saveStoredLiveMatch,
} from "@/lib/storage/liveMatchStorage";
import { buildShortNameMap } from "@/lib/utils/playerName";
import { fetchOrNull, readJsonOrNull } from "@/lib/utils/fetchOrNull";
import { resolveClosedOnDevice } from "@/lib/match/activeMatchRecovery";
import {
  getPendingMatchCompletion,
  type PendingMatchCompletion,
} from "@/lib/storage/pendingMatchCompletionStorage";
import {
  submitMatchCompletion,
  type MatchCompletionResult,
} from "@/lib/match/matchCompletion";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { PageShell } from "@/components/ui/PageShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { MatchTimerPanel } from "@/components/match/MatchTimerPanel";
import { LivePitchView } from "@/components/match/LivePitchView";
import { LiveBenchStrip } from "@/components/match/LiveBenchStrip";
import { UndoToast } from "@/components/match/UndoToast";
import { useLiveSubstitution } from "@/components/match/useLiveSubstitution";
import { swapLivePositions, undoLivePositionSwap, type PositionSwapRecord } from "@/domain/positionSwap";
import { applySubstitution, undoSubstitution, type SubstitutionRecord } from "@/domain/substitutionUndo";
import { useMatchClock } from "@/components/match/useMatchClock";
import { variants } from "@/lib/tokens";
import { isSidelineLiveUiEnabled } from "@/lib/featureFlags";
import { LiveScreen } from "@/components/live/LiveScreen";
import { buildLiveScreenModel, discLabel } from "@/components/live/liveScreenModel";

interface PromptPlayerOption {
  id: string;
  name: string;
}

interface GoalPromptState {
  eventId: string | null;
  localEventId: string;
  minute: number | null;
  options: PromptPlayerOption[];
  step: "scorer" | "assist";
  scorerId: string | null;
  scorerName: string | null;
}

const EMPTY_CLOCK = {
  startedAtMs: null,
  pausedAtMs: null,
  accumulatedPausedMs: 0,
  isRunning: false,
} as const;

function mapPlayersById(players: Player[]) {
  return new Map(players.map((player) => [player.id, player]));
}

function resolvePlayers(ids: string[], byId: Map<string, Player>): Player[] {
  return ids
    .map((id) => byId.get(id))
    .filter((player): player is Player => Boolean(player));
}

function statusLabel(
  status: LiveMatchState["status"],
  t: (key: string) => string
) {
  if (status === "running") {
    return t("status.running");
  }

  if (status === "paused") {
    return t("status.paused");
  }

  if (status === "ended") {
    return t("status.ended");
  }

  return t("status.notStarted");
}

export function MatchLiveManager() {
  const t = useTranslations("matchLive");
  const common = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const workspace = useTeamWorkspace();
  const {
    activeMatch,
    activeMatchHref,
    needsRecovery,
    recoveryMatch,
    canContinueRecovery,
    forceCloseActiveMatch,
    discardActiveMatch,
    refreshActiveMatch,
  } = useActiveMatch();
  // Set by the hydration effect from the stored local setup. Until it has run,
  // `setupSource` is "pending" and no server match id is used at all.
  // "setup" means the live state on screen comes from the stored setup, whose
  // own server match id (null for a local-only match, undefined when stored
  // before the field existed) is then the only match identity considered.
  const [localSetupId, setLocalSetupId] = useState<string | null>(null);
  const [setupSource, setSetupSource] = useState<"pending" | "none" | "setup">("pending");
  const [setupServerMatchId, setSetupServerMatchId] = useState<string | null | undefined>(undefined);
  // A guest/local-only match has no server record; its local setup id (which
  // can reach the URL via the active-match banner) must never be sent to the API.
  const asServerMatchId = (id: string | null | undefined) =>
    id && id !== localSetupId ? id : null;
  // A setup stored before its server id was recorded only pairs with the
  // provider's match when that match's runtime state names this setup.
  const verifiedLegacyServerMatchId =
    localSetupId && activeMatch?.runtimeState?.setupId === localSetupId
      ? asServerMatchId(activeMatch.id)
      : null;
  const activeMatchId =
    setupSource === "pending"
      ? null
      : setupSource === "setup"
        ? setupServerMatchId === undefined
          ? verifiedLegacyServerMatchId
          : setupServerMatchId
        : asServerMatchId(searchParams.get("matchId")) ?? asServerMatchId(activeMatch?.id);

  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [liveMatch, setLiveMatch] = useState<LiveMatchState | null>(null);
  const [setupStatus, setSetupStatus] = useState<MatchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportEnabled, setReportEnabled] = useState(false);
  const [promptQueue, setPromptQueue] = useState<GoalPromptState[]>([]);
  const [isResolvingRecoveryAction, setIsResolvingRecoveryAction] = useState(false);
  const [isEndingMatch, setIsEndingMatch] = useState(false);
  const [endMatchDone, setEndMatchDone] = useState(false);
  // Server match whose completion was confirmed after a deferred sync (or
  // while the device looked offline); the coach opens its report explicitly.
  const [syncedMatchId, setSyncedMatchId] = useState<string | null>(null);
  // True when a local-only match was ended but could not be written to device
  // storage, so the result only exists on this screen.
  const [localEndUnsaved, setLocalEndUnsaved] = useState(false);
  const endedMatchIdRef = useRef<string | null>(null);
  const isOnline = useOnlineStatus();
  // `persisted: false` means the completion could not be written to device
  // storage and only exists in this component's memory until it is sent.
  const [pendingCompletion, setPendingCompletion] = useState<{
    record: PendingMatchCompletion;
    persisted: boolean;
  } | null>(null);
  const [isSyncingCompletion, setIsSyncingCompletion] = useState(false);
  const isSyncingCompletionRef = useRef(false);
  // Bumped on every connectivity change. Each completion attempt records the
  // period it started in, so a pending completion is retried automatically at
  // most once per connectivity change — never in a loop after a failure.
  const connectivityEpochRef = useRef(0);
  const lastCompletionAttemptRef = useRef<{ matchId: string; epoch: number } | null>(null);
  const markCompletionAttempt = (matchId: string) => {
    lastCompletionAttemptRef.current = { matchId, epoch: connectivityEpochRef.current };
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isHydrated || workspace.isLoading) {
      return;
    }

    const storedSetup = getStoredMatchSetup();
    const storedLiveMatch = getStoredLiveMatch();

    setLocalSetupId(storedSetup?.config.id ?? null);
    setSetupSource("none");
    setSetupServerMatchId(undefined);

    if (!storedSetup) {
      setTeamPlayers([]);
      setLiveMatch(null);
      setSetupStatus(null);
      return;
    }

    const setupTeam = workspace.teams.find((team) => team.id === storedSetup.config.teamId) ?? null;

    if (!setupTeam) {
      setTeamPlayers([]);
      setLiveMatch(null);
      setSetupStatus(storedSetup.status);
      return;
    }
    setTeamPlayers(setupTeam.players);

    if (storedLiveMatch && storedLiveMatch.setupId === storedSetup.config.id) {
      setLiveMatch(
        reconcileLiveMatchWithSquad(storedLiveMatch, storedSetup.config.selectedPlayerIds)
      );
      setSetupStatus(storedSetup.status);
      setSetupSource("setup");
      setSetupServerMatchId(storedSetup.serverMatchId);
      return;
    }

    if (storedSetup.status === "active") {
      setLiveMatch(createLiveMatchFromSetup(storedSetup.config));
      setSetupStatus(storedSetup.status);
      setSetupSource("setup");
      setSetupServerMatchId(storedSetup.serverMatchId);
      return;
    }
    setLiveMatch(null);
    setSetupStatus(storedSetup.status);
  }, [activeMatch?.teamId, activeMatchId, isHydrated, workspace.activeTeamId, workspace.isLoading, workspace.teams]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isHydrated || !liveMatch) {
      return;
    }

    // A full device (quota) must not throw out of this effect: that would
    // unmount the screen and lose the in-memory match. The end flow detects
    // and warns about failed persistence for the completion itself.
    try {
      saveStoredLiveMatch(liveMatch);
    } catch {
      // Keep running on in-memory state.
    }
  }, [liveMatch, isHydrated]);

  useEffect(() => {
    // An ended match is sent once, by the completion (FP-P0-F2); a runtime
    // sync after that could only race it.
    if (!isHydrated || auth.status !== "authenticated" || !activeMatchId || !liveMatch || liveMatch.status === "ended") {
      return;
    }

    const timeout = window.setTimeout(() => {
      void fetchOrNull(`/api/matches/${encodeURIComponent(activeMatchId)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          runtimeState: liveMatch,
          scoreFor: liveMatch.teamScore,
          scoreAgainst: liveMatch.opponentScore,
        }),
      });
    }, 600);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeMatchId, auth.status, isHydrated, liveMatch]);

  useEffect(() => {
    if (!isHydrated || auth.status !== "authenticated" || !activeMatchId) {
      return;
    }

    void (async () => {
      const response = await fetchOrNull(`/api/matches/${encodeURIComponent(activeMatchId)}`, {
        method: "GET",
      });

      if (!response?.ok) {
        return;
      }

      const payload = await readJsonOrNull<{
        match?: { reportEnabled?: boolean };
      }>(response);

      setReportEnabled(payload?.match?.reportEnabled === true);
    })();
  }, [activeMatchId, auth.status, isHydrated]);

  useEffect(() => {
    if (promptQueue.length === 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const current = promptQueue[0];
      if (!current) {
        return;
      }

      if (current.step === "scorer") {
        setPromptQueue((previous) => {
          if (previous.length === 0) {
            return previous;
          }

          const [head, ...rest] = previous;
          return [{ ...head, step: "assist" }, ...rest];
        });
        return;
      }

      setPromptQueue((previous) => previous.slice(1));
    }, 10000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [promptQueue]);

  useEffect(() => {
    if (!isHydrated || auth.status !== "authenticated" || !activeMatchId || liveMatch) {
      return;
    }

    // Ended on this device: the server row may still say live until the
    // completion syncs. The device is authoritative (FP-P0-F2).
    if (resolveClosedOnDevice().has(activeMatchId)) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const response = await fetchOrNull(`/api/matches/${encodeURIComponent(activeMatchId)}`, {
        method: "GET",
      });

      if (cancelled || !response?.ok) {
        return;
      }

      const payload = await readJsonOrNull<{
        match?: { status?: string; runtimeState?: LiveMatchState | null };
      }>(response);

      // Only a match still live on the server is resumed from its snapshot;
      // a completed one is never revived (FP-P0-F2). Checked again on
      // arrival: the match may have been ended here while the read was out.
      if (cancelled || payload?.match?.status !== "live" || resolveClosedOnDevice().has(activeMatchId)) {
        return;
      }

      const runtimeState = payload.match.runtimeState;

      if (!runtimeState || typeof runtimeState !== "object") {
        return;
      }

      const normalized = normalizeLiveMatchState(runtimeState);

      if (!normalized) {
        return;
      }

      setLiveMatch(normalized);
      setSetupStatus("active");
    })();

    return () => {
      cancelled = true;
    };
  }, [activeMatchId, auth.status, isHydrated, liveMatch]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const shouldWarn = liveMatch?.status === "running" || liveMatch?.status === "paused";

    if (!shouldWarn) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isHydrated, liveMatch?.status]);

  const matchClock = useMatchClock({
    clock: liveMatch?.clock ?? EMPTY_CLOCK,
    onStart: () => {
      setLiveMatch((previous) => (previous ? startLiveMatch(previous, Date.now()) : previous));
    },
    onPause: () => {
      setLiveMatch((previous) => (previous ? pauseLiveMatch(previous, Date.now()) : previous));
    },
    onResume: () => {
      setLiveMatch((previous) => (previous ? resumeLiveMatch(previous, Date.now()) : previous));
    },
  });

  const playersById = useMemo(() => mapPlayersById(teamPlayers), [teamPlayers]);

  const elapsedSeconds = liveMatch
    ? getElapsedSeconds(liveMatch, matchClock.nowMs)
    : 0;
  const phaseStoppageSeconds = liveMatch
    ? getPhaseStoppageElapsedSeconds(liveMatch, matchClock.nowMs)
    : 0;
  const remainingClock = liveMatch
    ? formatClock(getRemainingSeconds(liveMatch, matchClock.nowMs))
    : "00:00";
  const elapsedClock = formatClock(elapsedSeconds);
  const currentHalf = liveMatch ? getCurrentHalfNumber(liveMatch) : null;
  const inStoppage = liveMatch ? isInStoppageTime(liveMatch, matchClock.nowMs) : false;

  const suggestion = liveMatch ? getSubstitutionSuggestion(liveMatch, matchClock.nowMs) : null;
  const suggestedOutgoingPlayer = suggestion
    ? playersById.get(suggestion.outgoingPlayerId) ?? null
    : null;
  const suggestedIncomingPlayer = suggestion
    ? playersById.get(suggestion.incomingPlayerId) ?? null
    : null;

  const getPlayerPlaytime = (playerId: string) => {
    if (!liveMatch) {
      return "0:00";
    }

    return formatPlaytime(getPlayerAccumulatedSeconds(liveMatch, playerId, matchClock.nowMs));
  };

  const liveEvents = liveMatch?.events ?? [];

  const handleStart = () => {
    matchClock.start();
  };

  const handlePause = () => {
    matchClock.pause();
  };

  const handleResume = () => {
    matchClock.resume();
  };

  const handleEndHalf = () => {
    // Ending the last half is full time: use the confirmed end flow so the
    // final state is saved and the completion is sent or queued.
    if (liveMatch && (liveMatch.halves !== 2 || liveMatch.phase !== "first_half")) {
      handleEnd();
      return;
    }

    setLiveMatch((previous) =>
      previous ? endCurrentHalf(previous, Date.now()) : previous
    );
  };

  // Runs once the server has confirmed completion right after End Match: show
  // "Done!" and open the report. Refreshing the active-match banner is
  // best-effort — a failure there must not leave the coach stuck on the overlay.
  const finishEndedMatch = async (matchId: string) => {
    await refreshActiveMatch().catch(() => undefined);
    setEndMatchDone(true);
    endedMatchIdRef.current = matchId;

    // Brief pause so user sees the "Done!" state, then navigate to report. If
    // the connection dropped in the meantime the report page cannot load, so
    // stay here and let the coach open it explicitly.
    window.setTimeout(() => {
      if (!navigator.onLine) {
        setIsEndingMatch(false);
        setEndMatchDone(false);
        setSyncedMatchId(matchId);
        return;
      }

      router.push(`/match/${encodeURIComponent(matchId)}`);
    }, 1200);
  };

  // The match is already ended and stored locally when this runs. Offline or
  // server failures keep it that way and leave a pending completion for retry
  // instead of blocking the coach.
  const handleCompletionNotConfirmed = (
    record: PendingMatchCompletion,
    result: Exclude<MatchCompletionResult, { status: "completed" }>
  ) => {
    // Keep the body we just sent rather than re-reading storage: if the write
    // failed, storage has nothing and the final state would silently vanish.
    setPendingCompletion({ record, persisted: result.persisted });
    setError(result.status === "failed" ? result.message ?? t("errors.endFailed") : null);
    setIsEndingMatch(false);
  };

  const syncPendingCompletion = async (record: PendingMatchCompletion) => {
    if (isSyncingCompletionRef.current) {
      return;
    }

    isSyncingCompletionRef.current = true;
    setIsSyncingCompletion(true);
    markCompletionAttempt(record.matchId);

    // Re-sends from the in-memory record, which also retries the storage
    // write. submitMatchCompletion never rejects (network failures resolve to
    // "offline"), so the flag is always reset. No try/finally: the React
    // Compiler cannot compile it and would skip this whole component.
    const result = await submitMatchCompletion(record.matchId, record.body, record.endedAt);

    isSyncingCompletionRef.current = false;
    setIsSyncingCompletion(false);

    if (result.status !== "completed") {
      handleCompletionNotConfirmed(record, result);
      return;
    }

    // A deferred sync never navigates on its own: connectivity may still be
    // flaky, so the coach opens the report explicitly.
    setPendingCompletion(null);
    setError(null);
    setSyncedMatchId(record.matchId);
    void refreshActiveMatch().catch(() => undefined);
  };

  const onPendingCompletionSyncTrigger = useEffectEvent((record: PendingMatchCompletion) => {
    void syncPendingCompletion(record);
  });

  // Pick up a completion left pending by an earlier session (offline end,
  // app closed mid-request) and retry it straight away if we look online.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isHydrated || !activeMatchId) {
      setPendingCompletion(null);
      return;
    }

    const pending = getPendingMatchCompletion(activeMatchId);

    // Never replace an unpersisted in-memory completion for this match with
    // "nothing in storage" (e.g. when auth status changes after ending).
    setPendingCompletion((previous) =>
      pending
        ? { record: pending, persisted: true }
        : previous?.record.matchId === activeMatchId
          ? previous
          : null
    );

    if (pending && auth.status === "authenticated" && navigator.onLine) {
      onPendingCompletionSyncTrigger(pending);
    }
  }, [activeMatchId, auth.status, isHydrated]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Must run before the retry effect below so it sees the new period.
  useEffect(() => {
    connectivityEpochRef.current += 1;
  }, [isOnline]);

  // Retry automatically when connectivity returns. Driven by the online state
  // rather than the `online` event, so a reconnect is not missed when it
  // happens before this effect subscribes or while a send is in flight (the
  // retry then runs once that send has finished without success).
  const pendingRecord = pendingCompletion?.record ?? null;
  useEffect(() => {
    if (!pendingRecord || auth.status !== "authenticated" || !isOnline || isSyncingCompletion) {
      return;
    }

    const lastAttempt = lastCompletionAttemptRef.current;
    if (
      lastAttempt?.matchId === pendingRecord.matchId &&
      lastAttempt.epoch === connectivityEpochRef.current
    ) {
      return;
    }

    onPendingCompletionSyncTrigger(pendingRecord);
  }, [auth.status, isOnline, isSyncingCompletion, pendingRecord]);

  // While the completion only exists in memory, ask before the page is closed
  // or reloaded so the final match state is not discarded without warning.
  const hasUnpersistedCompletion =
    (pendingCompletion !== null && !pendingCompletion.persisted) || localEndUnsaved;
  useEffect(() => {
    if (!hasUnpersistedCompletion) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnpersistedCompletion]);

  const handleEnd = () => {
    if (!window.confirm(t("actions.confirmEnd"))) {
      return;
    }

    setError(null);
    setIsEndingMatch(true);

    const storedSetup = getStoredMatchSetup();
    const endedAtMs = Date.now();
    const endedLiveMatch = liveMatch ? endLiveMatch(liveMatch, endedAtMs) : null;
    const matchIdToEnd = activeMatchId;

    setLiveMatch(endedLiveMatch);
    setSyncedMatchId(null);

    // Write the final state now (not only via the persistence effect) so we
    // know whether it actually reached device storage. On a full device these
    // writes can throw; the completion below must still be sent (or kept in
    // memory), so don't let them abort the end flow.
    let savedOnDevice = true;

    if (endedLiveMatch) {
      try {
        saveStoredLiveMatch(endedLiveMatch);
      } catch {
        savedOnDevice = false;
      }
    }

    if (storedSetup) {
      try {
        endMatch(storedSetup.config);
      } catch {
        savedOnDevice = false;
      }
      setSetupStatus("ended");
    }

    void (async () => {
      if (matchIdToEnd) {
        const completion: PendingMatchCompletion = {
          matchId: matchIdToEnd,
          body: {
            status: "completed",
            scoreFor: endedLiveMatch?.teamScore ?? 0,
            scoreAgainst: endedLiveMatch?.opponentScore ?? 0,
            reportEnabled,
            runtimeState: endedLiveMatch,
          },
          endedAt: new Date(endedAtMs).toISOString(),
        };
        markCompletionAttempt(completion.matchId);
        const result = await submitMatchCompletion(
          completion.matchId,
          completion.body,
          completion.endedAt
        );

        if (result.status !== "completed") {
          handleCompletionNotConfirmed(completion, result);
          return;
        }

        await finishEndedMatch(matchIdToEnd);
        return;
      }

      // Guest/local-only match: there is no server record to confirm and no
      // way to know a page will load, so stay here and show the ended state.
      setLocalEndUnsaved(!savedOnDevice);
      setIsEndingMatch(false);
    })();

  };

  const handleApplySuggestion = () => {
    if (!suggestion) {
      return;
    }

    const minute = liveMatch ? Math.floor(elapsedSeconds / 60) : null;
    const timestampMs = liveMatch ? elapsedSeconds * 1000 : null;

    setLiveMatch((previous) =>
      previous
        ? {
            ...substitutePlayers(
              previous,
              suggestion.outgoingPlayerId,
              suggestion.incomingPlayerId,
              Date.now()
            ),
            events: [
              ...previous.events,
              createSubstitutionEvent({
                minute,
                timestampMs,
                inPlayerId: suggestion.incomingPlayerId,
                inPlayerName: suggestedIncomingPlayer?.name ?? null,
                outPlayerId: suggestion.outgoingPlayerId,
                outPlayerName: suggestedOutgoingPlayer?.name ?? null,
              }),
            ],
          }
        : previous
    );
  };

  // ─── Substitution handlers (used by useLiveSubstitution) ──────────────────

  // Tap and drag substitutions both arrive here. Returns what changed so the
  // undo can reverse exactly that (FP-MS2.1-B1-F1), or null if nothing did.
  const handleSwap = (outgoingPlayerId: string, incomingPlayerId: string): SubstitutionRecord | null => {
    if (!liveMatch || liveMatch.status === "ended") return null;

    const inPlayer = playersById.get(incomingPlayerId);
    const outPlayer = playersById.get(outgoingPlayerId);
    const nowMs = Date.now();
    // One event and one time for both the record and the state update, so the
    // updater is deterministic and matches the record it returns.
    const event = createSubstitutionEvent({
      minute: Math.floor(elapsedSeconds / 60),
      timestampMs: elapsedSeconds * 1000,
      inPlayerId: incomingPlayerId,
      inPlayerName: inPlayer?.name ?? null,
      outPlayerId: outgoingPlayerId,
      outPlayerName: outPlayer?.name ?? null,
    });

    const applied = applySubstitution(liveMatch, outgoingPlayerId, incomingPlayerId, nowMs, event);
    if (!applied) return null;

    setLiveMatch((prev) =>
      prev ? (applySubstitution(prev, outgoingPlayerId, incomingPlayerId, nowMs, event)?.state ?? prev) : prev
    );
    return applied.record;
  };

  // Targeted undo: reverses only this substitution on the current state, so a
  // goal, pause or half-time made inside the window survives. The next
  // runtime-state PATCH carries the removal to the server.
  const handleUndo = (substitution: SubstitutionRecord) => {
    setLiveMatch((prev) => (prev ? undoSubstitution(prev, substitution) : prev));
  };

  // Position swap (FP-MS2.1-B1): tap and drag both arrive here. Slots only —
  // no substitution event, minutes and stints unchanged; persisted by the
  // effect above like every other change, offline too.
  const handlePositionSwap = (fromSlotId: string, toSlotId: string) => {
    setLiveMatch((prev) => (prev && prev.status !== "ended" ? swapLivePositions(prev, fromSlotId, toSlotId) : prev));
  };

  // Targeted undo: reverses only this swap, never a goal or clock change made since.
  const handlePositionSwapUndo = (swap: PositionSwapRecord) => {
    setLiveMatch((prev) => (prev ? undoLivePositionSwap(prev, swap) : prev));
  };

  // ─── useLiveSubstitution ───────────────────────────────────────────────────

  const subInteraction = useLiveSubstitution({
    liveMatch: liveMatch ?? {
      onFieldPlayerIds: [],
      benchPlayerIds: [],
      liveSlotAssignments: {},
    } as unknown as LiveMatchState,
    onSwap: handleSwap,
    onUndo: handleUndo,
    // Offered by the Modern Sideline view only ("Bytt plass" and field drag).
    onPositionSwap: isSidelineLiveUiEnabled() ? handlePositionSwap : undefined,
    onPositionSwapUndo: handlePositionSwapUndo,
    disabled: !liveMatch || liveMatch.status === "ended",
  });

  // ─── Short names + fatigue ─────────────────────────────────────────────────

  const shortNameMap = useMemo(
    () => buildShortNameMap(teamPlayers),
    [teamPlayers]
  );

  const getShortName = (playerId: string) =>
    shortNameMap.get(playerId) ?? playersById.get(playerId)?.name ?? playerId;

  const fatigueMap = useMemo((): Record<string, FatigueLevel> => {
    if (!liveMatch) return {};
    const result: Record<string, FatigueLevel> = {};
    for (const playerId of liveMatch.onFieldPlayerIds) {
      const seconds = getPlayerAccumulatedSeconds(liveMatch, playerId, matchClock.nowMs);
      result[playerId] = getPlayerFatigue(seconds, liveMatch.regularSecondsPerHalf);
    }
    return result;
  }, [liveMatch, matchClock.nowMs]);

  const handleResetView = () => {
    clearStoredLiveMatch();
    router.push("/match/setup");
  };

  const createGoalEventOnServer = async (
    type: "goal_for" | "goal_against",
    minute: number | null
  ) => {
    if (!activeMatchId || auth.status !== "authenticated") {
      return null;
    }

    const response = await fetchOrNull(`/api/matches/${encodeURIComponent(activeMatchId)}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type,
        minute,
        timestampMs: liveMatch ? elapsedSeconds * 1000 : null,
        teamSide: type === "goal_for" ? "own" : "opponent",
        payload: {},
      }),
    });

    if (!response?.ok) {
      return null;
    }

    const payload = await readJsonOrNull<{
      event?: { id: string };
    }>(response);

    return payload?.event?.id ?? null;
  };

  const patchGoalEvent = async (eventId: string, data: Record<string, unknown>) => {
    if (!activeMatchId || auth.status !== "authenticated") {
      return;
    }

    await fetchOrNull(`/api/matches/${encodeURIComponent(activeMatchId)}/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(data),
    });
  };

  const queueGoalPrompt = (eventId: string | null, localEventId: string, minute: number | null) => {
    if (!liveMatch) {
      return;
    }

    const options = liveMatch.onFieldPlayerIds
      .map((playerId) => playersById.get(playerId))
      .filter((player): player is Player => Boolean(player))
      .map((player) => ({ id: player.id, name: player.name }));

    setPromptQueue((previous) => [
      ...previous,
      {
        eventId,
        localEventId,
        minute,
        options,
        step: "scorer",
        scorerId: null,
        scorerName: null,
      },
    ]);
  };

  const handlePromptScorer = (playerId: string | null) => {
    const current = promptQueue[0];
    if (!current) {
      return;
    }

    const player = playerId ? current.options.find((option) => option.id === playerId) : null;

    if (current.eventId) {
      void patchGoalEvent(current.eventId, {
        primaryPlayerId: playerId,
        payload: {
          primaryPlayerName: player?.name ?? null,
        },
      });
    }

    setLiveMatch((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        events: updateGoalEventContributors(previous.events, current.localEventId, {
          scorerPlayerId: playerId,
          scorerName: player?.name ?? null,
        }),
      };
    });

    setPromptQueue((previous) => {
      if (previous.length === 0) {
        return previous;
      }

      const [head, ...rest] = previous;
      return [
        {
          ...head,
          step: "assist",
          scorerId: playerId,
          scorerName: player?.name ?? null,
        },
        ...rest,
      ];
    });
  };

  const handlePromptAssist = (playerId: string | null) => {
    const current = promptQueue[0];
    if (!current) {
      return;
    }

    const player = playerId ? current.options.find((option) => option.id === playerId) : null;

    if (current.eventId) {
      void patchGoalEvent(current.eventId, {
        secondaryPlayerId: playerId,
        payload: {
          primaryPlayerName: current.scorerName,
          secondaryPlayerName: player?.name ?? null,
        },
      });
    }

    setLiveMatch((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        events: updateGoalEventContributors(previous.events, current.localEventId, {
          assistPlayerId: playerId,
          assistName: player?.name ?? null,
        }),
      };
    });

    setPromptQueue((previous) => previous.slice(1));
  };

  const handleTeamScore = (delta: number) => {
    const minute = liveMatch ? Math.floor(elapsedSeconds / 60) : null;
    const timestampMs = liveMatch ? elapsedSeconds * 1000 : null;

    const localGoalEvent =
      delta > 0
        ? createGoalEvent({
            minute,
            timestampMs,
            teamSide: "own",
          })
        : null;

    setLiveMatch((previous) => {
      if (!previous) {
        return previous;
      }

      const next = updateScore(previous, "team", delta);

      if (delta > 0 && localGoalEvent) {
        return {
          ...next,
          events: [...previous.events, localGoalEvent],
        };
      }

      if (delta < 0) {
        const removableIndex = [...previous.events]
          .map((event, index) => ({ event, index }))
          .reverse()
          .find(({ event }) => event.type === "goal" && event.teamSide === "own")?.index;

        if (removableIndex === undefined) {
          return next;
        }

        return {
          ...next,
          events: previous.events.filter((_, index) => index !== removableIndex),
        };
      }

      return next;
    });

    if (delta > 0) {
      void (async () => {
        const eventId = await createGoalEventOnServer("goal_for", minute);

        if (!reportEnabled) {
          return;
        }

        if (!localGoalEvent) {
          return;
        }

        queueGoalPrompt(eventId, localGoalEvent.id, minute);
      })();
    }
  };

  const handleOpponentScore = (delta: number) => {
    const minute = liveMatch ? Math.floor(elapsedSeconds / 60) : null;
    const timestampMs = liveMatch ? elapsedSeconds * 1000 : null;

    setLiveMatch((previous) => {
      if (!previous) {
        return previous;
      }

      const next = updateScore(previous, "opponent", delta);

      if (delta > 0) {
        return {
          ...next,
          events: [
            ...previous.events,
            createGoalEvent({
              minute,
              timestampMs,
              teamSide: "opponent",
            }),
          ],
        };
      }

      if (delta < 0) {
        const removableIndex = [...previous.events]
          .map((event, index) => ({ event, index }))
          .reverse()
          .find(({ event }) => event.type === "goal" && event.teamSide === "opponent")?.index;

        if (removableIndex === undefined) {
          return next;
        }

        return {
          ...next,
          events: previous.events.filter((_, index) => index !== removableIndex),
        };
      }

      return next;
    });

    if (delta > 0) {
      void createGoalEventOnServer("goal_against", minute);
    }
  };

  if (!isHydrated) {
    return (
      <PageShell>
        <AppCard className="p-6 text-sm text-muted-foreground">{common("loading")}</AppCard>
      </PageShell>
    );
  }

  if (workspace.isLoading) {
    return (
      <PageShell>
        <AppCard className="p-6 text-sm text-muted-foreground">{common("loading")}</AppCard>
      </PageShell>
    );
  }

  if (workspace.error) {
    return (
      <PageShell>
        <AppCard className="p-3 text-xs text-danger">{workspace.error}</AppCard>
      </PageShell>
    );
  }

  if (!liveMatch || (setupStatus !== "active" && liveMatch.status !== "ended")) {
    const showRecovery = needsRecovery || Boolean(activeMatch);
    // Continue only where it opens that match: this device's own, or a live
    // server snapshot when the device runs none.
    const recoveryContinueHref = activeMatch
      ? activeMatchHref
      : canContinueRecovery && recoveryMatch
        ? `/match/live?matchId=${encodeURIComponent(recoveryMatch.id)}`
        : null;

    return (
      <PageShell>
        {showRecovery ? (
          <AppCard className="space-y-3 p-4">
            <p className="text-base font-semibold text-foreground">{t("recovery.title")}</p>
            <p className="text-xs text-muted-foreground">{t("recovery.description")}</p>
            <div className="grid gap-2">
              {recoveryContinueHref ? (
                <Link href={recoveryContinueHref}>
                  <FpButton variant="primary" size="md" fullWidth>
                    {t("recovery.continue")}
                  </FpButton>
                </Link>
              ) : null}
              <FpButton
                variant="danger"
                size="md"
                fullWidth
                disabled={isResolvingRecoveryAction}
                onClick={() => {
                  setIsResolvingRecoveryAction(true);
                  void forceCloseActiveMatch()
                    .then(() => {
                      router.push("/match");
                    })
                    .catch(() => {
                      setError(t("recovery.endFailed"));
                    })
                    .finally(() => {
                      setIsResolvingRecoveryAction(false);
                    });
                }}
              >
                {t("recovery.end")}
              </FpButton>
              <FpButton
                variant="danger"
                size="md"
                fullWidth
                disabled={isResolvingRecoveryAction}
                onClick={() => {
                  setIsResolvingRecoveryAction(true);
                  void discardActiveMatch()
                    .then(() => {
                      router.push("/match");
                    })
                    .catch(() => {
                      setError(t("recovery.discardFailed"));
                    })
                    .finally(() => {
                      setIsResolvingRecoveryAction(false);
                    });
                }}
              >
                {t("recovery.discard")}
              </FpButton>
            </div>
          </AppCard>
        ) : (
          <EmptyState
            icon={Play}
            title={t("empty")}
            description={t("emptyDescription")}
            action={
              <Link href="/match/setup">
                <FpButton variant="primary" size="md">
                  {t("actions.toSetup")}
                </FpButton>
              </Link>
            }
          />
        )}
      </PageShell>
    );
  }

  // Modern Sideline view (flag, off by default). Presentation only: it reuses
  // the state and handlers above and adds no mutation path of its own.
  if (isSidelineLiveUiEnabled()) {
    const prompt = promptQueue[0] ?? null;

    return (
      <LiveScreen
        model={buildLiveScreenModel({
          liveMatch,
          nowMs: matchClock.nowMs,
          clock: elapsedClock,
          inStoppage,
          playersById,
          getShortName,
          suggestion,
          interaction: subInteraction.state,
        })}
        isOnline={isOnline}
        undo={
          (subInteraction.state.kind === "pendingUndo" || subInteraction.state.kind === "pendingPositionUndo") &&
          subInteraction.undoSecondsRemaining !== null
            ? {
                secondsRemaining: subInteraction.undoSecondsRemaining,
                expiresAtMs: subInteraction.state.expiresAtMs,
              }
            : null
        }
        ghost={
          subInteraction.ghostChip
            ? {
                name: getShortName(subInteraction.ghostChip.benchPlayerId),
                x: subInteraction.ghostChip.x,
                y: subInteraction.ghostChip.y,
              }
            : subInteraction.positionDrag
              ? {
                  name: getShortName(subInteraction.positionDrag.fieldPlayerId),
                  x: subInteraction.positionDrag.x,
                  y: subInteraction.positionDrag.y,
                  dropSlotId: subInteraction.positionDrag.targetSlotId,
                }
              : null
        }
        goalPrompt={
          prompt
            ? {
                key: `${prompt.localEventId}-${prompt.step}`,
                step: prompt.step,
                options: (prompt.step === "assist"
                  ? prompt.options.filter((option) => option.id !== prompt.scorerId)
                  : prompt.options
                ).map((option) => {
                  const player = playersById.get(option.id);
                  return {
                    id: option.id,
                    name: getShortName(option.id),
                    discLabel: discLabel(player ?? { name: option.name }),
                    hasNumber: player?.number !== undefined && player?.number !== null,
                  };
                }),
              }
            : null
        }
        notices={{
          error,
          pendingCompletion: pendingCompletion ? { persisted: pendingCompletion.persisted } : null,
          isOnline,
          isSyncingCompletion,
          onRetryCompletion: () => {
            if (pendingCompletion) void syncPendingCompletion(pendingCompletion.record);
          },
          syncedMatchId,
          onOpenReport: () => {
            if (syncedMatchId) router.push(`/match/${encodeURIComponent(syncedMatchId)}`);
          },
          endedLocally:
            liveMatch.status === "ended" && !activeMatchId && !pendingCompletion && !syncedMatchId
              ? { unsaved: localEndUnsaved }
              : null,
        }}
        ending={isEndingMatch ? { done: endMatchDone } : null}
        handlers={{
          onStart: handleStart,
          onPause: handlePause,
          onResume: handleResume,
          onEndHalf: handleEndHalf,
          onEndMatch: handleEnd,
          onGoalUs: () => handleTeamScore(1),
          onGoalThem: () => handleOpponentScore(1),
          onRemoveGoalUs: () => handleTeamScore(-1),
          onRemoveGoalThem: () => handleOpponentScore(-1),
          onTapFieldPlayer: subInteraction.tapFieldPlayer,
          onTapBenchPlayer: subInteraction.tapBenchPlayer,
          onCancelSelection: subInteraction.cancel,
          onStartPositionSwap: subInteraction.startPositionSwap,
          onUndo: subInteraction.triggerUndo,
          onBenchPointerDown: (benchPlayerId, event, options) =>
            subInteraction.getBenchPointerDownHandler(benchPlayerId, options)(event),
          onFieldPointerDown: (playerId, slotId, event) =>
            subInteraction.getFieldPointerDownHandler(playerId, slotId)(event),
          pointerSurfaceHandlers: subInteraction.pointerSurfaceHandlers,
          onSetupNext: handleResetView,
          onPickGoalContributor: (playerId) => {
            if (prompt?.step === "scorer") {
              handlePromptScorer(playerId);
            } else {
              handlePromptAssist(playerId);
            }
          },
        }}
      />
    );
  }

  return (
    <PageShell className="space-y-3 pb-6">
      {/* ── Minimal back nav: Home, never setup, so the match keeps running ── */}
      <Link
        href="/"
        className="tap-target -ml-1 inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft size={14} />
        {liveMatch.status === "ended" ? common("back") : t("sideline.menu.leaveToHome")}
      </Link>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={variants.staggerContainer}
        className="space-y-3"
      >
        {error ? <AppCard className="p-3 text-xs text-danger">{error}</AppCard> : null}

        {pendingCompletion ? (
          <AppCard className="space-y-2 p-3">
            {pendingCompletion.persisted ? (
              <div role="status" className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{t("pendingSync.title")}</p>
                <p className="text-xs text-muted-foreground">
                  {isOnline ? t("pendingSync.descriptionOnline") : t("pendingSync.descriptionOffline")}
                </p>
              </div>
            ) : (
              <div role="alert" className="space-y-1">
                <p className="text-sm font-semibold text-danger">{t("pendingSync.notSavedTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {isOnline
                    ? t("pendingSync.notSavedDescriptionOnline")
                    : t("pendingSync.notSavedDescriptionOffline")}
                </p>
              </div>
            )}
            <FpButton
              variant="secondary"
              size="sm"
              disabled={!isOnline || isSyncingCompletion}
              onClick={() => {
                void syncPendingCompletion(pendingCompletion.record);
              }}
            >
              {isSyncingCompletion ? t("pendingSync.syncing") : t("pendingSync.retry")}
            </FpButton>
          </AppCard>
        ) : null}

        {syncedMatchId ? (
          <AppCard className="space-y-2 p-3">
            <div role="status" className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{t("pendingSync.syncedTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("pendingSync.syncedDescription")}</p>
            </div>
            <FpButton
              variant="primary"
              size="sm"
              onClick={() => {
                router.push(`/match/${encodeURIComponent(syncedMatchId)}`);
              }}
            >
              {t("endingSequence.goToReport")}
            </FpButton>
          </AppCard>
        ) : null}

        {liveMatch.status === "ended" && !activeMatchId && !pendingCompletion && !syncedMatchId ? (
          <AppCard className="space-y-2 p-3">
            {localEndUnsaved ? (
              <div role="alert" className="space-y-1">
                <p className="text-sm font-semibold text-danger">{t("endedLocally.title")}</p>
                <p className="text-xs text-muted-foreground">{t("endedLocally.notSaved")}</p>
              </div>
            ) : (
              <div role="status" className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{t("endedLocally.title")}</p>
                <p className="text-xs text-muted-foreground">{t("endedLocally.saved")}</p>
              </div>
            )}
            {isOnline ? (
              <Link href="/historikk" className="inline-block">
                <FpButton variant="secondary" size="sm">
                  {t("endedLocally.historyCta")}
                </FpButton>
              </Link>
            ) : null}
          </AppCard>
        ) : null}

        {/* ── Combined score + timer card ──────────────────────── */}
        <motion.div variants={variants.fadeInUp}>
          <AppCard
            glow={liveMatch.status === "running" ? "accent" : "none"}
            className="space-y-4 p-4"
          >
            {/* Score row: [- score +] : [- score +] */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              {/* Team */}
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("score.team")}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={t("score.decreaseTeam")}
                    className="tap-target flex h-11 w-11 items-center justify-center rounded-full border border-fp-border bg-fp-surface-2 transition-colors active:bg-fp-surface disabled:opacity-40"
                    onClick={() => handleTeamScore(-1)}
                    disabled={liveMatch.teamScore === 0 || liveMatch.status === "ended"}
                  >
                    <Minus size={15} />
                  </button>
                  <p className="min-w-[2rem] text-center text-4xl font-black tabular-nums text-foreground leading-none">
                    {liveMatch.teamScore}
                  </p>
                  <button
                    type="button"
                    aria-label={t("score.increaseTeam")}
                    className="tap-target flex h-11 w-11 items-center justify-center rounded-full border border-fp-cta/40 bg-fp-cta/15 text-fp-cta transition-colors active:bg-fp-cta/25 disabled:opacity-40"
                    onClick={() => handleTeamScore(1)}
                    disabled={liveMatch.status === "ended"}
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              {/* Divider */}
              <p className="text-xl font-black leading-none text-muted-foreground/30">:</p>

              {/* Opponent */}
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("score.opponent")}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={t("score.decreaseOpponent")}
                    className="tap-target flex h-11 w-11 items-center justify-center rounded-full border border-fp-border bg-fp-surface-2 transition-colors active:bg-fp-surface disabled:opacity-40"
                    onClick={() => handleOpponentScore(-1)}
                    disabled={liveMatch.opponentScore === 0 || liveMatch.status === "ended"}
                  >
                    <Minus size={15} />
                  </button>
                  <p className="min-w-[2rem] text-center text-4xl font-black tabular-nums text-foreground leading-none">
                    {liveMatch.opponentScore}
                  </p>
                  <button
                    type="button"
                    aria-label={t("score.increaseOpponent")}
                    className="tap-target flex h-11 w-11 items-center justify-center rounded-full border border-fp-border bg-fp-surface-2 transition-colors active:bg-fp-surface disabled:opacity-40"
                    onClick={() => handleOpponentScore(1)}
                    disabled={liveMatch.status === "ended"}
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Separator */}
            <div className="h-px bg-fp-border" />

            {/* Timer panel (bare, no own card) */}
            <MatchTimerPanel
              status={liveMatch.status}
              statusLabel={statusLabel(liveMatch.status, t)}
              timerLabel={t("timer.elapsedPrimary")}
              durationLabel={t("timer.duration", {
                duration: Math.floor(liveMatch.durationSeconds / 60),
              })}
              primaryClock={elapsedClock}
              secondaryLabel={t("timer.remainingSecondary", { remaining: remainingClock })}
              phaseLabel={
                liveMatch.phase === "half_time"
                  ? t("phase.halfTime")
                  : currentHalf === 2
                    ? t("phase.secondHalf")
                    : t("phase.firstHalf")
              }
              stoppageLabel={inStoppage ? t("timer.stoppage", { value: formatClock(phaseStoppageSeconds) }) : null}
              onStart={handleStart}
              onPause={handlePause}
              onResume={handleResume}
              onEnd={handleEnd}
              onEndHalf={handleEndHalf}
              startLabel={t("actions.start")}
              pauseLabel={t("actions.pause")}
              resumeLabel={t("actions.resume")}
              endLabel={t("actions.end")}
              endHalfLabel={t("actions.endHalf")}
              startSecondHalfLabel={t("actions.startSecondHalf")}
              canEndHalf={liveMatch.halves === 2 && (liveMatch.phase === "first_half" || liveMatch.phase === "second_half") && liveMatch.status !== "ended"}
              canStartSecondHalf={liveMatch.phase === "half_time" && liveMatch.status === "paused"}
            />

            {/* Compact event strip */}
            {liveEvents.length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-fp-border pt-3">
                {liveEvents.slice(-8).map((ev) => (
                  <span key={ev.id} className="text-[10px] tabular-nums text-muted-foreground">
                    {ev.minute !== null ? `${ev.minute}'` : ""}
                    {ev.type === "goal" ? " ⚽" : " ↕"}
                    {ev.type === "goal" && ev.scorerName ? ` ${ev.scorerName}` : ""}
                    {ev.type === "substitution" && ev.inPlayerName ? ` ${ev.inPlayerName}` : ""}
                  </span>
                ))}
              </div>
            ) : null}
          </AppCard>
        </motion.div>

        {/* ── Pitch + bench (unified drag surface) ─────────────── */}
        <motion.div variants={variants.fadeInUp}>
          <AppCard className="p-3">
            <div
              className="relative select-none"
              {...subInteraction.pointerSurfaceHandlers}
            >
              {/* Fatigue strip: passive coach intelligence hint. Tap to pre-select. */}
              {suggestion && liveMatch.status !== "ended" && (
                <button
                  type="button"
                  className="mb-2 flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-fp-surface-2 active:bg-fp-surface-2"
                  onClick={() => {
                    subInteraction.tapFieldPlayer(suggestion.outgoingPlayerId);
                  }}
                >
                  <span className="text-[11px] text-muted-foreground">
                    ↻ {suggestedOutgoingPlayer?.name ?? suggestion.outgoingPlayerId}{" "}
                    · {formatPlaytime(suggestion.outgoingSeconds)}
                  </span>
                </button>
              )}

              <LivePitchView
                slots={getFormationSlots(liveMatch.format, liveMatch.formationId)}
                liveSlotAssignments={liveMatch.liveSlotAssignments}
                onFieldPlayerIds={liveMatch.onFieldPlayerIds}
                interactionState={subInteraction.state}
                fatigueMap={fatigueMap}
                getShortName={getShortName}
                getPlaytime={getPlayerPlaytime}
                disabled={liveMatch.status === "ended"}
                onSlotTap={(playerId) => subInteraction.tapFieldPlayer(playerId)}
                onBackgroundTap={() => subInteraction.cancel()}
                onSlotPointerDown={(_playerId, _slotId, _e) => {
                  // Field-to-field drag (position swap) is handled via tap flow
                  // in the Field Command model. PointerDown on field chips is a
                  // no-op here — tap selection is sufficient for swaps.
                }}
              />

              <LiveBenchStrip
                benchPlayerIds={liveMatch.benchPlayerIds}
                interactionState={subInteraction.state}
                getShortName={getShortName}
                getPlaytime={getPlayerPlaytime}
                suggestedIncomingPlayerId={suggestion?.incomingPlayerId ?? null}
                disabled={liveMatch.status === "ended"}
                onTap={(benchPlayerId) => subInteraction.tapBenchPlayer(benchPlayerId)}
                onPointerDown={(benchPlayerId, e) =>
                  subInteraction.getBenchPointerDownHandler(benchPlayerId)(e)
                }
              />

              {/* Drag ghost chip */}
              {subInteraction.ghostChip && (
                <div
                  className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-white/20 bg-fp-surface-2 text-[10px] font-bold text-foreground shadow-2xl"
                  style={{
                    left: subInteraction.ghostChip.x,
                    top: subInteraction.ghostChip.y,
                  }}
                >
                  {getShortName(subInteraction.ghostChip.benchPlayerId)}
                </div>
              )}
            </div>
          </AppCard>
        </motion.div>

        {liveMatch.status === "ended" && (
          <motion.div variants={variants.fadeInUp}>
            <AppCard className="space-y-3 border-danger/30 bg-danger/5 p-4">
              <p className="text-sm font-semibold text-foreground">{t("ended.title")}</p>
              <p className="text-xs text-muted-foreground">{t("ended.description")}</p>
              <FpButton variant="secondary" size="md" fullWidth onClick={handleResetView}>
                {t("actions.setupNext")}
              </FpButton>
            </AppCard>
          </motion.div>
        )}
      </motion.div>

      {promptQueue[0] ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/45 p-3">
          <AppCard className="w-full space-y-3 p-4">
            <div className="h-0.5 w-full overflow-hidden rounded-full bg-fp-border">
              <motion.div
                key={`${promptQueue[0].localEventId}-${promptQueue[0].step}`}
                className="h-full bg-primary/40"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 10, ease: "linear" }}
                style={{ transformOrigin: "left" }}
              />
            </div>
            <p className="text-base font-semibold text-foreground">
              {promptQueue[0].step === "scorer" ? t("prompt.scorerTitle") : t("prompt.assistTitle")}
            </p>
            <div className="grid grid-cols-1 gap-2">
              {(promptQueue[0].step === "assist"
                ? promptQueue[0].options.filter((o) => o.id !== promptQueue[0]!.scorerId)
                : promptQueue[0].options
              ).map((option) => (
                <FpButton
                  key={option.id}
                  variant="secondary"
                  size="lg"
                  fullWidth
                  onClick={() => {
                    if (promptQueue[0]?.step === "scorer") {
                      handlePromptScorer(option.id);
                    } else {
                      handlePromptAssist(option.id);
                    }
                  }}
                >
                  {option.name}
                </FpButton>
              ))}
            </div>
            {promptQueue[0].step === "scorer" ? (
              <FpButton
                variant="ghost"
                size="md"
                fullWidth
                onClick={() => handlePromptScorer(null)}
              >
                {t("prompt.skip")}
              </FpButton>
            ) : (
              <FpButton
                variant="ghost"
                size="md"
                fullWidth
                onClick={() => handlePromptAssist(null)}
              >
                {t("prompt.noAssist")}
              </FpButton>
            )}
          </AppCard>
        </div>
      ) : null}

      {/* ── Undo toast ───────────────────────────────────────── */}
      <UndoToast
        secondsRemaining={subInteraction.undoSecondsRemaining}
        onUndo={subInteraction.triggerUndo}
      />

      <AnimatePresence>
        {isEndingMatch && (
          <motion.div
            key="ending-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95 backdrop-blur-sm"
          >
            {endMatchDone ? (
              <motion.div
                key="done"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-3 text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Play size={32} fill="currentColor" />
                </div>
                <p className="text-xl font-bold text-foreground">{t("endingSequence.done")}</p>
                <p className="text-sm text-muted-foreground">{t("endingSequence.subtitle")}</p>
              </motion.div>
            ) : (
              <motion.div
                key="loading"
                className="flex flex-col items-center gap-3 text-center"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  className="h-10 w-10 rounded-full border-2 border-fp-border border-t-primary"
                />
                <p className="text-lg font-semibold text-foreground">{t("endingSequence.title")}</p>
                <p className="text-sm text-muted-foreground">{t("endingSequence.subtitle")}</p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </PageShell>
  );
}
