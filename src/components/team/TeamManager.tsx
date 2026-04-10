"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, Users } from "lucide-react";
import {
  hasPlayerNameConflict,
  type Team,
} from "@/domain/team";
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
import { useAuth } from "@/components/providers/AuthProvider";
import { createTeamRepository } from "@/lib/teamData/createTeamRepository";

export function TeamManager() {
  const t = useTranslations("team");
  const common = useTranslations("common");
  const auth = useAuth();

  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [team, setTeam] = useState<Team | null>(null);
  const [isEditingTeamName, setIsEditingTeamName] = useState(false);
  const [loadedRepositoryKey, setLoadedRepositoryKey] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);

  const repository = useMemo(
    () =>
      createTeamRepository({
        supabase: auth.supabase,
        userId: auth.user?.id,
        userEmail: auth.user?.email,
      }),
    [auth.supabase, auth.user?.id, auth.user?.email]
  );

  const allowReorder = repository.mode === "guest-local";
  const repositoryKey = auth.user?.id ?? "guest";
  const isTeamLoading = loadedRepositoryKey !== repositoryKey;

  useEffect(() => {
    if (!isHydrated || auth.status === "loading") {
      return;
    }

    let isActive = true;

    repository
      .getTeam()
      .then((value) => {
        if (!isActive) {
          return;
        }

        setTeam(value);
        setTeamError(null);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setTeamError(error instanceof Error ? error.message : t("errors.generic"));
      })
      .finally(() => {
        if (isActive) {
          setLoadedRepositoryKey(repositoryKey);
        }
      });

    return () => {
      isActive = false;
    };
  }, [auth.status, isHydrated, repository, repositoryKey, t]);

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
      const nextTeam = await repository.createTeam(name);
      setTeam(nextTeam);
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
      const nextTeam = await repository.renameTeam(team.id, name);
      setTeam(nextTeam);
      setTeamError(null);
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : t("errors.generic"));
    }

    setIsEditingTeamName(false);
  };

  const handleAddPlayer = async (name: string): Promise<boolean> => {
    if (!team) {
      return false;
    }

    if (hasPlayerNameConflict(team, name)) {
      return false;
    }

    try {
      const nextTeam = await repository.addPlayer(team.id, name);
      setTeam(nextTeam);
      setTeamError(null);
      return true;
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : t("errors.generic"));
      return false;
    }
  };

  const handleRenamePlayer = async (
    playerId: string,
    name: string
  ): Promise<boolean> => {
    if (!team) {
      return false;
    }

    if (hasPlayerNameConflict(team, name, playerId)) {
      return false;
    }

    try {
      const nextTeam = await repository.renamePlayer(team.id, playerId, name);
      setTeam(nextTeam);
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
      const nextTeam = await repository.deletePlayer(team.id, playerId);
      setTeam(nextTeam);
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
      const nextTeam = await repository.reorderPlayer(team.id, playerId, direction);
      setTeam(nextTeam);
      setTeamError(null);
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : t("errors.generic"));
    }
  };

  return (
    <PageShell className="space-y-6">
      <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />

      {!isHydrated || auth.status === "loading" || isTeamLoading ? (
        <AppCard className="p-6 text-sm text-muted-foreground">{common("loading")}</AppCard>
      ) : null}

      {isHydrated && auth.status !== "loading" ? (
        <AppCard className="p-3 text-xs text-muted-foreground">
          {repository.mode === "guest-local"
            ? t("storage.guest")
            : t("storage.cloud")}
        </AppCard>
      ) : null}

      {teamError ? (
        <AppCard className="p-3 text-xs text-danger">{teamError}</AppCard>
      ) : null}

      {isHydrated && auth.status !== "loading" && !isTeamLoading && !team ? (
        <motion.div initial="hidden" animate="visible" variants={variants.fadeInUp}>
          <EmptyState
            icon={ShieldAlert}
            title={
              repository.mode === "guest-local"
                ? t("noTeam.title")
                : t("noTeamCloud.title")
            }
            description={
              repository.mode === "guest-local"
                ? t("noTeam.description")
                : t("noTeamCloud.description")
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
                  allowReorder={allowReorder}
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
