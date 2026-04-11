"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, Play } from "lucide-react";
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
  resumeLiveMatch,
  startLiveMatch,
  substitutePlayers,
  reconcileLiveMatchWithSquad,
  updateScore,
  type LiveMatchState,
} from "@/domain/liveMatch";
import { getSubstitutionSuggestion } from "@/domain/substitutionSuggestion";
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
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { MatchTimerPanel } from "@/components/match/MatchTimerPanel";
import { LivePlayerSection } from "@/components/match/LivePlayerSection";
import { useMatchClock } from "@/components/match/useMatchClock";
import { variants } from "@/lib/tokens";

interface PromptPlayerOption {
  id: string;
  name: string;
}

interface GoalPromptState {
  eventId: string;
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
    forceCloseActiveMatch,
    discardActiveMatch,
    refreshActiveMatch,
  } = useActiveMatch();
  const activeMatchId = searchParams.get("matchId") ?? activeMatch?.id ?? null;

  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [liveMatch, setLiveMatch] = useState<LiveMatchState | null>(null);
  const [setupStatus, setSetupStatus] = useState<MatchStatus | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedBenchId, setSelectedBenchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportEnabled, setReportEnabled] = useState(false);
  const [promptQueue, setPromptQueue] = useState<GoalPromptState[]>([]);
  const [isResolvingRecoveryAction, setIsResolvingRecoveryAction] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isHydrated || workspace.isLoading) {
      return;
    }

    const storedSetup = getStoredMatchSetup();
    const storedLiveMatch = getStoredLiveMatch();

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
      return;
    }

    if (storedSetup.status === "active") {
      setLiveMatch(createLiveMatchFromSetup(storedSetup.config));
      setSetupStatus(storedSetup.status);
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

    saveStoredLiveMatch(liveMatch);
  }, [liveMatch, isHydrated]);

  useEffect(() => {
    if (!isHydrated || auth.status !== "authenticated" || !activeMatchId || !liveMatch) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void fetch(`/api/matches/${encodeURIComponent(activeMatchId)}`, {
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
      const response = await fetch(`/api/matches/${encodeURIComponent(activeMatchId)}`, {
        method: "GET",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        match?: { reportEnabled?: boolean };
      };

      setReportEnabled(payload.match?.reportEnabled === true);
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
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [promptQueue]);

  useEffect(() => {
    if (!isHydrated || auth.status !== "authenticated" || !activeMatchId || liveMatch) {
      return;
    }

    void (async () => {
      const response = await fetch(`/api/matches/${encodeURIComponent(activeMatchId)}`, {
        method: "GET",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        match?: { runtimeState?: LiveMatchState | null };
      };

      const runtimeState = payload.match?.runtimeState;

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

  const onFieldPlayers = useMemo(
    () => (liveMatch ? resolvePlayers(liveMatch.onFieldPlayerIds, playersById) : []),
    [liveMatch, playersById]
  );

  const benchPlayers = useMemo(
    () => (liveMatch ? resolvePlayers(liveMatch.benchPlayerIds, playersById) : []),
    [liveMatch, playersById]
  );

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

  const selectedPlayersReady = Boolean(selectedFieldId && selectedBenchId);
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

  const clearSelection = () => {
    setSelectedFieldId(null);
    setSelectedBenchId(null);
  };

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
    setLiveMatch((previous) =>
      previous ? endCurrentHalf(previous, Date.now()) : previous
    );
  };

  const handleEnd = () => {
    if (!window.confirm(t("actions.confirmEnd"))) {
      return;
    }

    setError(null);

    const storedSetup = getStoredMatchSetup();

    setLiveMatch((previous) =>
      previous ? endLiveMatch(previous, Date.now()) : previous
    );

    if (storedSetup) {
      endMatch(storedSetup.config);
      setSetupStatus("ended");
    }

    void (async () => {
      if (activeMatchId) {
        const response = await fetch(`/api/matches/${encodeURIComponent(activeMatchId)}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            status: "completed",
            scoreFor: liveMatch?.teamScore ?? 0,
            scoreAgainst: liveMatch?.opponentScore ?? 0,
            reportEnabled,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json()) as { message?: string };
          setError(payload.message ?? t("errors.endFailed"));
          return;
        }
      }

      await refreshActiveMatch();
    })();

    clearSelection();
  };

  const handleSubstitute = () => {
    if (!selectedFieldId || !selectedBenchId) {
      return;
    }

    setLiveMatch((previous) =>
      previous
        ? substitutePlayers(previous, selectedFieldId, selectedBenchId, Date.now())
        : previous
    );

    clearSelection();
  };

  const handleApplySuggestion = () => {
    if (!suggestion) {
      return;
    }

    setLiveMatch((previous) =>
      previous
        ? substitutePlayers(
            previous,
            suggestion.outgoingPlayerId,
            suggestion.incomingPlayerId,
            Date.now()
          )
        : previous
    );

    clearSelection();
  };

  const handleResetView = () => {
    clearStoredLiveMatch();
    router.push("/match/setup");
  };

  const createGoalEvent = async (
    type: "goal_for" | "goal_against",
    minute: number | null
  ) => {
    if (!activeMatchId || auth.status !== "authenticated") {
      return null;
    }

    const response = await fetch(`/api/matches/${encodeURIComponent(activeMatchId)}/events`, {
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

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      event?: { id: string };
    };

    return payload.event?.id ?? null;
  };

  const patchGoalEvent = async (eventId: string, data: Record<string, unknown>) => {
    if (!activeMatchId || auth.status !== "authenticated") {
      return;
    }

    await fetch(`/api/matches/${encodeURIComponent(activeMatchId)}/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(data),
    });
  };

  const queueGoalPrompt = (eventId: string, minute: number | null) => {
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

    void patchGoalEvent(current.eventId, {
      primaryPlayerId: playerId,
      payload: {
        primaryPlayerName: player?.name ?? null,
      },
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

    void patchGoalEvent(current.eventId, {
      secondaryPlayerId: playerId,
      payload: {
        primaryPlayerName: current.scorerName,
        secondaryPlayerName: player?.name ?? null,
      },
    });

    setPromptQueue((previous) => previous.slice(1));
  };

  const handleTeamScore = (delta: number) => {
    setLiveMatch((previous) =>
      previous ? updateScore(previous, "team", delta) : previous
    );

    if (delta > 0) {
      const minute = liveMatch ? Math.floor(elapsedSeconds / 60) : null;
      void (async () => {
        const eventId = await createGoalEvent("goal_for", minute);

        if (!eventId || !reportEnabled) {
          return;
        }

        queueGoalPrompt(eventId, minute);
      })();
    }
  };

  const handleOpponentScore = (delta: number) => {
    setLiveMatch((previous) =>
      previous ? updateScore(previous, "opponent", delta) : previous
    );

    if (delta > 0) {
      const minute = liveMatch ? Math.floor(elapsedSeconds / 60) : null;
      void createGoalEvent("goal_against", minute);
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

    return (
      <PageShell>
        <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />
        {showRecovery ? (
          <AppCard className="space-y-3 p-4">
            <p className="text-base font-semibold text-foreground">{t("recovery.title")}</p>
            <p className="text-xs text-muted-foreground">{t("recovery.description")}</p>
            <div className="grid gap-2">
              <Link href={activeMatchHref}>
                <FpButton variant="primary" size="md" fullWidth>
                  {t("recovery.continue")}
                </FpButton>
              </Link>
              <FpButton
                variant="secondary"
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
                variant="ghost"
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

  return (
    <PageShell className="space-y-4 pb-6">
      <SectionHeader
        title={t("title")}
        subtitle={t("subtitle")}
        accent
        action={
          <Link href="/match/setup">
            <FpButton variant="ghost" size="sm" className="tap-target">
              {common("back")}
            </FpButton>
          </Link>
        }
      />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={variants.staggerContainer}
        className="space-y-4"
      >
        {error ? <AppCard className="p-3 text-xs text-danger">{error}</AppCard> : null}
        <motion.div variants={variants.fadeInUp}>
          <AppCard className="space-y-3 p-4">
            <p className="text-sm font-semibold text-foreground">{t("score.title")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-fp-border bg-fp-surface-2 p-3 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("score.team")}
                </p>
                <p className="mt-1 text-2xl font-bold text-foreground">{liveMatch.teamScore}</p>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    className="tap-target rounded-lg border border-fp-border bg-background px-2 py-1 text-sm"
                    onClick={() => handleTeamScore(-1)}
                  >
                    -
                  </button>
                  <button
                    type="button"
                    className="tap-target rounded-lg border border-fp-border bg-background px-2 py-1 text-sm"
                    onClick={() => handleTeamScore(1)}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-fp-border bg-fp-surface-2 p-3 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("score.opponent")}
                </p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {liveMatch.opponentScore}
                </p>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    className="tap-target rounded-lg border border-fp-border bg-background px-2 py-1 text-sm"
                    onClick={() => handleOpponentScore(-1)}
                  >
                    -
                  </button>
                  <button
                    type="button"
                    className="tap-target rounded-lg border border-fp-border bg-background px-2 py-1 text-sm"
                    onClick={() => handleOpponentScore(1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </AppCard>
        </motion.div>

        <motion.div variants={variants.fadeInUp}>
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
        </motion.div>

        <motion.div variants={variants.fadeInUp} className="space-y-4">
          <LivePlayerSection
            title={t("field.title")}
            description={t("field.description")}
            players={onFieldPlayers}
            selectedPlayerId={selectedFieldId}
            suggestedPlayerId={suggestion?.outgoingPlayerId}
            selectedLabel={t("selection.selected")}
            suggestedLabel={t("selection.suggestedOut")}
            emptyText={t("field.empty")}
            playtimeLabel={t("player.playtime")}
            getPlaytime={getPlayerPlaytime}
            onSelectPlayer={(playerId) =>
              setSelectedFieldId((previous) =>
                previous === playerId ? null : playerId
              )
            }
          />

          <LivePlayerSection
            title={t("bench.title")}
            description={t("bench.description")}
            players={benchPlayers}
            selectedPlayerId={selectedBenchId}
            suggestedPlayerId={suggestion?.incomingPlayerId}
            selectedLabel={t("selection.selected")}
            suggestedLabel={t("selection.suggestedIn")}
            emptyText={t("bench.empty")}
            playtimeLabel={t("player.playtime")}
            getPlaytime={getPlayerPlaytime}
            onSelectPlayer={(playerId) =>
              setSelectedBenchId((previous) =>
                previous === playerId ? null : playerId
              )
            }
          />
        </motion.div>

        <motion.div variants={variants.fadeInUp}>
          <AppCard glow="accent" className="space-y-3 border-fp-accent/25 p-4">
            <p className="text-sm font-semibold text-foreground">{t("suggestion.title")}</p>
            {suggestion && suggestedOutgoingPlayer && suggestedIncomingPlayer ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {t("suggestion.reason", {
                    outgoing: suggestedOutgoingPlayer.name,
                    outgoingTime: formatPlaytime(suggestion.outgoingSeconds),
                    incoming: suggestedIncomingPlayer.name,
                    incomingTime: formatPlaytime(suggestion.incomingSeconds),
                  })}
                </p>
                <FpButton
                  variant="secondary"
                  size="md"
                  fullWidth
                  className="tap-target border-fp-accent/30"
                  onClick={handleApplySuggestion}
                  disabled={liveMatch.status === "ended"}
                >
                  {t("suggestion.accept")}
                </FpButton>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{t("suggestion.unavailable")}</p>
            )}
          </AppCard>
        </motion.div>

        <motion.div variants={variants.fadeInUp}>
          <AppCard className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ArrowLeftRight size={16} className="text-primary" />
              {t("substitution.manualTitle")}
            </div>

            <p className="text-xs text-muted-foreground">{t("substitution.hint")}</p>

            <FpButton
              variant="primary"
              size="lg"
              fullWidth
              className="tap-target"
              onClick={handleSubstitute}
              disabled={!selectedPlayersReady || liveMatch.status === "ended"}
            >
              {t("substitution.action")}
            </FpButton>

            {(selectedFieldId || selectedBenchId) && (
              <FpButton
                variant="ghost"
                size="md"
                fullWidth
                className="tap-target"
                onClick={clearSelection}
              >
                {t("selection.clear")}
              </FpButton>
            )}
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
            <p className="text-base font-semibold text-foreground">
              {promptQueue[0].step === "scorer" ? t("prompt.scorerTitle") : t("prompt.assistTitle")}
            </p>
            <div className="grid grid-cols-1 gap-2">
              {promptQueue[0].options.map((option) => (
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
    </PageShell>
  );
}
