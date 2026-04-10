"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import type { Player } from "@/domain/team";
import {
  createLiveMatchFromSetup,
  endLiveMatch,
  formatClock,
  formatPlaytime,
  getRemainingSeconds,
  pauseLiveMatch,
  resumeLiveMatch,
  startLiveMatch,
  substitutePlayers,
  tickLiveMatch,
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
import { variants } from "@/lib/tokens";

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
  const workspace = useTeamWorkspace();
  const { refreshActiveMatch } = useActiveMatch();
  const activeMatchId = searchParams.get("matchId");

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
  }, [isHydrated, workspace.isLoading, workspace.teams]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isHydrated || !liveMatch) {
      return;
    }

    saveStoredLiveMatch(liveMatch);
  }, [liveMatch, isHydrated]);

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

  useEffect(() => {
    if (!isHydrated || liveMatch?.status !== "running") {
      return;
    }

    const id = window.setInterval(() => {
      setLiveMatch((previous) =>
        previous ? tickLiveMatch(previous, Date.now()) : previous
      );
    }, 1000);

    return () => window.clearInterval(id);
  }, [isHydrated, liveMatch?.status]);

  const playersById = useMemo(() => mapPlayersById(teamPlayers), [teamPlayers]);

  const onFieldPlayers = useMemo(
    () => (liveMatch ? resolvePlayers(liveMatch.onFieldPlayerIds, playersById) : []),
    [liveMatch, playersById]
  );

  const benchPlayers = useMemo(
    () => (liveMatch ? resolvePlayers(liveMatch.benchPlayerIds, playersById) : []),
    [liveMatch, playersById]
  );

  const remainingClock = liveMatch ? formatClock(getRemainingSeconds(liveMatch)) : "00:00";
  const elapsedClock = liveMatch ? formatClock(liveMatch.elapsedSeconds) : "00:00";

  const selectedPlayersReady = Boolean(selectedFieldId && selectedBenchId);
  const suggestion = liveMatch ? getSubstitutionSuggestion(liveMatch) : null;
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

    return formatPlaytime(liveMatch.playerAccumulatedSeconds[playerId] ?? 0);
  };

  const clearSelection = () => {
    setSelectedFieldId(null);
    setSelectedBenchId(null);
  };

  const handleStart = () => {
    setLiveMatch((previous) =>
      previous ? startLiveMatch(previous, Date.now()) : previous
    );
  };

  const handlePause = () => {
    setLiveMatch((previous) =>
      previous ? pauseLiveMatch(previous, Date.now()) : previous
    );
  };

  const handleResume = () => {
    setLiveMatch((previous) =>
      previous ? resumeLiveMatch(previous, Date.now()) : previous
    );
  };

  const handleEnd = () => {
    if (!window.confirm(t("actions.confirmEnd"))) {
      return;
    }

    const storedSetup = getStoredMatchSetup();

    setLiveMatch((previous) =>
      previous ? endLiveMatch(previous, Date.now()) : previous
    );

    if (storedSetup) {
      endMatch(storedSetup.config);
      setSetupStatus("ended");
    }

    if (activeMatchId) {
      void fetch(`/api/matches/${encodeURIComponent(activeMatchId)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "completed" }),
      }).finally(() => {
        void refreshActiveMatch();
      });
    } else {
      void refreshActiveMatch();
    }

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

  const handleTeamScore = (delta: number) => {
    setLiveMatch((previous) =>
      previous ? updateScore(previous, "team", delta) : previous
    );
  };

  const handleOpponentScore = (delta: number) => {
    setLiveMatch((previous) =>
      previous ? updateScore(previous, "opponent", delta) : previous
    );
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
    return (
      <PageShell>
        <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />
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
            timerLabel={t("timer.remaining")}
            durationLabel={t("timer.duration", {
              duration: Math.floor(liveMatch.durationSeconds / 60),
            })}
            remainingClock={remainingClock}
            elapsedClock={t("timer.elapsed", { elapsed: elapsedClock })}
            onStart={handleStart}
            onPause={handlePause}
            onResume={handleResume}
            onEnd={handleEnd}
            startLabel={t("actions.start")}
            pauseLabel={t("actions.pause")}
            resumeLabel={t("actions.resume")}
            endLabel={t("actions.end")}
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
    </PageShell>
  );
}
