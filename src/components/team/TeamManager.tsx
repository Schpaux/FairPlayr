"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, ChevronUp, ShieldAlert, Users } from "lucide-react";
import { hasPlayerNameConflict } from "@/domain/team";
import { useTranslations } from "next-intl";
import { PageShell } from "@/components/ui/PageShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { Button, ConfirmSheet } from "@/components/ui/primitives";
import { PlayerList } from "@/components/team/PlayerList";
import { PlayerQuickAddForm } from "@/components/team/PlayerQuickAddForm";
import { TeamNameForm } from "@/components/team/TeamNameForm";
import { variants } from "@/lib/tokens";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { Link } from "@/i18n/navigation";
import { useSpondStatus } from "@/components/team/useSpondStatus";
import { MatchDefaultsEditor } from "@/components/team/MatchDefaultsEditor";

export function TeamManager() {
  const t = useTranslations("team");
  const common = useTranslations("common");
  const workspace = useTeamWorkspace();

  const [isEditingTeamName, setIsEditingTeamName] = useState(false);
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [showSpondInfo, setShowSpondInfo] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  // UI-A11Y-02: deleting a team or a player always goes through a
  // confirmation that says what is lost. Kept after closing, so the copy does
  // not change while the sheet slides out.
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: "team"; id: string; name: string; playerCount: number } | { kind: "player"; id: string; name: string } | null
  >(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // After a confirmed deletion the trigger is gone (its row, or the team), so
  // focus moves on instead: the add-player field, or the page's first control.
  const deleteFinalFocus = useRef<HTMLElement | null>(null);

  const spondConnected = useSpondStatus(workspace.activeTeam?.id ?? null, workspace.mode);

  const team = workspace.activeTeam;

  const allowReorder = workspace.mode === "guest-local";

  const resolveTeamErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message === "PLAYER_MANAGED") {
      return t("errors.playerManagedCannotDelete");
    }
    return error instanceof Error ? error.message : t("errors.generic");
  };

  const playerCopy = useMemo(
    () => ({
      rename: common("edit"),
      delete: common("delete"),
      moveUp: t("actions.moveUp"),
      moveDown: t("actions.moveDown"),
      sourceSpondBadge: t("playerSource.spondBadge"),
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
      setShowTeamSettings(false);
    } catch (error) {
      setTeamError(resolveTeamErrorMessage(error));
    }
  };

  const handleRenameTeam = async (name: string) => {
    if (!team) return;
    try {
      await workspace.renameTeam(team.id, name);
      setTeamError(null);
    } catch (error) {
      setTeamError(resolveTeamErrorMessage(error));
    }
    setIsEditingTeamName(false);
  };

  const handleDeleteTeam = async (teamId: string) => {
    try {
      await workspace.deleteTeam(teamId);
      setTeamError(null);
      setIsEditingTeamName(false);
      setShowTeamSettings(false);
    } catch (error) {
      setTeamError(resolveTeamErrorMessage(error));
    }
  };

  const handleAddPlayer = async (name: string): Promise<boolean> => {
    if (!team) return false;
    if (hasPlayerNameConflict(team, name)) return false;
    try {
      await workspace.addPlayer(team.id, name);
      setTeamError(null);
      return true;
    } catch (error) {
      setTeamError(resolveTeamErrorMessage(error));
      return false;
    }
  };

  const handleRenamePlayer = async (playerId: string, name: string): Promise<boolean> => {
    if (!team) return false;
    if (hasPlayerNameConflict(team, name, playerId)) return false;
    try {
      await workspace.renamePlayer(team.id, playerId, name);
      setTeamError(null);
      return true;
    } catch (error) {
      setTeamError(resolveTeamErrorMessage(error));
      return false;
    }
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (!team) return;
    const player = team.players.find((c) => c.id === playerId);
    if (player && (player.isManaged || player.source === "spond")) {
      return;
    }
    try {
      await workspace.deletePlayer(team.id, playerId);
      setTeamError(null);
    } catch (error) {
      setTeamError(resolveTeamErrorMessage(error));
    }
  };

  const requestDeletePlayer = (playerId: string) => {
    const player = team?.players.find((candidate) => candidate.id === playerId);
    if (!player || player.isManaged || player.source === "spond") return;
    deleteFinalFocus.current = null;
    setDeleteTarget({ kind: "player", id: player.id, name: player.name });
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.kind === "team") {
        await handleDeleteTeam(deleteTarget.id);
        deleteFinalFocus.current = document.querySelector("main");
      } else {
        await handleDeletePlayer(deleteTarget.id);
        deleteFinalFocus.current = document.getElementById("player-name-input");
      }
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleMovePlayer = async (playerId: string, direction: "up" | "down") => {
    if (!team || !allowReorder) return;
    try {
      await workspace.reorderPlayer(team.id, playerId, direction);
      setTeamError(null);
    } catch (error) {
      setTeamError(resolveTeamErrorMessage(error));
    }
  };

  return (
    <PageShell className="space-y-5">
      {/* ── Loading / error ───────────────────────────────────── */}
      {workspace.isLoading ? (
        <AppCard className="p-6 text-sm text-muted-foreground">{common("loading")}</AppCard>
      ) : null}

      {workspace.error ? (
        <AppCard className="p-3 text-xs text-danger">{workspace.error}</AppCard>
      ) : null}

      {/* role="alert": a failed deletion is reported after its sheet has closed. */}
      {teamError ? (
        <AppCard className="p-3 text-xs text-danger">
          <p role="alert">{teamError}</p>
        </AppCard>
      ) : null}

      {/* ── Empty state ───────────────────────────────────────── */}
      {!workspace.isLoading && workspace.teams.length === 0 ? (
        <motion.div initial="hidden" animate="visible" variants={variants.fadeInUp}>
          <EmptyState
            icon={ShieldAlert}
            title={workspace.mode === "guest-local" ? t("noTeam.title") : t("noTeamCloud.title")}
            description={
              workspace.mode === "guest-local"
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

      {/* ── Main content ─────────────────────────────────────── */}
      {workspace.teams.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={variants.staggerContainer}
          className="space-y-5"
        >
          {/* ── 1. Page header: active team ───────────────────── */}
          <motion.div variants={variants.fadeInUp}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("activeTeamLabel")}
                </p>
                <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
                  {team?.name ?? "—"}
                </h1>
              </div>
              <FpButton
                type="button"
                variant="ghost"
                size="sm"
                className="tap-target mt-1 shrink-0 gap-1.5 text-muted-foreground"
                onClick={() => {
                  setShowTeamSettings((s) => !s);
                  setIsEditingTeamName(false);
                }}
                aria-expanded={showTeamSettings}
              >
                {showTeamSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {t("teamSettings")}
              </FpButton>
            </div>

            {/* Team switcher chips – only when multiple teams */}
            {workspace.teams.length > 1 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {workspace.teams.map((candidate) => {
                  const isActive = candidate.id === workspace.activeTeamId;
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => void workspace.setActiveTeam(candidate.id)}
                      className={`tap-target rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                        isActive
                          ? "border-fp-cta/40 bg-fp-cta/15 text-fp-cta"
                          : "border-fp-border bg-fp-surface-2 text-muted-foreground"
                      }`}
                    >
                      {candidate.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </motion.div>

          {/* ── 2. Team settings panel (collapsible) ─────────── */}
          <AnimatePresence initial={false}>
            {showTeamSettings && team ? (
              <motion.div
                key="team-settings"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                style={{ overflow: "hidden" }}
                variants={variants.fadeInUp}
              >
                <AppCard className="divide-y divide-fp-border overflow-hidden p-0">
                  {/* Rename */}
                  <div className="p-4">
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
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("teamCard.label")}
                          </p>
                          <p className="text-sm font-medium text-foreground">{team.name}</p>
                        </div>
                        <FpButton
                          variant="secondary"
                          size="sm"
                          className="tap-target shrink-0"
                          onClick={() => setIsEditingTeamName(true)}
                        >
                          {common("edit")}
                        </FpButton>
                      </div>
                    )}
                  </div>

                  {/* Create new team */}
                  <div className="p-4">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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

                  {/* Match defaults */}
                  <div className="p-4">
                    <MatchDefaultsEditor teamId={team.id} />
                  </div>

                  {/* Delete team – danger zone. Destructive only inside its
                      confirmation (DESIGN.md §5.7). */}
                  <div className="p-4">
                    <Button
                      size="sm"
                      onClick={() => {
                        deleteFinalFocus.current = null;
                        setDeleteTarget({ kind: "team", id: team.id, name: team.name, playerCount: team.players.length });
                        setDeleteOpen(true);
                      }}
                    >
                      {t("actions.deleteTeam")}
                    </Button>
                  </div>
                </AppCard>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* ── 3. Players section ────────────────────────────── */}
          {team ? (
            <motion.div variants={variants.fadeInUp}>
              <AppCard className="space-y-4">
                {/* Players header + Spond status */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {t("players.title")}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {t("players.count", { count: team.players.length })}
                    </p>
                  </div>

                  {/* Spond inline status */}
                  {workspace.mode === "cloud" && spondConnected !== null ? (
                    <div className="shrink-0">
                      {spondConnected ? (
                        <button
                          type="button"
                          onClick={() => setShowSpondInfo((s) => !s)}
                          className="tap-target flex items-center gap-1.5 rounded-full border border-fp-spond-border/60 bg-fp-spond-soft px-2.5 py-1 text-[11px] font-semibold text-fp-spond-foreground transition-opacity hover:opacity-80"
                        >
                          <CheckCircle2 size={11} className="shrink-0" />
                          {t("players.spondSynced")}
                        </button>
                      ) : (
                        <Link
                          href="/settings"
                          className="tap-target flex items-center gap-1.5 rounded-full border border-fp-border bg-fp-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                        >
                          {t("players.spondConnect")}
                        </Link>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Spond info popover (toggle on badge tap) */}
                <AnimatePresence initial={false}>
                  {showSpondInfo ? (
                    <motion.div
                      key="spond-info"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15, ease: "easeInOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <p className="rounded-xl border border-fp-spond-border/40 bg-fp-spond-soft px-3 py-2.5 text-xs text-fp-spond-foreground">
                        {t("players.spondSyncedInfo")}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

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
                    onDeletePlayer={requestDeletePlayer}
                    onMovePlayer={handleMovePlayer}
                  />
                )}
              </AppCard>
            </motion.div>
          ) : null}
        </motion.div>
      ) : null}

      <ConfirmSheet
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={
          deleteTarget?.kind === "player"
            ? t("deletePlayerConfirm.title", { name: deleteTarget.name })
            : t("deleteTeamConfirm.title", { name: deleteTarget?.name ?? "" })
        }
        description={
          deleteTarget?.kind === "player"
            ? t("deletePlayerConfirm.description", { name: deleteTarget.name })
            : t(workspace.mode === "cloud" ? "deleteTeamConfirm.descriptionCloud" : "deleteTeamConfirm.descriptionLocal", {
                count: deleteTarget?.kind === "team" ? deleteTarget.playerCount : 0,
              })
        }
        confirmLabel={deleteTarget?.kind === "player" ? t("deletePlayerConfirm.confirm") : t("deleteTeamConfirm.confirm")}
        destructive
        pending={isDeleting}
        onConfirm={() => void confirmDelete()}
        finalFocus={deleteFinalFocus}
        testId="delete-confirm"
      />
    </PageShell>
  );
}
