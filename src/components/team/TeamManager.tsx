"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, Users } from "lucide-react";
import { hasPlayerNameConflict } from "@/domain/team";
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
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";

export function TeamManager() {
  const t = useTranslations("team");
  const common = useTranslations("common");
  const workspace = useTeamWorkspace();

  const [isEditingTeamName, setIsEditingTeamName] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  const team = workspace.activeTeam;

  const allowReorder = workspace.mode === "guest-local";

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

  const handleCreateTeam = async (name: string) => {
    try {
      await workspace.createTeam(name);
      setTeamError(null);
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : t("errors.generic"));
    }
  };

  const handleRenameTeam = async (name: string) => {
    if (!team) {
      return;
    }

    try {
      await workspace.renameTeam(team.id, name);
      setTeamError(null);
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : t("errors.generic"));
    }

    setIsEditingTeamName(false);
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!window.confirm(t("actions.confirmDeleteTeam"))) {
      return;
    }

    try {
      await workspace.deleteTeam(teamId);
      setTeamError(null);
      setIsEditingTeamName(false);
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : t("errors.generic"));
    }
  };

  const handleAddPlayer = async (name: string): Promise<boolean> => {
    if (!team) {
      return false;
    }

    if (hasPlayerNameConflict(team, name)) {
      return false;
    }

    try {
      await workspace.addPlayer(team.id, name);
      setTeamError(null);
      return true;
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : t("errors.generic"));
      return false;
    }
  };

  const handleRenamePlayer = async (playerId: string, name: string): Promise<boolean> => {
    if (!team) {
      return false;
    }

    if (hasPlayerNameConflict(team, name, playerId)) {
      return false;
    }

    try {
      await workspace.renamePlayer(team.id, playerId, name);
      setTeamError(null);
      return true;
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : t("errors.generic"));
      return false;
    }
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (!window.confirm(t("actions.confirmDeletePlayer"))) {
      return;
    }

    if (!team) {
      return;
    }

    try {
      await workspace.deletePlayer(team.id, playerId);
      setTeamError(null);
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : t("errors.generic"));
    }
  };

  const handleMovePlayer = async (playerId: string, direction: "up" | "down") => {
    if (!team || !allowReorder) {
      return;
    }

    try {
      await workspace.reorderPlayer(team.id, playerId, direction);
      setTeamError(null);
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : t("errors.generic"));
    }
  };

  return (
    <PageShell className="space-y-6">
      <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />

      {workspace.isLoading ? (
        <AppCard className="p-6 text-sm text-muted-foreground">{common("loading")}</AppCard>
      ) : null}

      {!workspace.isLoading ? (
        <AppCard className="p-3 text-xs text-muted-foreground">
          {workspace.mode === "guest-local" ? t("storage.guest") : t("storage.cloud")}
        </AppCard>
      ) : null}

      {workspace.error ? (
        <AppCard className="p-3 text-xs text-danger">{workspace.error}</AppCard>
      ) : null}

      {teamError ? <AppCard className="p-3 text-xs text-danger">{teamError}</AppCard> : null}

      {!workspace.isLoading && workspace.teams.length === 0 ? (
        <motion.div initial="hidden" animate="visible" variants={variants.fadeInUp}>
          <EmptyState
            icon={ShieldAlert}
            title={workspace.mode === "guest-local" ? t("noTeam.title") : t("noTeamCloud.title")}
            description={
              workspace.mode === "guest-local" ? t("noTeam.description") : t("noTeamCloud.description")
            }
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

      {workspace.teams.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={variants.staggerContainer}
          className="space-y-4"
        >
          <motion.div variants={variants.fadeInUp}>
            <AppCard className="space-y-3 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("teamList.title")}
              </p>

              <div className="grid grid-cols-1 gap-2">
                {workspace.teams.map((candidate) => {
                  const isActive = candidate.id === workspace.activeTeamId;

                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => {
                        void workspace.setActiveTeam(candidate.id);
                      }}
                      className={`tap-target rounded-xl border px-3 py-2 text-left transition-all ${
                        isActive
                          ? "border-primary/30 bg-primary/10"
                          : "border-fp-border bg-fp-surface-2"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{candidate.name}</span>
                        {isActive ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                            {t("teamList.activeBadge")}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-fp-border">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("actions.createTeam")}
                </p>
                <TeamNameForm
                  mode="create"
                  label={t("forms.teamNameLabel")}
                  placeholder={t("forms.teamNamePlaceholder")}
                  submitLabel={t("actions.createTeam")}
                  validationMessage={t("validation.teamNameRequired")}
                  onSubmit={handleCreateTeam}
                />
              </div>
            </AppCard>
          </motion.div>

          {team ? (
            <>
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
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("teamCard.label")}</p>
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

                  <FpButton
                    type="button"
                    variant="danger"
                    size="md"
                    className="tap-target"
                    onClick={() => handleDeleteTeam(team.id)}
                    disabled={workspace.teams.length <= 1}
                  >
                    {t("actions.deleteTeam")}
                  </FpButton>
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
                      allowReorder={allowReorder}
                      onRenamePlayer={handleRenamePlayer}
                      onDeletePlayer={handleDeletePlayer}
                      onMovePlayer={handleMovePlayer}
                    />
                  )}
                </AppCard>
              </motion.div>
            </>
          ) : null}
        </motion.div>
      ) : null}
    </PageShell>
  );
}
