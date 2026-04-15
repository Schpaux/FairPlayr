"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Minus, Plus, ArrowRightLeft } from "lucide-react";
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
  moveBenchPlayerToSlot,
  pauseLiveMatch,
  reconcileLiveMatchWithSquad,
  removePlayerFromField,
  repositionLivePlayers,
  resumeLiveMatch,
  startLiveMatch,
  substitutePlayers,
  updateScore,
  type LiveMatchState,
} from "@/domain/liveMatch";
import { getSubstitutionSuggestion } from "@/domain/substitutionSuggestion";
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
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { MatchTimerPanel } from "@/components/match/MatchTimerPanel";
import { LivePitchLineupEditor } from "@/components/match/LivePitchLineupEditor";
import { useMatchClock } from "@/components/match/useMatchClock";
import { variants } from "@/lib/tokens";

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
  const [error, setError] = useState<string | null>(null);
  const [reportEnabled, setReportEnabled] = useState(false);
  const [promptQueue, setPromptQueue] = useState<GoalPromptState[]>([]);
  const [isResolvingRecoveryAction, setIsResolvingRecoveryAction] = useState(false);
  const [isEndingMatch, setIsEndingMatch] = useState(false);
  const [endMatchDone, setEndMatchDone] = useState(false);
  const endedMatchIdRef = useRef<string | null>(null);

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
    }, 10000);

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
    setLiveMatch((previous) =>
      previous ? endCurrentHalf(previous, Date.now()) : previous
    );
  };

  const handleEnd = () => {
    if (!window.confirm(t("actions.confirmEnd"))) {
      return;
    }

    setError(null);
    setIsEndingMatch(true);

    const storedSetup = getStoredMatchSetup();
    const finalTeamScore = liveMatch?.teamScore ?? 0;
    const finalOpponentScore = liveMatch?.opponentScore ?? 0;
    const matchIdToEnd = activeMatchId;

    setLiveMatch((previous) =>
      previous ? endLiveMatch(previous, Date.now()) : previous
    );

    if (storedSetup) {
      endMatch(storedSetup.config);
      setSetupStatus("ended");
    }

    void (async () => {
      if (matchIdToEnd) {
        const response = await fetch(`/api/matches/${encodeURIComponent(matchIdToEnd)}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            status: "completed",
            scoreFor: finalTeamScore,
            scoreAgainst: finalOpponentScore,
            reportEnabled,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json()) as { message?: string };
          setError(payload.message ?? t("errors.endFailed"));
          setIsEndingMatch(false);
          return;
        }
      }

      await refreshActiveMatch();
      setEndMatchDone(true);
      endedMatchIdRef.current = matchIdToEnd;

      // Brief pause so user sees the "Done!" state, then navigate to report
      window.setTimeout(() => {
        if (matchIdToEnd) {
          router.push(`/match/${encodeURIComponent(matchIdToEnd)}`);
        } else {
          router.push("/historikk");
        }
      }, 1200);
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

  // ─── Pitch lineup handlers ─────────────────────────────────────────────────

  const handlePitchBenchToSlot = (
    benchPlayerId: string,
    slotId: string,
    displacedPlayerId: string | null
  ) => {
    if (!liveMatch || liveMatch.status === "ended") return;

    const inPlayer = playersById.get(benchPlayerId);
    const outPlayer = displacedPlayerId ? playersById.get(displacedPlayerId) : null;
    const minute = Math.floor(elapsedSeconds / 60);
    const timestampMs = elapsedSeconds * 1000;
    const nowMs = Date.now();

    setLiveMatch((prev) => {
      if (!prev) return prev;
      const next = moveBenchPlayerToSlot(prev, slotId, benchPlayerId, nowMs);
      // Only create a substitution event when a player was actually displaced
      if (!displacedPlayerId) return next;
      return {
        ...next,
        events: [
          ...next.events,
          createSubstitutionEvent({
            minute,
            timestampMs,
            inPlayerId: benchPlayerId,
            inPlayerName: inPlayer?.name ?? null,
            outPlayerId: displacedPlayerId,
            outPlayerName: outPlayer?.name ?? null,
          }),
        ],
      };
    });
  };

  const handlePitchSlotToSlot = (slotAId: string, slotBId: string) => {
    if (!liveMatch || liveMatch.status === "ended") return;
    // Pure reposition — no substitution event
    setLiveMatch((prev) => (prev ? repositionLivePlayers(prev, slotAId, slotBId) : prev));
  };

  const handlePitchSlotToBench = (playerId: string, slotId: string) => {
    if (!liveMatch || liveMatch.status === "ended") return;
    setLiveMatch((prev) =>
      prev ? removePlayerFromField(prev, slotId, Date.now()) : prev
    );
  };

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
          <AppCard className="p-3">
            {/* Compact 3-column score row */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              {/* Team side */}
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("score.team")}
                </p>
                <p className="text-4xl font-black tabular-nums text-foreground leading-none">
                  {liveMatch.teamScore}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={t("score.decreaseTeam")}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-fp-border bg-fp-surface-2 transition-colors active:bg-fp-surface disabled:opacity-40"
                    onClick={() => handleTeamScore(-1)}
                    disabled={liveMatch.teamScore === 0 || liveMatch.status === "ended"}
                  >
                    <Minus size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("score.increaseTeam")}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-fp-cta/40 bg-fp-cta/15 text-fp-cta transition-colors active:bg-fp-cta/25 disabled:opacity-40"
                    onClick={() => handleTeamScore(1)}
                    disabled={liveMatch.status === "ended"}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* Center divider */}
              <p className="text-2xl font-black leading-none text-muted-foreground/30">:</p>

              {/* Opponent side */}
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("score.opponent")}
                </p>
                <p className="text-4xl font-black tabular-nums text-foreground leading-none">
                  {liveMatch.opponentScore}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={t("score.decreaseOpponent")}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-fp-border bg-fp-surface-2 transition-colors active:bg-fp-surface disabled:opacity-40"
                    onClick={() => handleOpponentScore(-1)}
                    disabled={liveMatch.opponentScore === 0 || liveMatch.status === "ended"}
                  >
                    <Minus size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("score.increaseOpponent")}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-fp-border bg-fp-surface-2 transition-colors active:bg-fp-surface disabled:opacity-40"
                    onClick={() => handleOpponentScore(1)}
                    disabled={liveMatch.status === "ended"}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Compact event strip */}
            {liveEvents.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-fp-border pt-2">
                {liveEvents.slice(-8).map((ev) => (
                  <span key={ev.id} className="text-[10px] tabular-nums text-muted-foreground">
                    {ev.minute !== null ? `${ev.minute}'` : ""}
                    {ev.type === "goal" ? " ⚽" : " ↕"}
                    {ev.type === "goal" && ev.scorerName ? ` ${ev.scorerName}` : ""}
                    {ev.type === "substitution" && ev.inPlayerName ? ` ${ev.inPlayerName}` : ""}
                  </span>
                ))}
              </div>
            )}
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

        <motion.div variants={variants.fadeInUp}>
          <AppCard className="p-3">
            <p className="mb-3 text-sm font-semibold text-foreground">
              {t("field.title")}
            </p>
            <LivePitchLineupEditor
              format={liveMatch.format}
              formationId={liveMatch.formationId}
              liveSlotAssignments={liveMatch.liveSlotAssignments}
              onFieldPlayerIds={liveMatch.onFieldPlayerIds}
              benchPlayerIds={liveMatch.benchPlayerIds}
              players={teamPlayers}
              disabled={liveMatch.status === "ended"}
              getPlayerSubtitle={getPlayerPlaytime}
              onBenchToSlot={handlePitchBenchToSlot}
              onSlotToSlot={handlePitchSlotToSlot}
              onSlotToBench={handlePitchSlotToBench}
            />
          </AppCard>
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
