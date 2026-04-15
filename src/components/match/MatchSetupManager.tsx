"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { ShieldAlert, Users, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  createMatchSetupWithPrefs,
  setMatchFormat,
  setMatchDuration,
  setMatchHalves,
  setMatchDurationPreset,
  setReportEnabled,
  setSelectedSquad,
  toggleSquadPlayer,
  selectAllSquad,
  autoFillLineup,
  getFormationPresets,
  setMatchFormation,
  getStarterDeficit,
  canStartMatch,
  reconcileWithTeam,
} from "@/domain/match";
import type { MatchConfig } from "@/domain/match";
import {
  getStoredMatchSetup,
  saveMatchSetupDraft,
  activateMatch,
} from "@/lib/storage/matchStorage";
import { createLiveMatchFromSetup } from "@/domain/liveMatch";
import { clearStoredLiveMatch, saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import { getTeamMatchPrefs, saveTeamMatchPrefs } from "@/lib/storage/teamPrefsStorage";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { Link } from "@/i18n/navigation";
import { FormatSelector } from "@/components/match/FormatSelector";
import { DurationPicker } from "@/components/match/DurationPicker";
import { FormationSelector } from "@/components/match/FormationSelector";
import { SquadSelector } from "@/components/match/SquadSelector";
import { PitchLineupEditor } from "@/components/match/PitchLineupEditor";
import { variants } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";

// ─── Section wrapper ──────────────────────────────────────────────────────────

function SetupSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={variants.fadeInUp}>
      <AppCard className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {children}
      </AppCard>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MatchSetupManager() {
  const t = useTranslations("matchSetup");
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useTeamWorkspace();
  const {
    activeMatch,
    activeMatchHref,
    hasActiveConflict,
    forceCloseActiveMatch,
    discardActiveMatch,
  } = useActiveMatch();
  const matchId = searchParams.get("matchId");

  // ── Hydration guard ────────────────────────────────────────────────────────
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // ── State ──────────────────────────────────────────────────────────────────
  const [setup, setSetup] = useState<MatchConfig | null>(null);

  const team = workspace.activeTeam;

  useEffect(() => {
    if (!isHydrated || workspace.isLoading) return;
    if (!team) {
      setSetup(null);
      return;
    }

    const teamPlayerIds = team.players.map((p) => p.id);
    const stored = getStoredMatchSetup();

    if (stored && stored.config.teamId === team.id) {
      // Existing draft — reconcile with current team roster, keep selected squad
      const reconciled = reconcileWithTeam(stored.config, teamPlayerIds);
      setSetup(reconciled);
      return;
    }

    // New setup — pre-fill with team preferences (DEL 3), squad starts empty (DEL 5+6)
    const prefs = getTeamMatchPrefs(team.id);
    setSetup(createMatchSetupWithPrefs(team.id, prefs));
  }, [isHydrated, team, workspace.isLoading]);

  // ── Persist draft on every change ─────────────────────────────────────────
  useEffect(() => {
    if (!isHydrated || !setup) return;
    saveMatchSetupDraft(setup);
  }, [setup, isHydrated]);

  // ── Persist team preferences when coach changes format/formation/duration ──
  useEffect(() => {
    if (!setup || !team) return;
    saveTeamMatchPrefs(team.id, {
      format: setup.format,
      formationId: setup.formationId,
      durationPresetId: setup.duration.mode === "preset" && setup.duration.presetId
        ? setup.duration.presetId
        : undefined,
    });
  }, [setup?.format, setup?.formationId, setup?.duration.presetId, team?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleFormatChange: React.ComponentProps<
    typeof FormatSelector
  >["onChange"] = (format) => {
    setSetup((prev) => (prev ? setMatchFormat(prev, format) : prev));
  };

  const handleDurationChange: React.ComponentProps<
    typeof DurationPicker
  >["onCustomChange"] = (minutes) => {
    setSetup((prev) => (prev ? setMatchDuration(prev, minutes) : prev));
  };

  const handleDurationPresetChange: React.ComponentProps<
    typeof DurationPicker
  >["onPresetChange"] = (presetId) => {
    setSetup((prev) => (prev ? setMatchDurationPreset(prev, presetId) : prev));
  };

  const handleHalvesChange: React.ComponentProps<
    typeof DurationPicker
  >["onHalvesChange"] = (halves) => {
    setSetup((prev) => (prev ? setMatchHalves(prev, halves) : prev));
  };

  const handleFormationChange: React.ComponentProps<
    typeof FormationSelector
  >["onChange"] = (formationId) => {
    setSetup((prev) => (prev ? setMatchFormation(prev, formationId) : prev));
  };

  const handleReportToggle = (enabled: boolean) => {
    setSetup((prev) => (prev ? setReportEnabled(prev, enabled) : prev));
  };

  const handleToggleSquadPlayer = (playerId: string) => {
    setSetup((prev) => (prev ? toggleSquadPlayer(prev, playerId) : prev));
  };

  const handleSelectAllSquad = () => {
    if (!team) return;
    setSetup((prev) =>
      prev ? selectAllSquad(prev, team.players.map((p) => p.id)) : prev
    );
  };

  const handleClearSquad = () => {
    setSetup((prev) => (prev ? setSelectedSquad(prev, []) : prev));
  };

  // ── Start match ────────────────────────────────────────────────────────────
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [showStartGuard, setShowStartGuard] = useState(false);
  const [isResolvingGuardAction, setIsResolvingGuardAction] = useState(false);

  const handleStartMatch = async () => {
    if (!setup || !canStartMatch(setup)) return;

    if (hasActiveConflict(matchId)) {
      setShowStartGuard(true);
      return;
    }

    setStartError(null);
    setIsStarting(true);

    clearStoredLiveMatch();
    const liveState = createLiveMatchFromSetup(setup);
    saveStoredLiveMatch(liveState);
    activateMatch(setup);

    try {
      if (matchId) {
        const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: "live",
            reportEnabled: setup.reportEnabled,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json()) as { message?: string };
          throw new Error(payload.message ?? t("errors.startFailed"));
        }

        router.push(`/match/live?matchId=${encodeURIComponent(matchId)}`);
        return;
      }

      router.push("/match/live");
    } catch (cause) {
      setStartError(
        cause instanceof Error ? cause.message : t("errors.startFailed")
      );
      setIsStarting(false);
      return;
    }

    setIsStarting(false);
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const deficit = setup ? getStarterDeficit(setup) : 0;
  const matchReady = setup ? canStartMatch(setup) : false;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (!isHydrated) {
    return (
      <PageShell>
        <AppCard className="p-6 text-sm text-muted-foreground animate-pulse">&nbsp;</AppCard>
      </PageShell>
    );
  }

  if (workspace.isLoading) {
    return (
      <PageShell>
        <AppCard className="p-6 text-sm text-muted-foreground animate-pulse">&nbsp;</AppCard>
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

  if (!team) {
    return (
      <PageShell>
        <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />
        <EmptyState
          icon={ShieldAlert}
          title={t("noTeam.title")}
          description={t("noTeam.description")}
          action={
            <Link href="/team">
              <FpButton variant="primary" size="md">{t("noTeam.action")}</FpButton>
            </Link>
          }
        />
      </PageShell>
    );
  }

  if (team.players.length === 0) {
    return (
      <PageShell>
        <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />
        <EmptyState
          icon={Users}
          title={t("noPlayers.title")}
          description={t("noPlayers.description")}
          action={
            <Link href="/team">
              <FpButton variant="primary" size="md">{t("noPlayers.action")}</FpButton>
            </Link>
          }
        />
      </PageShell>
    );
  }

  if (!setup) return null;

  return (
    <PageShell className="space-y-4">
      <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={variants.staggerContainer}
        className="space-y-4"
      >
        <motion.div variants={variants.fadeInUp}>
          <AppCard className="p-3 text-xs text-muted-foreground">
            {t("activeTeam", { name: team.name })}
          </AppCard>
        </motion.div>

        {/* Format */}
        <SetupSection label={t("sections.format")}>
          <FormatSelector value={setup.format} onChange={handleFormatChange} />
        </SetupSection>

        {/* Formation */}
        <SetupSection label={t("sections.formation")}>
          <FormationSelector
            formations={getFormationPresets(setup.format)}
            value={setup.formationId}
            onChange={handleFormationChange}
          />
        </SetupSection>

        {/* Duration */}
        <SetupSection label={t("sections.duration")}>
          <DurationPicker
            value={setup.duration}
            onPresetChange={handleDurationPresetChange}
            onCustomChange={handleDurationChange}
            onHalvesChange={handleHalvesChange}
          />
        </SetupSection>

        {/* Squad — who is playing today? (DEL 5) */}
        <SetupSection label={t("sections.squad")}>
          <p className="text-xs text-muted-foreground">{t("squad.hint")}</p>
          <SquadSelector
            players={team.players}
            selectedIds={setup.selectedPlayerIds}
            onToggle={handleToggleSquadPlayer}
            onSelectAll={handleSelectAllSquad}
            onClearSelection={handleClearSquad}
            selectAllLabel={t("squad.selectAll")}
            clearLabel={t("squad.clear")}
          />
        </SetupSection>

        {/* Visual pitch + bench — shown only when squad has players (DEL 7+8) */}
        {setup.selectedPlayerIds.length > 0 && (
          <SetupSection label={t("sections.lineup")}>
            <PitchLineupEditor
              setup={setup}
              players={team.players.filter((p) =>
                setup.selectedPlayerIds.includes(p.id)
              )}
              onSetupChange={setSetup}
              onAutoFill={() => setSetup((prev) => (prev ? autoFillLineup(prev) : prev))}
            />
          </SetupSection>
        )}

        {/* Report toggle */}
        <SetupSection label={t("sections.summary")}>
          <div className="rounded-xl border border-fp-border bg-fp-surface-2 p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {t("reportToggle.label")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("reportToggle.help")}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={setup.reportEnabled}
                aria-label={t("reportToggle.label")}
                onClick={() => handleReportToggle(!setup.reportEnabled)}
                className={cn(
                  "relative flex-shrink-0 h-7 w-12 rounded-full border transition-colors",
                  setup.reportEnabled
                    ? "border-primary/40 bg-primary"
                    : "border-fp-border bg-fp-surface"
                )}
              >
                <span
                  className={cn(
                    "absolute top-[3px] left-[3px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                    setup.reportEnabled ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>
        </SetupSection>

        {/* Start match CTA */}
        <motion.div variants={variants.fadeInUp} className="pt-2 pb-4">
          {startError ? (
            <p className="mb-2 text-xs text-danger">{startError}</p>
          ) : null}

          {showStartGuard ? (
            <div className="mb-3 rounded-xl border border-warning/30 bg-warning/10 p-3 space-y-3">
              <p className="text-sm font-semibold text-foreground">
                {t("startGuard.title")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("startGuard.description", {
                  title: activeMatch?.title ?? t("startGuard.unknownMatch"),
                })}
              </p>
              <div className="grid gap-2">
                <Link href={activeMatchHref}>
                  <FpButton variant="primary" size="md" fullWidth>
                    {t("startGuard.continue")}
                  </FpButton>
                </Link>
                <FpButton
                  variant="secondary"
                  size="md"
                  fullWidth
                  disabled={isResolvingGuardAction}
                  onClick={() => {
                    setIsResolvingGuardAction(true);
                    void forceCloseActiveMatch()
                      .then(() => setShowStartGuard(false))
                      .catch(() => setStartError(t("errors.startFailed")))
                      .finally(() => setIsResolvingGuardAction(false));
                  }}
                >
                  {t("startGuard.end")}
                </FpButton>
                <FpButton
                  variant="danger"
                  size="md"
                  fullWidth
                  disabled={isResolvingGuardAction}
                  onClick={() => {
                    setIsResolvingGuardAction(true);
                    void discardActiveMatch()
                      .then(() => setShowStartGuard(false))
                      .catch(() => setStartError(t("errors.startFailed")))
                      .finally(() => setIsResolvingGuardAction(false));
                  }}
                >
                  {t("startGuard.discard")}
                </FpButton>
              </div>
            </div>
          ) : null}

          {/* Validation hint */}
          <div className="mb-3 flex items-center justify-center gap-2 min-h-[20px]">
            {matchReady ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-fp-accent">
                <CheckCircle2 size={15} />
                {t("validation.ready")}
              </span>
            ) : setup.selectedPlayerIds.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                {t("squad.selectHint")}
              </span>
            ) : deficit > 0 ? (
              <span className="text-sm text-muted-foreground">
                {t("validation.selectMoreStarters", { needed: deficit })}
              </span>
            ) : null}
          </div>

          <FpButton
            variant="primary"
            size="lg"
            fullWidth
            disabled={!matchReady || isStarting}
            onClick={() => {
              void handleStartMatch();
            }}
            className={cn("group transition-all", matchReady && "glow-primary-sm")}
          >
            {isStarting ? t("actions.starting") : t("startMatch")}
            <ArrowRight
              size={18}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </FpButton>
        </motion.div>
      </motion.div>
    </PageShell>
  );
}
