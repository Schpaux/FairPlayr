"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ShieldAlert, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { LineupField } from "@/components/lineup/LineupField";
import { FormatSelector } from "@/components/match/FormatSelector";
import type { Player } from "@/domain/team";
import { getStoredTeam } from "@/lib/storage/teamStorage";
import { getStoredMatchSetup } from "@/lib/storage/matchStorage";
import {
  assignPlayerToSlot,
  clearSlotAssignment,
  createLineupDraft,
  getAssignedPlayerIds,
  getRemainingSelectedPlayerIds,
  reconcileLineupWithTeam,
  setLineupFormat,
  setSelectedPlayers,
  toggleSelectedPlayer,
  type LineupDraft,
} from "@/domain/lineup";
import { getLineupSlots } from "@/domain/lineupLayouts";
import {
  getStoredLineupDraft,
  saveStoredLineupDraft,
} from "@/lib/storage/lineupStorage";
import { variants } from "@/lib/tokens";

function buildInitialLineupDraft(team: { id: string; players: Player[] }): LineupDraft {
  const storedDraft = getStoredLineupDraft();
  const storedSetup = getStoredMatchSetup();

  if (storedDraft && storedDraft.teamId === team.id) {
    return reconcileLineupWithTeam(
      storedDraft,
      team.players.map((player) => player.id)
    );
  }

  const initialFormat =
    storedSetup && storedSetup.setup.teamId === team.id
      ? storedSetup.setup.format
      : "5v5";

  let draft = createLineupDraft(team.id, initialFormat);

  const selectedIds =
    storedSetup && storedSetup.setup.teamId === team.id
      ? storedSetup.setup.squadPlayerIds
      : team.players.map((player) => player.id);

  draft = setSelectedPlayers(draft, selectedIds);

  if (storedSetup && storedSetup.setup.teamId === team.id) {
    const slots = getLineupSlots(draft.format);

    storedSetup.setup.startingPlayerIds.forEach((playerId, index) => {
      const slot = slots[index];

      if (!slot) {
        return;
      }

      draft = assignPlayerToSlot(draft, slot.id, playerId);
    });
  }

  return draft;
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
  const [draft, setDraft] = useState<LineupDraft | null>(() => {
    const storedTeam = getStoredTeam();

    if (!storedTeam) {
      return null;
    }

    return buildInitialLineupDraft(storedTeam);
  });
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

  useEffect(() => {
    if (!isHydrated || !draft) {
      return;
    }

    saveStoredLineupDraft(draft);
  }, [draft, isHydrated]);

  const playersById = useMemo(
    () => new Map((team?.players ?? []).map((player) => [player.id, player])),
    [team?.players]
  );

  const slots = useMemo(() => (draft ? getLineupSlots(draft.format) : []), [draft]);
  const assignedPlayerIds = useMemo(() => (draft ? getAssignedPlayerIds(draft) : []), [draft]);
  const remainingSelectedIds = useMemo(
    () => (draft ? getRemainingSelectedPlayerIds(draft) : []),
    [draft]
  );

  const remainingSelectedPlayers = useMemo(
    () =>
      remainingSelectedIds
        .map((id) => playersById.get(id))
        .filter((player): player is Player => Boolean(player)),
    [playersById, remainingSelectedIds]
  );

  const handleAssignFromPool = (playerId: string) => {
    if (!draft || !activeSlotId) {
      return;
    }

    setDraft(assignPlayerToSlot(draft, activeSlotId, playerId));
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

  if (!draft) {
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
              value={draft.format}
                i18nNamespace="lineup.format"
              onChange={(format) => {
                setDraft((previous) =>
                  previous ? setLineupFormat(previous, format) : previous
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
              slotAssignments={draft.slotAssignments}
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
                  setDraft((previous) =>
                    previous ? clearSlotAssignment(previous, activeSlotId) : previous
                  )
                }
              >
                {t("actions.clearSlot")}
              </FpButton>
            )}
          </AppCard>
        </motion.div>

        <motion.div variants={variants.fadeInUp}>
          <AppCard className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users size={16} className="text-primary" />
              {t("sections.remaining")}
            </div>
            <p className="text-xs text-muted-foreground">{t("remaining.hint")}</p>

            {remainingSelectedPlayers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-fp-border bg-fp-surface-2 p-3 text-sm text-muted-foreground">
                {t("remaining.empty")}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {remainingSelectedPlayers.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => handleAssignFromPool(player.id)}
                    className="tap-target rounded-xl border border-fp-border bg-fp-surface-2 p-3 text-left transition-all hover:border-primary/25"
                    disabled={!activeSlotId}
                  >
                    <p className="text-sm font-semibold text-foreground">{player.name}</p>
                  </button>
                ))}
              </div>
            )}

            {!activeSlotId && (
              <p className="text-xs text-muted-foreground">{t("actions.selectSlotFirst")}</p>
            )}
          </AppCard>
        </motion.div>

        <motion.div variants={variants.fadeInUp}>
          <AppCard className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{t("sections.players")}</p>
              <span className="text-xs text-muted-foreground">
                {t("players.selectedCount", {
                  selected: draft.selectedPlayerIds.length,
                  total: team.players.length,
                })}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {team.players.map((player) => {
                const selected = draft.selectedPlayerIds.includes(player.id);
                const assigned = assignedPlayerIds.includes(player.id);

                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() =>
                      setDraft((previous) =>
                        previous ? toggleSelectedPlayer(previous, player.id) : previous
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
    </PageShell>
  );
}
