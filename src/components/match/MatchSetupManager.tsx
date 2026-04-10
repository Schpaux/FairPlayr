"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ShieldAlert, Users, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  createMatchSetup,
  setMatchFormat,
  setMatchDuration,
  setMatchDurationPreset,
  toggleSquadPlayer,
  setSelectedSquad,
  selectAllSquad,
  promoteToStarter,
  demoteToBench,
  autoFillLineup,
  getFormationPresets,
  setMatchFormation,
  getStarterDeficit,
  canStartMatch,
  reconcileWithTeam,
} from "@/domain/match";
import type { MatchConfig } from "@/domain/match";
import { getStoredTeam } from "@/lib/storage/teamStorage";
import {
  getStoredMatchSetup,
  saveMatchSetupDraft,
  activateMatch,
} from "@/lib/storage/matchStorage";
import { clearStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { Link } from "@/i18n/navigation";
import { FormatSelector } from "@/components/match/FormatSelector";
import { DurationPicker } from "@/components/match/DurationPicker";
import { SquadSelector } from "@/components/match/SquadSelector";
import { LineupAssigner } from "@/components/match/LineupAssigner";
import { FormationSelector } from "@/components/match/FormationSelector";
import { variants } from "@/lib/tokens";
import { cn } from "@/lib/utils";

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

  // ── Hydration guard (avoids SSR/client mismatch on localStorage reads) ──
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // ── State ──────────────────────────────────────────────────────────────
  const [team] = useState(() => getStoredTeam());
  const [setup, setSetup] = useState<MatchConfig | null>(() => {
    const currentTeam = getStoredTeam();

    if (!currentTeam) {
      return null;
    }

    const stored = getStoredMatchSetup();
    const teamPlayerIds = currentTeam.players.map((p) => p.id);

    if (stored && stored.config.teamId === currentTeam.id) {
      return reconcileWithTeam(stored.config, teamPlayerIds);
    }

    return createMatchSetup(currentTeam.id);
  });

  // ── Auto-save draft on every setup change ──────────────────────────────
  useEffect(() => {
    if (!isHydrated || !setup) return;
    saveMatchSetupDraft(setup);
  }, [setup, isHydrated]);

  // ── Handlers ───────────────────────────────────────────────────────────
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

  const handleFormationChange: React.ComponentProps<
    typeof FormationSelector
  >["onChange"] = (formationId) => {
    setSetup((prev) => (prev ? setMatchFormation(prev, formationId) : prev));
  };

  const handleToggleSquad = (playerId: string) => {
    setSetup((prev) => (prev ? toggleSquadPlayer(prev, playerId) : prev));
  };

  const handlePromote = (playerId: string) => {
    setSetup((prev) => (prev ? promoteToStarter(prev, playerId) : prev));
  };

  const handleDemote = (playerId: string) => {
    setSetup((prev) => (prev ? demoteToBench(prev, playerId) : prev));
  };

  const handleSelectAll = () => {
    setSetup((prev) =>
      prev ? selectAllSquad(prev, team.players.map((player) => player.id)) : prev
    );
  };

  const handleClearSelection = () => {
    setSetup((prev) => (prev ? setSelectedSquad(prev, []) : prev));
  };

  const handleAutoFill = () => {
    setSetup((prev) => (prev ? autoFillLineup(prev) : prev));
  };

  const handleStartMatch = () => {
    if (!setup || !canStartMatch(setup)) return;
    clearStoredLiveMatch();
    activateMatch(setup);
    router.push("/match/live");
  };

  // ── Validation state ───────────────────────────────────────────────────
  const deficit = setup ? getStarterDeficit(setup) : 0;
  const matchReady = setup ? canStartMatch(setup) : false;

  // ── Loading ────────────────────────────────────────────────────────────
  if (!isHydrated) {
    return (
      <PageShell>
        <AppCard className="p-6 text-sm text-muted-foreground animate-pulse">
          &nbsp;
        </AppCard>
      </PageShell>
    );
  }

  // ── No team ────────────────────────────────────────────────────────────
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
              <FpButton variant="primary" size="md">
                {t("noTeam.action")}
              </FpButton>
            </Link>
          }
        />
      </PageShell>
    );
  }

  // ── No players ─────────────────────────────────────────────────────────
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
              <FpButton variant="primary" size="md">
                {t("noPlayers.action")}
              </FpButton>
            </Link>
          }
        />
      </PageShell>
    );
  }

  if (!setup) return null;

  // ── Main setup form ────────────────────────────────────────────────────
  return (
    <PageShell className="space-y-4">
      <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={variants.staggerContainer}
        className="space-y-4"
      >
        {/* Format */}
        <SetupSection label={t("sections.format")}>
          <FormatSelector value={setup.format} onChange={handleFormatChange} />
        </SetupSection>

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
          />
        </SetupSection>

        {/* Squad */}
        <SetupSection label={t("sections.squad")}>
          <SquadSelector
            players={team.players}
            selectedIds={setup.selectedPlayerIds}
            onToggle={handleToggleSquad}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            selectAllLabel={t("squad.selectAll")}
            clearLabel={t("squad.clear")}
          />
        </SetupSection>

        {/* Lineup — only shown once at least 1 player is in the squad */}
        {setup.selectedPlayerIds.length > 0 && (
          <SetupSection label={t("sections.lineup")}>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAutoFill}
                className="tap-target rounded-lg border border-fp-border bg-fp-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground"
              >
                {t("lineup.autoFill")}
              </button>
            </div>
            <LineupAssigner
              setup={setup}
              players={team.players}
              onPromote={handlePromote}
              onDemote={handleDemote}
            />
          </SetupSection>
        )}

        {/* Start Match CTA */}
        <motion.div variants={variants.fadeInUp} className="pt-2 pb-4">
          {/* Validation hint */}
          <div className="mb-3 flex items-center justify-center gap-2 min-h-[20px]">
            {matchReady ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-fp-accent">
                <CheckCircle2 size={15} />
                {t("validation.ready")}
              </span>
            ) : deficit > 0 ? (
              <span className="text-sm text-muted-foreground">
                {t("validation.selectMoreStarters", { needed: deficit })}
              </span>
            ) : setup.selectedPlayerIds.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                {t("startMatchHint")}
              </span>
            ) : null}
          </div>

          <FpButton
            variant="primary"
            size="lg"
            fullWidth
            disabled={!matchReady}
            onClick={handleStartMatch}
            className={cn(
              "group transition-all",
              matchReady && "glow-primary-sm"
            )}
          >
            {t("startMatch")}
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
