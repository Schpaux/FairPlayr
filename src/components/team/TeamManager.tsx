"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, Users } from "lucide-react";
import {
  addPlayer,
  createTeam,
  deletePlayer,
  hasPlayerNameConflict,
  renamePlayer,
  renameTeam,
  reorderPlayer,
  type Team,
} from "@/domain/team";
import {
  clearStoredTeam,
  getStoredTeam,
  saveStoredTeam,
} from "@/lib/storage/teamStorage";
import { useTranslations } from "next-intl";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { PlayerList } from "@/components/team/PlayerList";
import { PlayerQuickAddForm } from "@/components/team/PlayerQuickAddForm";
import { TeamNameForm } from "@/components/team/TeamNameForm";
import { variants } from "@/lib/tokens";

export function TeamManager() {
  const t = useTranslations("team");
  const common = useTranslations("common");

  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [team, setTeam] = useState<Team | null>(() => getStoredTeam());
  const [isEditingTeamName, setIsEditingTeamName] = useState(false);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!team) {
      clearStoredTeam();
      return;
    }

    saveStoredTeam(team);
  }, [team, isHydrated]);

  const playerCopy = useMemo(
    () => ({
      rename: common("edit"),
      delete: common("delete"),
      moveUp: t("actions.moveUp"),
      moveDown: t("actions.moveDown"),
      save: common("save"),
      cancel: common("cancel"),
      playerNameLabel: t("forms.playerNameLabel"),
      playerNamePlaceholder: t("forms.playerNamePlaceholder"),
      playerNameRequired: t("validation.playerNameRequired"),
      playerNameDuplicate: t("validation.playerNameDuplicate"),
    }),
    [common, t]
  );

  const handleCreateTeam = (name: string) => {
    setTeam(createTeam(name));
  };

  const handleRenameTeam = (name: string) => {
    setTeam((previous) => (previous ? renameTeam(previous, name) : previous));
    setIsEditingTeamName(false);
  };

  const handleAddPlayer = (name: string): boolean => {
    let didAdd = false;

    setTeam((previous) => {
      if (!previous) {
        return previous;
      }

      if (hasPlayerNameConflict(previous, name)) {
        return previous;
      }

      didAdd = true;
      return addPlayer(previous, name);
    });

    return didAdd;
  };

  const handleRenamePlayer = (playerId: string, name: string): boolean => {
    let didRename = false;

    setTeam((previous) => {
      if (!previous) {
        return previous;
      }

      if (hasPlayerNameConflict(previous, name, playerId)) {
        return previous;
      }

      didRename = true;
      return renamePlayer(previous, playerId, name);
    });

    return didRename;
  };

  const handleDeletePlayer = (playerId: string) => {
    if (!window.confirm(t("actions.confirmDeletePlayer"))) {
      return;
    }

    setTeam((previous) => (previous ? deletePlayer(previous, playerId) : previous));
  };

  const handleMovePlayer = (playerId: string, direction: "up" | "down") => {
    setTeam((previous) =>
      previous ? reorderPlayer(previous, playerId, direction) : previous
    );
  };

  return (
    <PageShell className="space-y-6">
      <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />

      {!isHydrated ? (
        <AppCard className="p-6 text-sm text-muted-foreground">{common("loading")}</AppCard>
      ) : null}

      {isHydrated && !team ? (
        <motion.div initial="hidden" animate="visible" variants={variants.fadeInUp}>
          <EmptyState
            icon={ShieldAlert}
            title={t("noTeam.title")}
            description={t("noTeam.description")}
            action={
              <div className="w-full max-w-sm text-left">
                <TeamNameForm
                  mode="create"
                  label={t("forms.teamNameLabel")}
                  placeholder={t("forms.teamNamePlaceholder")}
                  submitLabel={t("actions.createTeam")}
                  validationMessage={t("validation.teamNameRequired")}
                  onSubmit={handleCreateTeam}
                />
              </div>
            }
          />
        </motion.div>
      ) : null}

      {team ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={variants.staggerContainer}
          className="space-y-4"
        >
          <motion.div variants={variants.fadeInUp}>
            <AppCard glow="primary" className="space-y-3">
              {isEditingTeamName ? (
                <TeamNameForm
                  mode="edit"
                  initialValue={team.name}
                  label={t("forms.teamNameLabel")}
                  placeholder={t("forms.teamNamePlaceholder")}
                  submitLabel={common("save")}
                  cancelLabel={common("cancel")}
                  validationMessage={t("validation.teamNameRequired")}
                  onSubmit={handleRenameTeam}
                  onCancel={() => setIsEditingTeamName(false)}
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t("teamCard.label")}
                    </p>
                    <h2 className="text-lg font-semibold text-foreground">{team.name}</h2>
                  </div>
                  <FpButton
                    variant="secondary"
                    size="md"
                    className="tap-target"
                    onClick={() => setIsEditingTeamName(true)}
                  >
                    {common("edit")}
                  </FpButton>
                </div>
              )}
            </AppCard>
          </motion.div>

          <motion.div variants={variants.fadeInUp}>
            <AppCard className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">{t("players.title")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("players.count", { count: team.players.length })}
                </p>
              </div>

              <PlayerQuickAddForm
                label={t("forms.playerNameLabel")}
                placeholder={t("forms.playerNamePlaceholder")}
                submitLabel={t("actions.addPlayer")}
                validationMessage={t("validation.playerNameRequired")}
                duplicateMessage={t("validation.playerNameDuplicate")}
                onAddPlayer={handleAddPlayer}
              />

              {team.players.length === 0 ? (
                <EmptyState
                  icon={Users}
                  className="py-10"
                  title={t("players.emptyTitle")}
                  description={t("players.emptyDescription")}
                />
              ) : (
                <PlayerList
                  players={team.players}
                  copy={playerCopy}
                  onRenamePlayer={handleRenamePlayer}
                  onDeletePlayer={handleDeletePlayer}
                  onMovePlayer={handleMovePlayer}
                />
              )}
            </AppCard>
          </motion.div>
        </motion.div>
      ) : null}
    </PageShell>
  );
}
