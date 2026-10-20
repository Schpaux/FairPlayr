"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, PlayCircle, ShieldAlert, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { ButtonLink, Sheet } from "@/components/ui/primitives";
import { LineupField } from "@/components/lineup/LineupField";
import { FormatSelector } from "@/components/match/FormatSelector";
import { FormationSelector } from "@/components/match/FormationSelector";
import type { Player } from "@/domain/team";
import {
  getStoredMatchSetup,
  saveMatchSetupDraft,
  updateMatchConfig,
} from "@/lib/storage/matchStorage";
import { liveHrefFor } from "@/lib/match/activeMatchRecovery";
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
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";

function buildInitialConfig(team: { id: string; players: Player[] }): MatchConfig {
  const storedSetup = getStoredMatchSetup();
  const teamPlayerIds = team.players.map((player) => player.id);

  // Only an unfinished draft is resumed. An ended match is history: reusing it
  // here would revive it as a draft (FP-MS2.1-A3).
  if (storedSetup?.status === "draft" && storedSetup.config.teamId === team.id) {
    return reconcileWithTeam(storedSetup.config, teamPlayerIds);
  }

  let config = createMatchSetup(team.id, "5v5");
  config = selectAllSquad(config, teamPlayerIds);
  return config;
}

export function LineupBuilderManager() {
  const t = useTranslations("lineup");
  const common = useTranslations("common");
  const workspace = useTeamWorkspace();

  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [config, setConfig] = useState<MatchConfig | null>(null);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  // The picker's slot, kept after it closes so its title does not change
  // while the sheet slides out.
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null);
  // True once the coach changes something here. Only then is the draft saved,
  // so opening the lineup never writes anything.
  const [hasEdits, setHasEdits] = useState(false);
  // Set while a started match owns the stored setup: storage refuses lineup
  // writes then, so the editor is replaced by a route back to the match.
  const [activeLiveHref, setActiveLiveHref] = useState<string | null>(null);

  const team = workspace.activeTeam;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isHydrated || workspace.isLoading) {
      return;
    }

    const stored = getStoredMatchSetup();

    if (stored?.status === "active") {
      setActiveLiveHref(liveHrefFor(stored.serverMatchId));
      setConfig(null);
      return;
    }
    setActiveLiveHref(null);

    if (!team) {
      setConfig(null);
      return;
    }
    setConfig(buildInitialConfig(team));
    setHasEdits(false);
  }, [isHydrated, team, workspace.isLoading]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isHydrated || !config || !hasEdits) {
      return;
    }

    if (!saveMatchSetupDraft(config)) {
      // A match became active after this page opened (e.g. in another tab):
      // never keep showing edits that were not saved.
      /* eslint-disable react-hooks/set-state-in-effect */
      setActiveLiveHref(liveHrefFor(getStoredMatchSetup()?.serverMatchId));
      setConfig(null);
      setActiveSlotId(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    updateMatchConfig(config);
  }, [config, isHydrated, hasEdits]);

  const editConfig = (update: (previous: MatchConfig) => MatchConfig) => {
    setHasEdits(true);
    setConfig((previous) => (previous ? update(previous) : previous));
  };

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
    if (!pickerSlotId) {
      return null;
    }

    return slots.find((slot) => slot.id === pickerSlotId)?.label ?? null;
  }, [slots, pickerSlotId]);

  const handleAssignFromPool = (playerId: string) => {
    if (!config || !activeSlotId) {
      return;
    }

    editConfig(() => assignStarterToSlot(config, activeSlotId, playerId));
    setActiveSlotId(null);
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

  if (activeLiveHref) {
    return (
      <PageShell>
        <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />
        <EmptyState
          icon={PlayCircle}
          title={t("activeMatch.title")}
          description={t("activeMatch.description")}
          action={
            <ButtonLink href={activeLiveHref} variant="primary" size="sm">
              {t("activeMatch.continue")}
            </ButtonLink>
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
            <ButtonLink href="/team" variant="primary" size="sm">
              {t("noTeam.action")}
            </ButtonLink>
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
            <ButtonLink href="/team" variant="primary" size="sm">
              {t("noPlayers.action")}
            </ButtonLink>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell className="space-y-4 pb-6">
      <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />

      <AppCard className="p-3 text-xs text-muted-foreground">
        {t("activeTeam", { name: team.name })}
      </AppCard>

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
                editConfig((previous) =>
                  previous ? setMatchFormat(previous, format) : previous
                );
                setActiveSlotId(null);
              }}
            />

            <FormationSelector
              formations={getFormationPresets(config.format)}
              value={config.formationId}
              onChange={(formationId) => {
                editConfig((previous) =>
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
              onSelectSlot={(slotId) => {
                setPickerSlotId(slotId);
                setActiveSlotId((previous) => (previous === slotId ? null : slotId));
              }}
            />

            {activeSlotId && (
              <FpButton
                variant="ghost"
                size="md"
                fullWidth
                onClick={() =>
                  editConfig((previous) =>
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
                editConfig((previous) => (previous ? autoFillLineup(previous) : previous))
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
                  editConfig((previous) =>
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
                  editConfig((previous) =>
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
                      editConfig((previous) =>
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

      {/* UI-A11Y-03: a Sheet, so the picker is a labelled dialog with focus
          trapped and returned, the field behind inert, and Escape to close. */}
      <Sheet
        open={activeSlotId !== null}
        onOpenChange={(open) => {
          if (!open) setActiveSlotId(null);
        }}
        title={t("picker.title")}
        description={selectedSlotLabel ? t("picker.slot", { slot: selectedSlotLabel }) : undefined}
        testId="lineup-picker"
      >
        {benchPlayers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-fp-border bg-fp-surface-2 p-3 text-sm text-muted-foreground">
            {t("remaining.empty")}
          </p>
        ) : (
          <div className="space-y-2">
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
      </Sheet>
    </PageShell>
  );
}
