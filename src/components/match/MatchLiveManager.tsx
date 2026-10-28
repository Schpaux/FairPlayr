"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Minus, Plus, ChevronLeft, ShieldAlert } from "lucide-react";
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
import {
  DEFAULT_SUGGESTION_MIN_GAP_SECONDS,
  getLiveKeeperPlayerIds,
  getSubstitutionSuggestion,
} from "@/domain/substitutionSuggestion";
import { getPlayerFatigue, type FatigueLevel } from "@/domain/playerFatigue";
import {
  createGoalEvent,
  createSubstitutionEvent,
  updateGoalEventContributors,
} from "@/domain/matchEvent";
import {
  endMatch,
  getStoredMatchSetup,
  hasActiveStoredMatch,
  type MatchStatus,
} from "@/lib/storage/matchStorage";
import {
  clearStoredLiveMatch,
  getStoredLiveMatch,
  LIVE_MATCH_STORAGE_KEY,
  normalizeLiveMatchState,
  saveStoredLiveMatch,
  trySaveStoredLiveMatch,
} from "@/lib/storage/liveMatchStorage";
import {
  getServerStorageSignalSnapshot,
  getStorageSignalSnapshot,
  subscribeStorageSignals,
} from "@/lib/storage/storageEnvelope";
import {
  detectClosedGap,
  keepInMemoryLiveMatch,
  mayServerReplaceLocal,
  resolveRestoreSquad,
} from "@/domain/matchRestore";
import { clearSquadSnapshot, getSquadSnapshot, saveSquadSnapshot } from "@/lib/storage/squadSnapshotStorage";
import {
  checkClosedGapOncePerDocument,
  getDocumentClosedGap,
  getLiveHeartbeat,
  keepLiveHeartbeat,
  saveLiveHeartbeat,
  stopLiveHeartbeat,
  type DocumentClosedGap,
} from "@/lib/storage/liveHeartbeatStorage";
import { requestPersistentStorage } from "@/lib/storage/persistentStorage";
import { RestoredMatchNotice } from "@/components/match/RestoredMatchNotice";
import { StorageErrorNotice, WorkspaceErrorNotice } from "@/components/match/StorageErrorNotice";
import { pickLiveBandItem, type LiveBandItem } from "@/components/live/liveBand";
import type { LiveMenuNote } from "@/components/live/LiveSheets";
import { buildDisplayNameMap } from "@/lib/utils/playerName";
import { fetchOrNull, readJsonOrNull } from "@/lib/utils/fetchOrNull";
import { completionContextFor, resolveClosedOnDevice } from "@/lib/match/activeMatchRecovery";
import { sendLiveRuntimeState } from "@/lib/match/liveRuntimeSync";
import { LiveSharePanel } from "@/components/share/LiveSharePanel";
import {
  getPendingMatchCompletion,
  type PendingMatchCompletion,
} from "@/lib/storage/pendingMatchCompletionStorage";
import {
  hasUnsavedMatchCompletion,
  submitMatchCompletion,
  type MatchCompletionResult,
} from "@/lib/match/matchCompletion";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { PageShell } from "@/components/ui/PageShell";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { Button, ButtonLink } from "@/components/ui/primitives";
import { ActiveMatchCloseConfirm, useActiveMatchCloseConfirm } from "@/components/match/ActiveMatchCloseConfirm";
import { LiveStateScreen } from "@/components/live/LiveStateScreen";
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
import { APP_HOME_PATH } from "@/lib/appRoutes";

interface PromptPlayerOption {
  id: string;
  name: string;
}

interface GoalPromptState {
  localEventId: string;
  minute: number | null;
  options: PromptPlayerOption[];
  step: "scorer" | "assist";
  scorerId: string | null;
  scorerName: string | null;
}

const NO_PLACEHOLDERS: ReadonlySet<string> = new Set();

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
  const tRestore = useTranslations("restore");
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
  // MATCH-12: the scorer sheet follows the match's own setup on this device;
  // the server's answer, for the same match only, can only correct it.
  const [localReportEnabled, setLocalReportEnabled] = useState(false);
  const [serverReportEnabled, setServerReportEnabled] = useState<{ matchId: string; value: boolean } | null>(null);
  const reportEnabled =
    activeMatchId && serverReportEnabled?.matchId === activeMatchId ? serverReportEnabled.value : localReportEnabled;
  const [promptQueue, setPromptQueue] = useState<GoalPromptState[]>([]);
  const [isResolvingRecoveryAction, setIsResolvingRecoveryAction] = useState(false);
  // MATCH-03: ending or discarding a match from the recovery screen goes
  // through the same confirmation as everywhere else outside Live.
  const recoveryConfirm = useActiveMatchCloseConfirm(async (action) => {
    setError(null);
    setIsResolvingRecoveryAction(true);
    // No `finally`: the React Compiler (and its lint) skip a component that
    // uses one.
    try {
      await (action === "end" ? forceCloseActiveMatch() : discardActiveMatch());
      router.push("/match");
    } catch {
      setError(t(action === "end" ? "recovery.endFailed" : "recovery.discardFailed"));
    }
    setIsResolvingRecoveryAction(false);
  });

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

  // OFF-01a restore. The device is the source of truth for a match in
  // progress: it is restored from localStorage only, never set to null while
  // a local match exists, and never replaced by an older copy (from storage
  // or the server) while it is on screen.
  // B9: minutes the app was closed while the clock ran, for the band (null =
  // no band). Evaluated once per document load (a cold start or reload),
  // never on a remount after in-app navigation. `sessionClosedGap` keeps the
  // result for the menu for the rest of the session.
  const [closedGapMinutes, setClosedGapMinutes] = useState<number | null>(null);
  const [sessionClosedGap, setSessionClosedGap] = useState<DocumentClosedGap | null>(() => getDocumentClosedGap());
  // Players shown with a placeholder name («Spiller 3»): never stored in
  // events or sent to the server (names resolve from ids at render time).
  const [placeholderPlayerIds, setPlaceholderPlayerIds] = useState<ReadonlySet<string>>(NO_PLACEHOLDERS);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const storedSetup = getStoredMatchSetup();
    const storedLiveMatch = getStoredLiveMatch();
    const ownStoredLiveMatch =
      storedSetup && storedLiveMatch && storedLiveMatch.setupId === storedSetup.config.id
        ? storedLiveMatch
        : null;
    const hasLocalMatch = Boolean(storedSetup && (ownStoredLiveMatch || storedSetup.status === "active"));
    const snapshot = storedSetup ? getSquadSnapshot(storedSetup.config.id) : null;

    // A local match with a squad snapshot does not wait for the team list,
    // which may be slow or never arrive offline; it is used once it loads.
    if (workspace.isLoading && !(hasLocalMatch && snapshot)) {
      return;
    }

    setLocalSetupId(storedSetup?.config.id ?? null);
    setSetupSource("none");
    setSetupServerMatchId(undefined);
    setLocalReportEnabled(storedSetup?.config.reportEnabled ?? false);

    if (!storedSetup) {
      setTeamPlayers([]);
      setPlaceholderPlayerIds(NO_PLACEHOLDERS);
      setLiveMatch(null);
      setSetupStatus(null);
      return;
    }

    const setupTeam = workspace.isLoading
      ? null
      : workspace.teams.find((team) => team.id === storedSetup.config.teamId) ?? null;
    // Team (live data or the local mirror) → squad snapshot → placeholders
    // from the match's own ids. Null only without a local match.
    const squad = resolveRestoreSquad({
      setupId: storedSetup.config.id,
      teamId: storedSetup.config.teamId,
      squadPlayerIds: storedSetup.config.selectedPlayerIds,
      team: setupTeam,
      snapshot,
      liveMatch: ownStoredLiveMatch,
      hasLocalMatch,
      placeholderName: (index) => tRestore("placeholderPlayer", { index }),
    });

    if (!squad) {
      setTeamPlayers([]);
      setPlaceholderPlayerIds(NO_PLACEHOLDERS);
      setLiveMatch(null);
      setSetupStatus(storedSetup.status);
      return;
    }
    setTeamPlayers(squad.players);
    setPlaceholderPlayerIds(
      squad.placeholderPlayerIds.length > 0 ? new Set(squad.placeholderPlayerIds) : NO_PLACEHOLDERS
    );

    if (setupTeam && storedSetup.status === "active") {
      saveSquadSnapshot({
        setupId: storedSetup.config.id,
        teamId: storedSetup.config.teamId,
        squadPlayerIds: storedSetup.config.selectedPlayerIds,
        players: setupTeam.players,
      });
    }

    if (storedSetup.status === "active") {
      // Best effort: ask the browser not to evict this match (FP-OFF-01 G6).
      void requestPersistentStorage();
    }

    if (ownStoredLiveMatch) {
      const closedGap = checkClosedGapOncePerDocument(() => {
        const gap = detectClosedGap({
          heartbeat: getLiveHeartbeat(),
          liveMatch: ownStoredLiveMatch,
          nowMs: Date.now(),
        });
        return gap ? { matchId: ownStoredLiveMatch.id, minutes: gap.minutes } : null;
      });
      if (closedGap.firstCheck) {
        setClosedGapMinutes(closedGap.gap ? closedGap.gap.minutes : null);
      }
      setSessionClosedGap(closedGap.gap);

      const restored = reconcileLiveMatchWithSquad(ownStoredLiveMatch, storedSetup.config.selectedPlayerIds);
      setLiveMatch((previous) => keepInMemoryLiveMatch(previous, restored));
      setSetupStatus(storedSetup.status);
      setSetupSource("setup");
      setSetupServerMatchId(storedSetup.serverMatchId);
      return;
    }

    if (storedSetup.status === "active") {
      const created = createLiveMatchFromSetup(storedSetup.config);
      setLiveMatch((previous) => keepInMemoryLiveMatch(previous, created));
      setSetupStatus(storedSetup.status);
      setSetupSource("setup");
      setSetupServerMatchId(storedSetup.serverMatchId);
      return;
    }
    setLiveMatch(null);
    setSetupStatus(storedSetup.status);
  }, [activeMatch?.teamId, activeMatchId, isHydrated, tRestore, workspace.activeTeamId, workspace.isLoading, workspace.teams]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isHydrated || !liveMatch) {
      return;
    }

    // Never throws: a full device must not unmount the screen and lose the
    // in-memory match. A failed write raises the storage signal, which shows
    // «Ikke lagret» (meta line, menu, band) until a later save works; a newer build's record is
    // not overwritten (UpdateRequiredSheet asks for a reload). The end flow
    // detects and warns about failed persistence for the completion itself.
    trySaveStoredLiveMatch(liveMatch);
  }, [liveMatch, isHydrated]);

  const storageSignals = useSyncExternalStore(
    subscribeStorageSignals,
    getStorageSignalSnapshot,
    getServerStorageSignalSnapshot
  );
  const liveMatchSaveFailed = Boolean(storageSignals.writeErrors[LIVE_MATCH_STORAGE_KEY]);

  // A dismissed storage band comes back with the next failure episode: the
  // dismissal is forgotten once a save works again (state adjusted during
  // render, not in an effect).
  const [storageBandDismissed, setStorageBandDismissed] = useState(false);
  if (storageBandDismissed && !liveMatchSaveFailed) {
    setStorageBandDismissed(false);
  }
  // The team list error that the coach hid from the band (the menu keeps it).
  const [dismissedWorkspaceError, setDismissedWorkspaceError] = useState<string | null>(null);

  // B9 heartbeat: every 15 s and when the page is hidden or closed, so the
  // next cold start can tell how long the app was closed. It is document
  // wide: it keeps beating while the coach is on another screen and the
  // match is still active, and it beats once more when Live unmounts.
  const heartbeatMatchId = liveMatch && liveMatch.status !== "ended" ? liveMatch.id : null;

  useEffect(() => {
    if (!isHydrated || !heartbeatMatchId) {
      return;
    }

    keepLiveHeartbeat(heartbeatMatchId, hasActiveStoredMatch);

    return () => {
      saveLiveHeartbeat(heartbeatMatchId);
    };
  }, [heartbeatMatchId, isHydrated]);

  const liveMatchEnded = liveMatch?.status === "ended";
  useEffect(() => {
    if (liveMatchEnded) stopLiveHeartbeat();
  }, [liveMatchEnded]);

  // MATCH-02a / OFF-01b: the state on screen, goals with scorer and assist
  // included, goes to the server until it has arrived. A state that could
  // not be sent is sent again when the network or the app comes back, and
  // after a reload (the restored state has not been sent yet). Sending a
  // state twice is safe: the server ignores older states and keeps one row
  // per goal.
  const runtimeSentRef = useRef<{ matchId: string; state: LiveMatchState } | null>(null);
  const [runtimeRetryTick, setRuntimeRetryTick] = useState(0);
  const userId = auth.user?.id ?? null;

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        setRuntimeRetryTick((tick) => tick + 1);
      }
    };

    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, []);

  useEffect(() => {
    // An ended match is sent once, by the completion (FP-P0-F2); a runtime
    // sync after that could only race it.
    if (
      !isHydrated ||
      auth.status !== "authenticated" ||
      !activeMatchId ||
      !liveMatch ||
      liveMatch.status === "ended" ||
      !isOnline
    ) {
      return;
    }

    const sent = runtimeSentRef.current;
    if (sent?.matchId === activeMatchId && sent.state === liveMatch) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void sendLiveRuntimeState({ matchId: activeMatchId, userId, liveMatch }).then((result) => {
        if (result !== "retry") {
          runtimeSentRef.current = { matchId: activeMatchId, state: liveMatch };
        }
      });
    }, 600);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeMatchId, auth.status, isHydrated, isOnline, liveMatch, runtimeRetryTick, userId]);

  useEffect(() => {
    if (!isHydrated || auth.status !== "authenticated" || !activeMatchId) {
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
        match?: { reportEnabled?: boolean };
      }>(response);

      // Stored with its match id: a late answer never applies to another match.
      if (!cancelled && typeof payload?.match?.reportEnabled === "boolean") {
        setServerReportEnabled({ matchId: activeMatchId, value: payload.match.reportEnabled });
      }
    })();

    return () => {
      cancelled = true;
    };
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

      // OFF-01a: a server copy never replaces newer local data, nor a match
      // that appeared on screen while the request was out.
      if (!mayServerReplaceLocal(getStoredLiveMatch(), normalized)) {
        return;
      }

      setLiveMatch((previous) => previous ?? normalized);
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

  // Product rules (MATCH-09): never the keeper, and only from a 4′ gap.
  const suggestion = liveMatch
    ? getSubstitutionSuggestion(liveMatch, matchClock.nowMs, {
        excludePlayerIds: getLiveKeeperPlayerIds(liveMatch),
        minGapSeconds: DEFAULT_SUGGESTION_MIN_GAP_SECONDS,
      })
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
    const result = await submitMatchCompletion(record.matchId, record.body, record.endedAt, record);

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

  const endMatchNow = () => {
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
        // MATCH-13-F4: the end is kept with the setup until the server
        // confirms it, so a reload still knows the completion is not secured.
        endMatch(
          storedSetup.config,
          matchIdToEnd && storedSetup.serverMatchId === matchIdToEnd
            ? { endedAt: new Date(endedAtMs).toISOString(), reportEnabled }
            : null
        );
        // The match is over on the device: its squad names go (AGENTS.md §2).
        // Kept when the end could not be stored, so a reload still restores
        // the match with names.
        clearSquadSnapshot();
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
          // Owner, History info and a still missing server row (MATCH-13).
          ...(storedSetup && storedSetup.serverMatchId === matchIdToEnd
            ? completionContextFor(storedSetup, endedLiveMatch)
            : {}),
        };
        markCompletionAttempt(completion.matchId);
        const result = await submitMatchCompletion(
          completion.matchId,
          completion.body,
          completion.endedAt,
          completion
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

  // The legacy view still asks with the browser dialog; the Sideline view
  // confirms in its own sheet first and calls `endMatchNow` (UI-A11Y-02).
  const handleEnd = () => {
    if (!window.confirm(t("actions.confirmEnd"))) {
      return;
    }

    endMatchNow();
  };

  // The name stored in events and sent to the server: the real name only,
  // never a placeholder («Spiller 3»); without one, null, and screens resolve
  // the name from the id when they render.
  const storedPlayerName = (playerId: string | null | undefined): string | null =>
    playerId && !placeholderPlayerIds.has(playerId) ? playersById.get(playerId)?.name ?? null : null;

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
                inPlayerName: storedPlayerName(suggestion.incomingPlayerId),
                outPlayerId: suggestion.outgoingPlayerId,
                outPlayerName: storedPlayerName(suggestion.outgoingPlayerId),
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

    const nowMs = Date.now();
    // One event and one time for both the record and the state update, so the
    // updater is deterministic and matches the record it returns.
    const event = createSubstitutionEvent({
      minute: Math.floor(elapsedSeconds / 60),
      timestampMs: elapsedSeconds * 1000,
      inPlayerId: incomingPlayerId,
      inPlayerName: storedPlayerName(incomingPlayerId),
      outPlayerId: outgoingPlayerId,
      outPlayerName: storedPlayerName(outgoingPlayerId),
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

  // The name ladder is built from the match squad (DESIGN.md §5.2), in team
  // order like setup, so a clash with a player who is not here adds nothing.
  const squadKey = liveMatch
    ? [
        ...new Set([
          ...Object.keys(liveMatch.playerAccumulatedMs),
          ...liveMatch.onFieldPlayerIds,
          ...liveMatch.benchPlayerIds,
        ]),
      ].join("\n")
    : null;
  const shortNameMap = useMemo(() => {
    if (squadKey === null) return buildDisplayNameMap(teamPlayers);
    const squad = new Set(squadKey.split("\n"));
    return buildDisplayNameMap(teamPlayers.filter((player) => squad.has(player.id)));
  }, [teamPlayers, squadKey]);

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
    // MATCH-13-F4: an ended match whose completion is not secured keeps its
    // stored final state; setup then refuses to start over it.
    if (!hasUnsavedMatchCompletion()) {
      clearStoredLiveMatch();
    }
    router.push("/match/setup");
  };

  const queueGoalPrompt = (localEventId: string, minute: number | null) => {
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

    const scorerName = storedPlayerName(playerId);

    setLiveMatch((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        events: updateGoalEventContributors(previous.events, current.localEventId, {
          scorerPlayerId: playerId,
          scorerName,
        }),
        // A newer state for the server (MATCH-02a), like every other change.
        updatedAt: new Date().toISOString(),
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
          scorerName,
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

    const assistName = storedPlayerName(playerId);

    setLiveMatch((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        events: updateGoalEventContributors(previous.events, current.localEventId, {
          assistPlayerId: playerId,
          assistName,
        }),
        updatedAt: new Date().toISOString(),
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

    if (delta > 0 && localGoalEvent) {
      // MATCH-12: the sheet opens now, whatever the network does. The goal
      // reaches the server with the runtime state (MATCH-02a).
      if (reportEnabled) {
        queueGoalPrompt(localGoalEvent.id, minute);
      }

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
  };

  // UI-LIVE-03: every state screen uses the full-screen canvas of Live.
  if (!isHydrated) {
    return <LiveStateScreen loading label={common("loading")} />;
  }

  // A restored match stays on screen while the team list reloads or fails
  // (offline, deferred session): the match never waits for the network.
  if (workspace.isLoading && !liveMatch) {
    return <LiveStateScreen loading label={common("loading")} />;
  }

  if (workspace.error && !liveMatch) {
    return (
      <LiveStateScreen
        icon={ShieldAlert}
        title={t("loadErrorTitle")}
        error={workspace.error}
        actions={
          <ButtonLink href={APP_HOME_PATH} variant="secondary" block>
            {t("actions.toHome")}
          </ButtonLink>
        }
      />
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
    const recoveryTitle = activeMatch?.title || recoveryMatch?.title || t("recovery.title");

    return showRecovery ? (
      <>
        <LiveStateScreen
          icon={Play}
          title={t("recovery.title")}
          body={t("recovery.description")}
          error={error}
          testId="live-recovery"
          actions={
            <>
              {recoveryContinueHref ? (
                <ButtonLink href={recoveryContinueHref} variant="primary" block>
                  {t("recovery.continue")}
                </ButtonLink>
              ) : null}
              {/* MATCH-03: never on one tap; destructive only inside its
                  confirmation (DESIGN.md §5.7). */}
              <Button
                block
                disabled={isResolvingRecoveryAction}
                onClick={() => recoveryConfirm.request("end", recoveryTitle)}
              >
                {t("recovery.end")}
              </Button>
              <Button
                variant="ghost"
                block
                disabled={isResolvingRecoveryAction}
                onClick={() => recoveryConfirm.request("discard", recoveryTitle)}
              >
                {t("recovery.discard")}
              </Button>
            </>
          }
        />
        <ActiveMatchCloseConfirm state={recoveryConfirm} />
      </>
    ) : (
      <LiveStateScreen
        icon={Play}
        title={t("empty")}
        body={t("emptyDescription")}
        actions={
          <ButtonLink href="/match/setup" variant="primary" block>
            {t("actions.toSetup")}
          </ButtonLink>
        }
      />
    );
  }

  // OFF-01a notice band (DESIGN.md §5.6): one message at a time by severity
  // (error > warning > info), shown by the band only where it covers no
  // token. A condition that lasts also keeps speaking from the scoreboard
  // meta line and the menu, also after the band is dismissed or when it does
  // not fit. Once the match has ended, the ended notice says whether the
  // result was saved.
  const isLiveMatchOver = liveMatch.status === "ended";
  const showSaveFailed = !isLiveMatchOver && liveMatchSaveFailed;
  const workspaceWarning = !isLiveMatchOver && workspace.error ? workspace.error : null;
  const bandItems: LiveBandItem[] = [];

  if (showSaveFailed && !storageBandDismissed) {
    bandItems.push({
      key: "storageError",
      tone: "error",
      announcement: tRestore("storageError.title"),
      render: () => <StorageErrorNotice onDismiss={() => setStorageBandDismissed(true)} />,
    });
  }

  if (workspaceWarning && workspaceWarning !== dismissedWorkspaceError) {
    bandItems.push({
      key: "workspaceError",
      tone: "warning",
      announcement: tRestore("workspaceError.title"),
      render: () => <WorkspaceErrorNotice onDismiss={() => setDismissedWorkspaceError(workspaceWarning)} />,
    });
  }

  if (!isLiveMatchOver && closedGapMinutes !== null) {
    const minutes = closedGapMinutes;
    bandItems.push({
      key: "restoredMatch",
      tone: "info",
      announcement: tRestore("closedGap", { minutes }),
      render: () => <RestoredMatchNotice minutes={minutes} onDismiss={() => setClosedGapMinutes(null)} />,
    });
  }

  const menuNotes: LiveMenuNote[] = [];
  if (workspaceWarning) {
    menuNotes.push({
      key: "workspaceError",
      tone: "warning",
      text: `${tRestore("workspaceError.title")} ${tRestore("workspaceError.body")}`,
    });
  }
  if (sessionClosedGap && sessionClosedGap.matchId === liveMatch.id) {
    menuNotes.push({
      key: "restoredMatch",
      tone: "info",
      text: tRestore("closedGap", { minutes: sessionClosedGap.minutes }),
    });
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
          inStoppage,
          playersById,
          getShortName,
          suggestion,
          interaction: subInteraction.state,
        })}
        isOnline={isOnline}
        saveFailed={showSaveFailed}
        menuNotes={menuNotes}
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
          band: bandItems,
        }}
        ending={isEndingMatch ? { done: endMatchDone } : null}
        // FEAT-SHARE-01: the same link and choices as setup, also before the first ▶.
        sharePanel={
          auth.status === "authenticated" && userId && activeMatchId ? (
            <LiveSharePanel matchId={activeMatchId} teamId={liveMatch.teamId} ownerUserId={userId} />
          ) : null
        }
        handlers={{
          onStart: handleStart,
          onPause: handlePause,
          onResume: handleResume,
          onEndHalf: handleEndHalf,
          // LiveScreen confirms in its own sheet (UI-A11Y-02).
          onEndMatch: endMatchNow,
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
        href={APP_HOME_PATH}
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
        {error ? <AppCard className="p-3 text-xs text-fp-danger-text">{error}</AppCard> : null}

        {bandItems.length > 0 ? (
          <div className="grid gap-2" data-testid="live-notice-band">
            {pickLiveBandItem(bandItems)?.render()}
          </div>
        ) : null}

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
                <p className="text-sm font-semibold text-fp-danger-text">{t("pendingSync.notSavedTitle")}</p>
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
                <p className="text-sm font-semibold text-fp-danger-text">{t("endedLocally.title")}</p>
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
          <AppCard className="space-y-4 p-4">
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
                    className="tap-target flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-fp-control-line text-fp-ink transition-colors active:bg-fp-surface-2 disabled:opacity-40"
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
                    ↻ {getShortName(suggestion.outgoingPlayerId)}{" "}
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
                  className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-fp-rule bg-fp-surface-2 text-[10px] font-bold text-foreground"
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
            <AppCard className="space-y-3 border-fp-danger/30 bg-fp-danger/5 p-4">
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
        <div className="fixed inset-0 z-40 flex items-end bg-fp-scrim p-3">
          <AppCard className="w-full space-y-3 p-4">
            <div className="h-0.5 w-full overflow-hidden rounded-full bg-fp-border">
              <motion.div
                key={`${promptQueue[0].localEventId}-${promptQueue[0].step}`}
                className="h-full bg-fp-lime"
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
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-fp-canvas"
          >
            {endMatchDone ? (
              <motion.div
                key="done"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-3 text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-fp-surface-2 text-fp-ok-text">
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
