"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpDown, CheckCircle2, ChevronDown, ChevronUp, Users } from "lucide-react";
import { hasPlayerNameConflict } from "@/domain/team";
import { useTranslations } from "next-intl";
import { PageShell } from "@/components/ui/PageShell";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { Button, ConfirmSheet, EmptyState } from "@/components/ui/primitives";
import { PlayerList, isManagedPlayer, playerRowTestId } from "@/components/team/PlayerList";
import { PlayerEditSheet, type RenameResult } from "@/components/team/PlayerEditSheet";
import { PlayerQuickAddForm } from "@/components/team/PlayerQuickAddForm";
import { TeamNameForm } from "@/components/team/TeamNameForm";
import { variants } from "@/lib/tokens";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { Link } from "@/i18n/navigation";
import { useSpondStatus } from "@/components/team/useSpondStatus";
import { MatchDefaultsEditor } from "@/components/team/MatchDefaultsEditor";

/** Anchor for links to the team's match defaults (`/team#team-defaults`). */
export const TEAM_DEFAULTS_ID = "team-defaults";

export function TeamManager() {
  const t = useTranslations("team");
  const tDefaults = useTranslations("team.matchDefaults");
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
    | { kind: "team"; id: string; name: string; playerCount: number }
    | { kind: "player"; teamId: string; id: string; name: string }
    | null
  >(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // After a confirmed deletion the trigger is gone (its row, or the team), so
  // focus moves on instead: the add-player field, or the page's first control.
  // A cancelled player deletion goes back to the player's row (the sheet that
  // asked for it has closed).
  const deleteFinalFocus = useRef<HTMLElement | null>(null);
  const addPlayerInput = useRef<HTMLInputElement | null>(null);
  const playersHeadingId = useId();

  // UI-TEAM-01: a tap on a row opens the edit sheet. The player is kept after
  // closing so the sheet does not go blank while it slides out; `editSession`
  // remounts it with a fresh draft on every open. Edit target and reorder mode
  // are tied to the team they were started for, so switching teams ends them.
  const [editTarget, setEditTarget] = useState<{ teamId: string; playerId: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSession, setEditSession] = useState(0);
  const [reorderTeamId, setReorderTeamId] = useState<string | null>(null);
  // One polite status line for adds and deletions (WCAG 4.1.3).
  const [status, setStatus] = useState("");

  const spondConnected = useSpondStatus(workspace.activeTeam?.id ?? null, workspace.mode);

  // B1 (C5): /team#team-defaults, from Settings, opens the team settings and
  // brings the match defaults into view with focus on their heading. The hash
  // is an external value, so it is read in the mount effect (after commit, when
  // the router has updated the URL) and on every `hashchange`. A 0 ms timer here
  // disturbed the edit sheet's focus order in tests.
  const teamDefaultsRef = useRef<HTMLElement | null>(null);
  const [teamDefaultsRequest, setTeamDefaultsRequest] = useState(0);
  const handledTeamDefaultsRequest = useRef(0);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash !== `#${TEAM_DEFAULTS_ID}`) return;
      setShowTeamSettings(true);
      setIsEditingTeamName(false);
      setTeamDefaultsRequest((request) => request + 1);
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => {
      window.removeEventListener("hashchange", openFromHash);
    };
  }, []);

  // The panel animates its height open, so the section is only measured once
  // that animation has settled (`onAnimationComplete` below); when the panel is
  // already open the effect reveals it straight away. The effect runs after
  // every render until the section exists (the team may still be loading when
  // the hash arrives), then once per request.
  const teamSettingsSettled = useRef(false);
  const revealTeamDefaults = useCallback(() => {
    const section = teamDefaultsRef.current;
    if (teamDefaultsRequest === handledTeamDefaultsRequest.current || !section) return;
    handledTeamDefaultsRequest.current = teamDefaultsRequest;

    const reduceMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof section.scrollIntoView === "function") {
      section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
    // The editor's own heading when it has one, otherwise the section itself.
    const heading = section.querySelector<HTMLElement>("h2, h3, h4");
    const target = heading ?? section;
    if (heading && !heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    // C5-F1: the focused target shows the focus ring, also after a mouse or
    // touch on the Settings link (it stays until focus moves on).
    target.setAttribute("data-reveal-target", "");
    target.addEventListener("blur", () => target.removeAttribute("data-reveal-target"), { once: true });
    target.focus({ preventScroll: true });
  }, [teamDefaultsRequest]);

  useEffect(() => {
    if (teamSettingsSettled.current) revealTeamDefaults();
  });

  const team = workspace.activeTeam;

  const allowReorder = workspace.mode === "guest-local";
  const canReorder = allowReorder && (team?.players.length ?? 0) > 1;
  const isReordering = canReorder && reorderTeamId === team?.id;
  const editPlayer =
    team && editTarget?.teamId === team.id
      ? (team.players.find((player) => player.id === editTarget.playerId) ?? null)
      : null;

  const resolveTeamErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message === "PLAYER_MANAGED") {
      return t("errors.playerManagedCannotDelete");
    }
    return error instanceof Error ? error.message : t("errors.generic");
  };

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
      setStatus(t("players.added", { name }));
      return true;
    } catch (error) {
      setTeamError(resolveTeamErrorMessage(error));
      return false;
    }
  };

  // The edit sheet shows the outcome itself (the page behind it is inert), so
  // a failure is not routed to `teamError`.
  const handleRenamePlayer = async (playerId: string, name: string): Promise<RenameResult> => {
    if (!team) return "error";
    const player = team.players.find((candidate) => candidate.id === playerId);
    if (!player || isManagedPlayer(player)) return "error";
    if (hasPlayerNameConflict(team, name, playerId)) return "duplicate";
    try {
      await workspace.renamePlayer(team.id, playerId, name);
      setTeamError(null);
      return "ok";
    } catch {
      return "error";
    }
  };

  const handleDeletePlayer = async (teamId: string, playerId: string) => {
    if (!team || team.id !== teamId) return;
    const player = team.players.find((c) => c.id === playerId);
    if (!player || isManagedPlayer(player)) return;
    try {
      await workspace.deletePlayer(team.id, playerId);
      setTeamError(null);
      setStatus(t("players.deleted", { name: player.name }));
    } catch (error) {
      setTeamError(resolveTeamErrorMessage(error));
    }
  };

  const openPlayer = (playerId: string) => {
    if (!team) return;
    setEditTarget({ teamId: team.id, playerId });
    setEditSession((session) => session + 1);
    setEditOpen(true);
  };

  const requestDeletePlayer = (playerId: string) => {
    const player = team?.players.find((candidate) => candidate.id === playerId);
    if (!team || !player || isManagedPlayer(player)) return;
    setEditOpen(false);
    deleteFinalFocus.current = document.querySelector<HTMLElement>(`[data-testid="${playerRowTestId(player.id)}"]`);
    setDeleteTarget({ kind: "player", teamId: team.id, id: player.id, name: player.name });
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
        await handleDeletePlayer(deleteTarget.teamId, deleteTarget.id);
        setEditTarget(null);
        deleteFinalFocus.current = addPlayerInput.current;
      }
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleMovePlayer = async (playerId: string, direction: "up" | "down"): Promise<boolean> => {
    if (!team || !allowReorder) return false;
    try {
      await workspace.reorderPlayer(team.id, playerId, direction);
      setTeamError(null);
      return true;
    } catch (error) {
      setTeamError(resolveTeamErrorMessage(error));
      return false;
    }
  };

  return (
    <PageShell className="space-y-5">
      {/* ── Loading / error ───────────────────────────────────── */}
      {workspace.isLoading ? (
        <AppCard className="p-6 text-sm text-muted-foreground">{common("loading")}</AppCard>
      ) : null}

      {workspace.error ? (
        <AppCard className="p-3 text-sm text-fp-danger-text">{workspace.error}</AppCard>
      ) : null}

      {/* role="alert": a failed deletion is reported after its sheet has closed. */}
      {teamError ? (
        <AppCard className="p-3 text-sm text-fp-danger-text">
          <p role="alert">{teamError}</p>
        </AppCard>
      ) : null}

      {/* ── Empty state ───────────────────────────────────────── */}
      {!workspace.isLoading && workspace.teams.length === 0 ? (
        <motion.div initial="hidden" animate="visible" variants={variants.fadeInUp}>
          <EmptyState
            icon={Users}
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
                <p className="mb-0.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2">
                  {t("activeTeamLabel")}
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-foreground [overflow-wrap:anywhere]">
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
                      className={`tap-target rounded-full border px-3 py-1 text-sm font-semibold transition ${
                        isActive
                          ? "border-fp-lime bg-fp-lime text-fp-on-lime"
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
                onAnimationStart={() => {
                  teamSettingsSettled.current = false;
                }}
                onAnimationComplete={() => {
                  teamSettingsSettled.current = true;
                  revealTeamDefaults();
                }}
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
                          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2">
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
                    <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2">
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

                  {/* Match defaults. Settings links here (B1, C5). */}
                  <section
                    id={TEAM_DEFAULTS_ID}
                    ref={teamDefaultsRef}
                    tabIndex={-1}
                    aria-label={tDefaults("title")}
                    className="scroll-mt-20 p-4 outline-none [&_[data-reveal-target]]:rounded-[6px] [&_[data-reveal-target]]:outline-2 [&_[data-reveal-target]]:outline-offset-4 [&_[data-reveal-target]]:outline-fp-focus [&_[data-reveal-target]]:outline-solid data-[reveal-target]:outline-2 data-[reveal-target]:outline-fp-focus data-[reveal-target]:outline-solid"
                  >
                    <MatchDefaultsEditor teamId={team.id} />
                  </section>

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

          {/* ── 3. Players (UI-TEAM-01) ──────────────────────────
              Flat rows on the canvas, no card around them. A row opens the
              edit sheet; reordering is its own mode. */}
          {team ? (
            <motion.section variants={variants.fadeInUp} aria-labelledby={playersHeadingId} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={playersHeadingId} className="text-xl font-semibold tracking-tight text-foreground">
                    {t("players.title")}
                  </h2>
                  <p className="text-sm font-medium text-fp-ink-2 tabular-nums">
                    {t("players.count", { count: team.players.length })}
                  </p>
                </div>

                {canReorder ? (
                  isReordering ? (
                    <Button size="sm" variant="primary" onClick={() => setReorderTeamId(null)}>
                      {t("players.reorderDone")}
                    </Button>
                  ) : (
                    <Button size="sm" icon={<ArrowUpDown size={18} />} onClick={() => setReorderTeamId(team.id)}>
                      {t("players.reorder")}
                    </Button>
                  )
                ) : null}

                {/* Spond inline status */}
                {workspace.mode === "cloud" && spondConnected !== null ? (
                  <div className="shrink-0">
                    {spondConnected ? (
                      <button
                        type="button"
                        onClick={() => setShowSpondInfo((s) => !s)}
                        aria-expanded={showSpondInfo}
                        className="tap-target flex items-center gap-1.5 rounded-full border border-fp-spond-border/60 bg-fp-spond-soft px-3 py-1 text-[13px] font-semibold text-fp-spond-foreground transition-opacity hover:opacity-80"
                      >
                        <CheckCircle2 size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
                        {t("players.spondSynced")}
                      </button>
                    ) : (
                      <Link
                        href="/settings"
                        className="tap-target flex items-center gap-1.5 rounded-full border border-fp-border bg-fp-surface-2 px-3 py-1 text-[13px] font-semibold text-fp-ink-2"
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
                    <p className="rounded-xl border border-fp-spond-border/40 bg-fp-spond-soft px-3 py-2.5 text-sm text-fp-spond-foreground">
                      {t("players.spondSyncedInfo")}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <p role="status" className="sr-only">
                {status}
              </p>

              {isReordering ? (
                <p className="text-sm text-fp-ink-2">{t("players.reorderHint")}</p>
              ) : (
                <PlayerQuickAddForm
                  label={t("forms.playerNameLabel")}
                  placeholder={t("forms.playerNamePlaceholder")}
                  submitLabel={t("actions.addPlayer")}
                  validationMessage={t("validation.playerNameRequired")}
                  duplicateMessage={t("validation.playerNameDuplicate")}
                  onAddPlayer={handleAddPlayer}
                  inputRef={addPlayerInput}
                />
              )}

              {team.players.length === 0 ? (
                <EmptyState
                  icon={Users}
                  titleAs="h3"
                  title={t("players.emptyTitle")}
                  description={t("players.emptyDescription")}
                  testId="players-empty"
                />
              ) : (
                <PlayerList
                  key={isReordering ? "reorder" : "list"}
                  players={team.players}
                  reordering={isReordering}
                  onOpenPlayer={openPlayer}
                  onMovePlayer={handleMovePlayer}
                />
              )}
            </motion.section>
          ) : null}
        </motion.div>
      ) : null}

      <PlayerEditSheet
        key={editSession}
        player={editPlayer}
        open={editOpen && editPlayer !== null}
        onOpenChange={setEditOpen}
        onRename={handleRenamePlayer}
        onRequestDelete={requestDeletePlayer}
      />

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
