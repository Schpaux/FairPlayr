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
  toggleSquadPlayer,
  promoteToStarter,
  demoteToBench,
  getStarterDeficit,
  canStartMatch,
  reconcileWithTeam,
} from "@/domain/match";
import type { MatchSetup } from "@/domain/match";
import { getStoredTeam } from "@/lib/storage/teamStorage";
import {
  getStoredMatchSetup,
  saveMatchSetupDraft,
  activateMatch,
} from "@/lib/storage/matchStorage";
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
  const [team, setTeam] = useState(() => getStoredTeam());
  const [setup, setSetup] = useState<MatchSetup | null>(null);

  // ── Initialise setup once hydrated ─────────────────────────────────────
  useEffect(() => {
    if (!isHydrated) return;

    const currentTeam = getStoredTeam();
    setTeam(currentTeam);

    if (!currentTeam) {
      setSetup(null);
      return;
    }

    const stored = getStoredMatchSetup();
    const teamPlayerIds = currentTeam.players.map((p) => p.id);

    if (stored && stored.setup.teamId === currentTeam.id) {
      // Restore draft, but reconcile against current players
      setSetup(reconcileWithTeam(stored.setup, teamPlayerIds));
    } else {
      // New team or no stored setup — start fresh
      setSetup(createMatchSetup(currentTeam.id));
    }
  }, [isHydrated]);

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
  >["onChange"] = (minutes) => {
    setSetup((prev) => (prev ? setMatchDuration(prev, minutes) : prev));
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

  const handleStartMatch = () => {
    if (!setup || !canStartMatch(setup)) return;
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

        {/* Duration */}
        <SetupSection label={t("sections.duration")}>
          <DurationPicker
            format={setup.format}
            value={setup.durationMinutes}
            onChange={handleDurationChange}
          />
        </SetupSection>

        {/* Squad */}
        <SetupSection label={t("sections.squad")}>
          <SquadSelector
            players={team.players}
            selectedIds={setup.squadPlayerIds}
            onToggle={handleToggleSquad}
          />
        </SetupSection>

        {/* Lineup — only shown once at least 1 player is in the squad */}
        {setup.squadPlayerIds.length > 0 && (
          <SetupSection label={t("sections.lineup")}>
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
            ) : setup.squadPlayerIds.length === 0 ? (
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
