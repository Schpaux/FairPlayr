"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { ShieldAlert, Users, ArrowRight, CheckCircle2, Pencil, PlayCircle } from "lucide-react";
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
  MATCH_DURATION_PRESETS,
} from "@/domain/match";
import type { MatchConfig } from "@/domain/match";
import { chooseInitialSetup } from "@/domain/matchSetupInit";
import {
  discardMatchSetupDraft,
  getStoredMatchSetup,
  saveMatchSetupDraft,
} from "@/lib/storage/matchStorage";
import { liveHrefFor, startLocalMatch } from "@/lib/match/activeMatchRecovery";
import { getTeamMatchPrefs } from "@/lib/storage/teamPrefsStorage";
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
  const [isCompact, setIsCompact] = useState(false);
  // True once the coach changes something here. Only then is the draft saved,
  // so opening setup never writes anything.
  const [hasEdits, setHasEdits] = useState(false);
  // True while showing an unfinished draft instead of the team defaults.
  const [isResumedDraft, setIsResumedDraft] = useState(false);
  // Set while a started match owns the stored setup: the editor is replaced by
  // a route back to that match, so setup can never demote or overwrite it.
  const [activeLiveHref, setActiveLiveHref] = useState<string | null>(null);

  const team = workspace.activeTeam;

  useEffect(() => {
    if (!isHydrated || workspace.isLoading) return;

    const stored = getStoredMatchSetup();

    if (stored?.status === "active") {
      setActiveLiveHref(liveHrefFor(stored.serverMatchId));
      setSetup(null);
      return;
    }
    setActiveLiveHref(null);

    if (!team) {
      setSetup(null);
      return;
    }

    const prefs = getTeamMatchPrefs(team.id);
    const hasDefaults = Boolean(prefs.format ?? prefs.formationId ?? prefs.durationPresetId);
    const initial = chooseInitialSetup(
      stored,
      prefs,
      team.id,
      team.players.map((p) => p.id)
    );
    if (initial.kind === "active") return;

    // Resume an unfinished draft (labelled as such), otherwise start from the
    // team defaults. Nothing is stored until the coach changes something.
    setSetup(initial.setup);
    setIsResumedDraft(initial.kind === "resume");
    setHasEdits(false);
    setIsCompact(hasDefaults);
  }, [isHydrated, team, workspace.isLoading]);

  // ── Persist draft on every edit (never on open) ────────────────────────────
  useEffect(() => {
    if (!isHydrated || !setup || !hasEdits) return;
    if (!saveMatchSetupDraft(setup)) {
      // A match became active (e.g. in another tab) and owns the stored setup:
      // show the way to it rather than an editor whose changes are not saved.
      setActiveLiveHref(liveHrefFor(getStoredMatchSetup()?.serverMatchId));
      setSetup(null);
    }
  }, [setup, isHydrated, hasEdits]);

  // Changes here belong to this match only; team defaults are edited in team
  // settings and are never written from setup.
  const editSetup = (update: (prev: MatchConfig) => MatchConfig) => {
    setHasEdits(true);
    setSetup((prev) => (prev ? update(prev) : prev));
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleStartFromDefaults = () => {
    if (!team) return;
    if (!discardMatchSetupDraft()) {
      setActiveLiveHref(liveHrefFor(getStoredMatchSetup()?.serverMatchId));
      setSetup(null);
      return;
    }
    const prefs = getTeamMatchPrefs(team.id);
    setSetup(createMatchSetupWithPrefs(team.id, prefs));
    setIsResumedDraft(false);
    setHasEdits(false);
    setIsCompact(Boolean(prefs.format ?? prefs.formationId ?? prefs.durationPresetId));
  };

  const handleFormatChange: React.ComponentProps<
    typeof FormatSelector
  >["onChange"] = (format) => {
    editSetup((prev) => setMatchFormat(prev, format));
  };

  const handleDurationChange: React.ComponentProps<
    typeof DurationPicker
  >["onCustomChange"] = (minutes) => {
    editSetup((prev) => setMatchDuration(prev, minutes));
  };

  const handleDurationPresetChange: React.ComponentProps<
    typeof DurationPicker
  >["onPresetChange"] = (presetId) => {
    editSetup((prev) => setMatchDurationPreset(prev, presetId));
  };

  const handleHalvesChange: React.ComponentProps<
    typeof DurationPicker
  >["onHalvesChange"] = (halves) => {
    editSetup((prev) => setMatchHalves(prev, halves));
  };

  const handleFormationChange: React.ComponentProps<
    typeof FormationSelector
  >["onChange"] = (formationId) => {
    editSetup((prev) => setMatchFormation(prev, formationId));
  };

  const handleReportToggle = (enabled: boolean) => {
    editSetup((prev) => setReportEnabled(prev, enabled));
  };

  const handleToggleSquadPlayer = (playerId: string) => {
    editSetup((prev) => toggleSquadPlayer(prev, playerId));
  };

  const handleSelectAllSquad = () => {
    if (!team) return;
    editSetup((prev) => selectAllSquad(prev, team.players.map((p) => p.id)));
  };

  const handleClearSquad = () => {
    editSetup((prev) => setSelectedSquad(prev, []));
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

    const started = startLocalMatch(setup, matchId);
    if (!started.ok) {
      // Another match became active (e.g. in another tab): keep it, show the
      // way back to it instead of starting over it.
      setActiveLiveHref(liveHrefFor(getStoredMatchSetup()?.serverMatchId));
      setIsStarting(false);
      return;
    }

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

  if (activeLiveHref) {
    return (
      <PageShell>
        <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />
        <EmptyState
          icon={PlayCircle}
          title={t("activeMatch.title")}
          description={t("activeMatch.description")}
          action={
            <Link href={activeLiveHref}>
              <FpButton variant="primary" size="md">{t("activeMatch.continue")}</FpButton>
            </Link>
          }
        />
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

        {isResumedDraft ? (
          <motion.div variants={variants.fadeInUp}>
            <AppCard className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{t("draft.resumed")}</p>
                <p className="text-xs text-muted-foreground">{t("draft.replaceHint")}</p>
              </div>
              <button
                type="button"
                onClick={handleStartFromDefaults}
                className="tap-target text-sm font-semibold text-fp-cta"
              >
                {t("draft.startFromDefaults")}
              </button>
            </AppCard>
          </motion.div>
        ) : null}

        {/* Compact defaults summary */}
        {isCompact ? (
          <motion.div variants={variants.fadeInUp}>
            <AppCard className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("compact.title")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-xl border border-fp-cta/30 bg-fp-cta/10 px-3 py-1 text-sm font-bold text-fp-cta">
                  {setup.format}
                </span>
                <span className="rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-1 text-sm font-semibold text-foreground">
                  {getFormationPresets(setup.format).find((f) => f.id === setup.formationId)?.shape ?? setup.formationId}
                </span>
                <span className="rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-1 text-sm font-semibold text-foreground">
                  {setup.duration.mode === "preset" && setup.duration.presetId
                    ? `${setup.duration.presetId} · ${MATCH_DURATION_PRESETS[setup.duration.presetId].totalMinutes} min`
                    : `${setup.duration.totalMinutes} min`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsCompact(false)}
                className="tap-target flex items-center gap-1.5 text-sm font-semibold text-fp-cta"
              >
                <Pencil size={13} />
                {t("compact.edit")}
              </button>
            </AppCard>
          </motion.div>
        ) : (
          <>
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
          </>
        )}

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
              onSetupChange={(next) => editSetup(() => next)}
              onAutoFill={() => editSetup(autoFillLineup)}
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
                    ? "border-fp-cta/40 bg-fp-cta"
                    : "border-fp-border bg-fp-surface-2"
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
            className={cn("group transition-all", matchReady && "glow-cta-sm")}
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
