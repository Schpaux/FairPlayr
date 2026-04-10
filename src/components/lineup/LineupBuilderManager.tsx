"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ShieldAlert, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { LineupField } from "@/components/lineup/LineupField";
import { FormatSelector } from "@/components/match/FormatSelector";
import { FormationSelector } from "@/components/match/FormationSelector";
import type { Player } from "@/domain/team";
import { getStoredTeam } from "@/lib/storage/teamStorage";
import {
  getStoredMatchSetup,
  saveMatchSetupDraft,
  updateMatchConfig,
} from "@/lib/storage/matchStorage";
import {
  assignStarterToSlot,
  autoFillLineup,
  clearStarterSlot,
  createMatchSetup,
  getBenchPlayerIds,
  getFormationPresets,
  getFormationSlots,
  reconcileWithTeam,
  setMatchFormat,
  setMatchFormation,
  selectAllSquad,
  setSelectedSquad,
  toggleSquadPlayer,
  type MatchConfig,
} from "@/domain/match";
import { variants } from "@/lib/tokens";
import { cn } from "@/lib/utils";

function buildInitialConfig(team: { id: string; players: Player[] }): MatchConfig {
  const storedSetup = getStoredMatchSetup();
  const teamPlayerIds = team.players.map((player) => player.id);

  if (storedSetup && storedSetup.config.teamId === team.id) {
    return reconcileWithTeam(storedSetup.config, teamPlayerIds);
  }

  let config = createMatchSetup(team.id, "5v5");
  config = selectAllSquad(config, teamPlayerIds);
  return config;
}

export function LineupBuilderManager() {
  const t = useTranslations("lineup");
  const common = useTranslations("common");

  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [team] = useState(() => getStoredTeam());
  const [config, setConfig] = useState<MatchConfig | null>(() => {
    const storedTeam = getStoredTeam();

    if (!storedTeam) {
      return null;
    }

    return buildInitialConfig(storedTeam);
  });
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

  useEffect(() => {
    if (!isHydrated || !config) {
      return;
    }

    saveMatchSetupDraft(config);
    updateMatchConfig(config);
  }, [config, isHydrated]);

  const playersById = useMemo(
    () => new Map((team?.players ?? []).map((player) => [player.id, player])),
    [team?.players]
  );

  const slots = useMemo(
    () => (config ? getFormationSlots(config.format, config.formationId) : []),
    [config]
  );

  const assignedPlayerIds = useMemo(
    () =>
      config
        ? slots
            .map((slot) => config.slotAssignments[slot.id])
            .filter((id): id is string => typeof id === "string")
        : [],
    [config, slots]
  );

  const benchPlayerIds = useMemo(
    () => (config ? getBenchPlayerIds(config) : []),
    [config]
  );

  const benchPlayers = useMemo(
    () =>
      benchPlayerIds
        .map((id) => playersById.get(id))
        .filter((player): player is Player => Boolean(player)),
    [playersById, benchPlayerIds]
  );

  const selectedSlotLabel = useMemo(() => {
    if (!activeSlotId) {
      return null;
    }

    return slots.find((slot) => slot.id === activeSlotId)?.label ?? null;
  }, [slots, activeSlotId]);

  const handleAssignFromPool = (playerId: string) => {
    if (!config || !activeSlotId) {
      return;
    }

    setConfig(assignStarterToSlot(config, activeSlotId, playerId));
    setActiveSlotId(null);
  };

  if (!isHydrated) {
    return (
      <PageShell>
        <AppCard className="p-6 text-sm text-muted-foreground">{common("loading")}</AppCard>
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
              <FpButton variant="primary" size="md">
                {t("noTeam.action")}
              </FpButton>
            </Link>
          }
        />
      </PageShell>
    );
  }

  if (!config) {
    return null;
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
              <FpButton variant="primary" size="md">
                {t("noPlayers.action")}
              </FpButton>
            </Link>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell className="space-y-4 pb-6">
      <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={variants.staggerContainer}
        className="space-y-4"
      >
        <motion.div variants={variants.fadeInUp}>
          <AppCard className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("sections.format")}
            </p>
              <FormatSelector
              value={config.format}
                i18nNamespace="lineup.format"
              onChange={(format) => {
                setConfig((previous) =>
                  previous ? setMatchFormat(previous, format) : previous
                );
                setActiveSlotId(null);
              }}
            />

            <FormationSelector
              formations={getFormationPresets(config.format)}
              value={config.formationId}
              onChange={(formationId) => {
                setConfig((previous) =>
                  previous ? setMatchFormation(previous, formationId) : previous
                );
                setActiveSlotId(null);
              }}
            />
          </AppCard>
        </motion.div>

        <motion.div variants={variants.fadeInUp}>
          <AppCard className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{t("sections.field")}</p>
              <span className="text-xs text-muted-foreground">
                {t("status.assigned", {
                  assigned: assignedPlayerIds.length,
                  required: slots.length,
                })}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">{t("field.hint")}</p>

            <LineupField
              slots={slots}
              slotAssignments={config.slotAssignments}
              playersById={playersById}
              activeSlotId={activeSlotId}
              slotEmptyLabel={t("field.slot")}
              onSelectSlot={(slotId) =>
                setActiveSlotId((previous) => (previous === slotId ? null : slotId))
              }
            />

            {activeSlotId && (
              <FpButton
                variant="ghost"
                size="md"
                fullWidth
                onClick={() =>
                  setConfig((previous) =>
                    previous ? clearStarterSlot(previous, activeSlotId) : previous
                  )
                }
              >
                {t("actions.clearSlot")}
              </FpButton>
            )}

            <FpButton
              variant="secondary"
              size="md"
              fullWidth
              onClick={() =>
                setConfig((previous) => (previous ? autoFillLineup(previous) : previous))
              }
            >
              {t("actions.autoFill")}
            </FpButton>
          </AppCard>
        </motion.div>

        <motion.div variants={variants.fadeInUp}>
          <AppCard className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{t("sections.players")}</p>
              <span className="text-xs text-muted-foreground">
                {t("players.selectedCount", {
                  selected: config.selectedPlayerIds.length,
                  total: team.players.length,
                })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setConfig((previous) =>
                    previous
                      ? selectAllSquad(
                          previous,
                          team.players.map((player) => player.id)
                        )
                      : previous
                  )
                }
                className="tap-target rounded-lg border border-fp-border bg-fp-surface-2 px-2 py-1 text-[11px] font-medium text-muted-foreground"
              >
                {t("players.selectAll")}
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfig((previous) =>
                    previous ? setSelectedSquad(previous, []) : previous
                  )
                }
                className="tap-target rounded-lg border border-fp-border bg-fp-surface-2 px-2 py-1 text-[11px] font-medium text-muted-foreground"
              >
                {t("players.clear")}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {team.players.map((player) => {
                const selected = config.selectedPlayerIds.includes(player.id);
                const assigned = assignedPlayerIds.includes(player.id);

                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() =>
                      setConfig((previous) =>
                        previous ? toggleSquadPlayer(previous, player.id) : previous
                      )
                    }
                    className={`tap-target rounded-xl border p-3 text-left transition-all ${
                      selected
                        ? "border-primary/30 bg-primary/10"
                        : "border-fp-border bg-fp-surface-2"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{player.name}</span>
                      {assigned ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-fp-accent/35 bg-fp-accent/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-fp-accent">
                          <CheckCircle2 size={12} />
                          {t("players.assigned")}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </AppCard>
        </motion.div>
      </motion.div>

      {activeSlotId && (
        <div className="fixed inset-0 z-40 bg-black/45 p-3" onClick={() => setActiveSlotId(null)}>
          <div
            className="absolute inset-x-3 bottom-3 rounded-2xl border border-fp-border bg-background p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("picker.title")}
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {t("picker.slot", { slot: selectedSlotLabel ?? "" })}
                </p>
              </div>
              <button
                type="button"
                className="tap-target rounded-lg border border-fp-border bg-fp-surface-2 p-2 text-muted-foreground"
                onClick={() => setActiveSlotId(null)}
              >
                <X size={14} />
              </button>
            </div>

            {benchPlayers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-fp-border bg-fp-surface-2 p-3 text-sm text-muted-foreground">
                {t("remaining.empty")}
              </p>
            ) : (
              <div className="max-h-[44vh] space-y-2 overflow-y-auto pr-1">
                {benchPlayers.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => handleAssignFromPool(player.id)}
                    className={cn(
                      "tap-target w-full rounded-xl border border-fp-border bg-fp-surface-2 p-3 text-left transition-all hover:border-primary/25"
                    )}
                  >
                    <p className="text-sm font-semibold text-foreground">{player.name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
