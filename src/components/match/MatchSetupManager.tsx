"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { ShieldAlert, Users, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  createMatchSetup,
  setMatchFormat,
  setMatchDuration,
  setMatchHalves,
  setMatchDurationPreset,
  setReportEnabled,
  setSelectedSquad,
  assignStarterToSlot,
  clearStarterSlot,
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
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { Link } from "@/i18n/navigation";
import { FormatSelector } from "@/components/match/FormatSelector";
import { DurationPicker } from "@/components/match/DurationPicker";
import { LineupAssigner } from "@/components/match/LineupAssigner";
import { FormationSelector } from "@/components/match/FormationSelector";
import { variants } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";

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
  const matchId = searchParams.get("matchId");

  // ── Hydration guard (avoids SSR/client mismatch on localStorage reads) ──
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // ── State ──────────────────────────────────────────────────────────────
  const [setup, setSetup] = useState<MatchConfig | null>(null);

  const team = workspace.activeTeam;

  useEffect(() => {
    if (!isHydrated || workspace.isLoading) {
      return;
    }

    if (!team) {
      setSetup(null);
      return;
    }

    const stored = getStoredMatchSetup();
    const teamPlayerIds = team.players.map((player) => player.id);

    if (stored && stored.config.teamId === team.id) {
      const reconciled = reconcileWithTeam(stored.config, teamPlayerIds);
      setSetup(setSelectedSquad(reconciled, teamPlayerIds));
      return;
    }

    setSetup(setSelectedSquad(createMatchSetup(team.id), teamPlayerIds));
  }, [isHydrated, team, workspace.isLoading]);

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

  const handleHalvesChange: React.ComponentProps<typeof DurationPicker>["onHalvesChange"] = (halves) => {
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

  const handleAssignToSlot = (slotId: string, playerId: string) => {
    setSetup((prev) => (prev ? assignStarterToSlot(prev, slotId, playerId) : prev));
  };

  const handleClearSlot = (slotId: string) => {
    setSetup((prev) => (prev ? clearStarterSlot(prev, slotId) : prev));
  };

  const handleAutoFill = () => {
    setSetup((prev) => (prev ? autoFillLineup(prev) : prev));
  };

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const handleStartMatch = async () => {
    if (!setup || !canStartMatch(setup)) return;

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
          headers: {
            "content-type": "application/json",
          },
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
      setStartError(cause instanceof Error ? cause.message : t("errors.startFailed"));
      setIsStarting(false);
      return;
    }

    setIsStarting(false);
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
        <motion.div variants={variants.fadeInUp}>
          <AppCard className="p-3 text-xs text-muted-foreground">
            {t("activeTeam", { name: team.name })}
          </AppCard>
        </motion.div>

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
            onHalvesChange={handleHalvesChange}
          />
        </SetupSection>

        <SetupSection label={t("sections.lineup")}>
          <LineupAssigner
            setup={setup}
            players={team.players}
            onAssignToSlot={handleAssignToSlot}
            onClearSlot={handleClearSlot}
            onAutoFill={handleAutoFill}
          />
        </SetupSection>

        <SetupSection label={t("sections.summary")}> 
          <div className="rounded-xl border border-fp-border bg-fp-surface-2 p-3">
            <label className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{t("reportToggle.label")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("reportToggle.help")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={setup.reportEnabled}
                onClick={() => handleReportToggle(!setup.reportEnabled)}
                className={cn(
                  "relative mt-0.5 h-7 w-12 rounded-full border transition-colors",
                  setup.reportEnabled
                    ? "border-primary/40 bg-primary"
                    : "border-fp-border bg-background"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                    setup.reportEnabled ? "translate-x-6" : "translate-x-0.5"
                  )}
                />
              </button>
            </label>
          </div>
        </SetupSection>

        {/* Start Match CTA */}
        <motion.div variants={variants.fadeInUp} className="pt-2 pb-4">
          {startError ? (
            <p className="mb-2 text-xs text-danger">{startError}</p>
          ) : null}
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
            disabled={!matchReady || isStarting}
            onClick={() => {
              void handleStartMatch();
            }}
            className={cn(
              "group transition-all",
              matchReady && "glow-primary-sm"
            )}
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
