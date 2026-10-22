"use client";

/**
 * Match setup (/match/setup), Modern Sideline (UI-MS-01a, DESIGN.md §7).
 *
 * The order follows what the coach needs on the sideline: who is here today
 * (attendance), the starting lineup on the pitch, the match settings
 * (collapsed to one summary row) and a sticky bar with the squad count,
 * readiness and Start kamp. A new setup starts with the whole squad present
 * (U9) but nobody on the pitch, so the match cannot start until the coach
 * fills the lineup.
 */

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { ShieldAlert, Users, CheckCircle2, CircleDashed, PlayCircle } from "lucide-react";
import {
  setMatchFormat,
  setMatchDuration,
  setMatchHalves,
  setMatchDurationPreset,
  setReportEnabled,
  setSelectedSquad,
  toggleSquadPlayer,
  selectAllSquad,
  autoFillLineup,
  getFormationPresets,
  setMatchFormation,
  getRequiredStarters,
  getStarterDeficit,
  canStartMatch,
} from "@/domain/match";
import type { MatchConfig } from "@/domain/match";
import { chooseInitialSetup } from "@/domain/matchSetupInit";
import styles from "@/components/live/LiveScreen.module.css";
import {
  discardMatchSetupDraft,
  getStoredMatchSetup,
  saveMatchSetupDraft,
} from "@/lib/storage/matchStorage";
import { liveHrefFor, startLocalMatch } from "@/lib/match/activeMatchRecovery";
import { getTeamMatchPrefs } from "@/lib/storage/teamPrefsStorage";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppCard } from "@/components/ui/AppCard";
import { Button, ButtonLink, Notice } from "@/components/ui/primitives";
import { ActiveMatchCloseConfirm, useActiveMatchCloseConfirm } from "@/components/match/ActiveMatchCloseConfirm";
import { FormatSelector } from "@/components/match/FormatSelector";
import { DurationPicker } from "@/components/match/DurationPicker";
import { FormationSelector } from "@/components/match/FormationSelector";
import { SquadSelector } from "@/components/match/SquadSelector";
import { PitchLineupEditor } from "@/components/match/PitchLineupEditor";
import { cn } from "@/lib/utils";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";

// ─── Layout pieces ────────────────────────────────────────────────────────────

/** A setup section: a 20px title over its content (DESIGN.md §3). */
function SetupSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-xl font-semibold tracking-[-0.01em] text-fp-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A 13px caps kicker over one setting inside the expanded settings. */
function SettingLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2">{children}</h3>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MatchSetupManager() {
  const t = useTranslations("matchSetup");
  const uid = useId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useTeamWorkspace();
  const {
    activeMatch,
    activeMatchHref,
    recoveryMatch,
    recoveryMatchHref,
    hasActiveConflict,
    forceCloseActiveMatch,
    discardActiveMatch,
  } = useActiveMatch();
  // What the start guard is about: this device's match, or (when the device
  // runs none) a server match that is still live.
  const conflictMatch = activeMatch ?? recoveryMatch;
  const conflictHref = activeMatch ? activeMatchHref : recoveryMatchHref ?? activeMatchHref;
  const matchId = searchParams.get("matchId");

  // ── Hydration guard ────────────────────────────────────────────────────────
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // ── State ──────────────────────────────────────────────────────────────────
  const [setup, setSetup] = useState<MatchConfig | null>(null);
  // Match settings are one collapsed summary row until the coach opens them.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // True once the coach changes something here. Only then is the draft saved,
  // so opening setup never writes anything.
  const [hasEdits, setHasEdits] = useState(false);
  // True while showing an unfinished draft instead of the team defaults.
  const [isResumedDraft, setIsResumedDraft] = useState(false);
  // Set while a started match owns the stored setup: the editor is replaced by
  // a route back to that match, so setup can never demote or overwrite it.
  const [activeLiveHref, setActiveLiveHref] = useState<string | null>(null);

  const team = workspace.activeTeam;

  useEffect(() => {
    if (!isHydrated || workspace.isLoading) return;

    const stored = getStoredMatchSetup();

    if (stored?.status === "active") {
      setActiveLiveHref(liveHrefFor(stored.serverMatchId));
      setSetup(null);
      return;
    }
    setActiveLiveHref(null);

    if (!team) {
      setSetup(null);
      return;
    }

    // A new setup starts with the whole squad present (U9) and nobody on the
    // pitch. A resumed draft keeps its own selection exactly.
    const initial = chooseInitialSetup(
      stored,
      getTeamMatchPrefs(team.id),
      team.id,
      team.players.map((p) => p.id),
      { preselectSquad: true }
    );
    if (initial.kind === "active") return;

    // Resume an unfinished draft (labelled as such), otherwise start from the
    // team defaults. Nothing is stored until the coach changes something.
    setSetup(initial.setup);
    setIsResumedDraft(initial.kind === "resume");
    setHasEdits(false);
    setSettingsOpen(false);
  }, [isHydrated, team, workspace.isLoading]);

  // ── Persist draft on every edit (never on open) ────────────────────────────
  useEffect(() => {
    if (!isHydrated || !setup || !hasEdits) return;
    if (!saveMatchSetupDraft(setup)) {
      // A match became active (e.g. in another tab) and owns the stored setup:
      // show the way to it rather than an editor whose changes are not saved.
      setActiveLiveHref(liveHrefFor(getStoredMatchSetup()?.serverMatchId));
      setSetup(null);
    }
  }, [setup, isHydrated, hasEdits]);

  // Changes here belong to this match only; team defaults are edited in team
  // settings and are never written from setup.
  const editSetup = (update: (prev: MatchConfig) => MatchConfig) => {
    setHasEdits(true);
    setSetup((prev) => (prev ? update(prev) : prev));
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleStartFromDefaults = () => {
    if (!team) return;
    if (!discardMatchSetupDraft()) {
      setActiveLiveHref(liveHrefFor(getStoredMatchSetup()?.serverMatchId));
      setSetup(null);
      return;
    }
    // The same fresh start as opening setup: team defaults, whole squad,
    // empty pitch. Nothing is stored until the coach changes something.
    const initial = chooseInitialSetup(
      null,
      getTeamMatchPrefs(team.id),
      team.id,
      team.players.map((p) => p.id),
      { preselectSquad: true }
    );
    if (initial.kind !== "fresh") return;
    setSetup(initial.setup);
    setIsResumedDraft(false);
    setHasEdits(false);
    setSettingsOpen(false);
  };

  const handleFormatChange: React.ComponentProps<
    typeof FormatSelector
  >["onChange"] = (format) => {
    editSetup((prev) => setMatchFormat(prev, format));
  };

  const handleDurationChange: React.ComponentProps<
    typeof DurationPicker
  >["onCustomChange"] = (minutes) => {
    editSetup((prev) => setMatchDuration(prev, minutes));
  };

  const handleDurationPresetChange: React.ComponentProps<
    typeof DurationPicker
  >["onPresetChange"] = (presetId) => {
    editSetup((prev) => setMatchDurationPreset(prev, presetId));
  };

  const handleHalvesChange: React.ComponentProps<
    typeof DurationPicker
  >["onHalvesChange"] = (halves) => {
    editSetup((prev) => setMatchHalves(prev, halves));
  };

  const handleFormationChange: React.ComponentProps<
    typeof FormationSelector
  >["onChange"] = (formationId) => {
    editSetup((prev) => setMatchFormation(prev, formationId));
  };

  const handleReportToggle = (enabled: boolean) => {
    editSetup((prev) => setReportEnabled(prev, enabled));
  };

  const handleToggleSquadPlayer = (playerId: string) => {
    editSetup((prev) => toggleSquadPlayer(prev, playerId));
  };

  const handleSelectAllSquad = () => {
    if (!team) return;
    editSetup((prev) => selectAllSquad(prev, team.players.map((p) => p.id)));
  };

  const handleClearSquad = () => {
    editSetup((prev) => setSelectedSquad(prev, []));
  };

  // ── Start match ────────────────────────────────────────────────────────────
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [showStartGuard, setShowStartGuard] = useState(false);
  const startNoticesRef = useRef<HTMLDivElement>(null);

  // The guard opens above the sticky bar; bring it into view, wherever the
  // coach had scrolled to.
  useEffect(() => {
    if (showStartGuard) startNoticesRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [showStartGuard]);
  const [isResolvingGuardAction, setIsResolvingGuardAction] = useState(false);
  const closeConfirm = useActiveMatchCloseConfirm(async (action) => {
    setIsResolvingGuardAction(true);
    try {
      await (action === "end" ? forceCloseActiveMatch() : discardActiveMatch());
      setShowStartGuard(false);
    } catch {
      setStartError(t("errors.startFailed"));
    } finally {
      setIsResolvingGuardAction(false);
    }
  });

  const handleStartMatch = async () => {
    if (!setup || !canStartMatch(setup)) return;

    if (hasActiveConflict(matchId)) {
      setShowStartGuard(true);
      return;
    }

    setStartError(null);
    setIsStarting(true);

    let started: ReturnType<typeof startLocalMatch>;
    try {
      started = startLocalMatch(setup, matchId, { squadPlayers: team?.players });
    } catch {
      // Not saved on the device (full, or a newer build's data): the match
      // must not start without being stored.
      setStartError(t("errors.startFailed"));
      setIsStarting(false);
      return;
    }
    if (!started.ok) {
      // Another match became active (e.g. in another tab): keep it, show the
      // way back to it instead of starting over it.
      setActiveLiveHref(liveHrefFor(getStoredMatchSetup()?.serverMatchId));
      setIsStarting(false);
      return;
    }

    try {
      if (matchId) {
        const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
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
      setStartError(
        cause instanceof Error ? cause.message : t("errors.startFailed")
      );
      setIsStarting(false);
      return;
    }

    setIsStarting(false);
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const matchReady = setup ? canStartMatch(setup) : false;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (!isHydrated || workspace.isLoading) {
    return (
      <PageShell>
        <AppCard className="p-6 text-sm text-fp-ink-2 animate-pulse">&nbsp;</AppCard>
      </PageShell>
    );
  }

  if (workspace.error) {
    return (
      <PageShell>
        <Notice tone="error">{workspace.error}</Notice>
      </PageShell>
    );
  }

  if (activeLiveHref) {
    return (
      <PageShell>
        <SectionHeader title={t("title")} />
        <EmptyState
          icon={PlayCircle}
          title={t("activeMatch.title")}
          description={t("activeMatch.description")}
          action={
            <ButtonLink href={activeLiveHref} variant="primary" size="sm">{t("activeMatch.continue")}</ButtonLink>
          }
        />
      </PageShell>
    );
  }

  if (!team) {
    return (
      <PageShell>
        <SectionHeader title={t("title")} />
        <EmptyState
          icon={ShieldAlert}
          title={t("noTeam.title")}
          description={t("noTeam.description")}
          action={
            <ButtonLink href="/team" variant="primary" size="sm">{t("noTeam.action")}</ButtonLink>
          }
        />
      </PageShell>
    );
  }

  if (team.players.length === 0) {
    return (
      <PageShell>
        <SectionHeader title={t("title")} />
        <EmptyState
          icon={Users}
          title={t("noPlayers.title")}
          description={t("noPlayers.description")}
          action={
            <ButtonLink href="/team" variant="primary" size="sm">{t("noPlayers.action")}</ButtonLink>
          }
        />
      </PageShell>
    );
  }

  if (!setup) return null;

  const squadCount = setup.selectedPlayerIds.length;
  const required = getRequiredStarters(setup);
  const starterDeficit = getStarterDeficit(setup);
  const blockedReason = matchReady
    ? null
    : starterDeficit > 0
      ? t("footer.blockedStarters", { count: starterDeficit })
      : setup.duration.totalMinutes <= 0
        ? t("footer.blockedDuration")
        : t("footer.blockedLineup");
  const formationShape =
    getFormationPresets(setup.format).find((f) => f.id === setup.formationId)?.shape ?? setup.formationId;
  const durationSummary =
    setup.duration.halves === 2
      ? t("compact.durationHalves", { halves: 2, minutes: setup.duration.minutesPerHalf })
      : t("compact.durationTotal", { minutes: setup.duration.totalMinutes });
  const conflictTitle = conflictMatch?.title || t("startGuard.unknownMatch");

  return (
    <PageShell className="space-y-8 pb-0">
      <SectionHeader title={t("title")} className="mb-0" />

      {isResumedDraft ? (
        <Notice
          announce="off"
          title={t("draft.resumed")}
          action={
            <Button size="sm" onClick={handleStartFromDefaults}>
              {t("draft.startFromDefaults")}
            </Button>
          }
        >
          {t("draft.replaceHint")}
        </Notice>
      ) : null}

      {/* 1. Who is here today (attendance) */}
      <SetupSection id={`${uid}-squad`} title={t("sections.squad")}>
        <SquadSelector
          players={team.players}
          selectedIds={setup.selectedPlayerIds}
          onToggle={handleToggleSquadPlayer}
          onSelectAll={handleSelectAllSquad}
          onClearSelection={handleClearSquad}
          selectAllLabel={t("squad.selectAll")}
          clearLabel={t("squad.clear")}
          labelledBy={`${uid}-squad`}
        />
      </SetupSection>

      {/* 2. Starting lineup: pitch and bench, once anyone is in the squad */}
      {squadCount > 0 ? (
        <SetupSection id={`${uid}-lineup`} title={t("sections.lineup")}>
          <PitchLineupEditor
            setup={setup}
            players={team.players.filter((p) =>
              setup.selectedPlayerIds.includes(p.id)
            )}
            onSetupChange={(next) => editSetup(() => next)}
            onAutoFill={() => editSetup(autoFillLineup)}
          />
        </SetupSection>
      ) : null}

      {/* 3. Match settings: one summary row, collapsed by default */}
      <section
        aria-labelledby={`${uid}-settings`}
        className="overflow-hidden rounded-[14px] border border-fp-rule bg-fp-surface"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <h2 id={`${uid}-settings`} className="text-base font-semibold text-fp-ink">
              {t("compact.title")}
            </h2>
            <p className="mt-0.5 text-sm font-medium tabular-nums text-fp-ink-2">
              <span>{setup.format}</span>
              <span aria-hidden> · </span>
              <span className="sr-only">, </span>
              <span>{formationShape}</span>
              <span aria-hidden> · </span>
              <span className="sr-only">, </span>
              <span>{durationSummary}</span>
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            aria-expanded={settingsOpen}
            aria-controls={settingsOpen ? `${uid}-settings-panel` : undefined}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            {t("compact.edit")}
          </Button>
        </div>

        {settingsOpen ? (
          <div id={`${uid}-settings-panel`} className="space-y-5 border-t border-fp-rule p-4">
            <div>
              <SettingLabel>{t("sections.format")}</SettingLabel>
              <FormatSelector value={setup.format} onChange={handleFormatChange} />
            </div>
            <div>
              <SettingLabel>{t("sections.formation")}</SettingLabel>
              <FormationSelector
                formations={getFormationPresets(setup.format)}
                value={setup.formationId}
                onChange={handleFormationChange}
              />
            </div>
            <div>
              <SettingLabel>{t("sections.duration")}</SettingLabel>
              <DurationPicker
                value={setup.duration}
                onPresetChange={handleDurationPresetChange}
                onCustomChange={handleDurationChange}
                onHalvesChange={handleHalvesChange}
              />
            </div>
          </div>
        ) : null}

        {/* The whole row is the switch's target (DESIGN.md §4). */}
        <button
          type="button"
          role="switch"
          aria-checked={setup.reportEnabled}
          aria-labelledby={`${uid}-report-label`}
          aria-describedby={`${uid}-report-help`}
          onClick={() => handleReportToggle(!setup.reportEnabled)}
          className="flex min-h-16 w-full items-center gap-4 border-t border-fp-rule p-4 text-left transition-colors duration-(--fp-d-quick) focus-visible:ring-inset focus-visible:ring-offset-0 active:bg-fp-surface-2"
        >
          <span className="min-w-0 flex-1">
            <span id={`${uid}-report-label`} className="block text-base font-semibold text-fp-ink">
              {t("reportToggle.label")}
            </span>
            <span id={`${uid}-report-help`} className="mt-1 block text-sm text-fp-ink-2">
              {t("reportToggle.help")}
            </span>
          </span>
          <span
            aria-hidden
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-(--fp-d-quick)",
              setup.reportEnabled
                ? "border-fp-control-line bg-fp-lime"
                : "border-fp-control-line bg-fp-surface-2"
            )}
          >
            <span
              className={cn(
                "absolute top-[3px] left-[3px] h-5 w-5 rounded-full transition-transform duration-(--fp-d-base) ease-fp-out",
                setup.reportEnabled ? "translate-x-5 bg-fp-on-lime" : "translate-x-0 bg-fp-ink-2"
              )}
            />
          </span>
        </button>
      </section>

      {/* 4. Start guard and start errors, right above the bar: kept out of
          the sticky bar so they never cover the squad or the pitch. */}
      <div ref={startNoticesRef} className="space-y-3 empty:hidden">
        {startError ? <Notice tone="error">{startError}</Notice> : null}

        {showStartGuard ? (
          <Notice
            tone="warning"
            title={t("startGuard.title")}
            action={
              <div className="grid gap-2">
                <ButtonLink href={conflictHref} variant="primary" size="sm" block>
                  {t("startGuard.continue")}
                </ButtonLink>
                <Button
                  size="sm"
                  block
                  disabled={isResolvingGuardAction}
                  onClick={() => closeConfirm.request("end", conflictTitle)}
                >
                  {t("startGuard.end")}
                </Button>
                {/* Destructive only inside its confirmation (DESIGN.md §5.7). */}
                <Button
                  variant="ghost"
                  size="sm"
                  block
                  disabled={isResolvingGuardAction}
                  onClick={() => closeConfirm.request("discard", conflictTitle)}
                >
                  {t("startGuard.discard")}
                </Button>
              </div>
            }
          >
            {t("startGuard.description", { title: conflictTitle })}
          </Notice>
        ) : null}
        <ActiveMatchCloseConfirm state={closeConfirm} />
      </div>

      {/* 5. Sticky bar above the bottom nav and the safe area: squad, pitch,
          readiness and Start kamp. */}
      <div
        data-testid="setup-start-bar"
        className={cn(styles.setupStartBar, "z-40 -mx-4 space-y-3 border-t border-fp-rule bg-fp-canvas px-4 pt-3 pb-4")}
      >
        <div className="flex items-center justify-between gap-3 text-sm font-medium">
          <p className="min-w-0 tabular-nums text-fp-ink">
            <span>{t("footer.squad", { count: squadCount })}</span>
            <span aria-hidden className="text-fp-ink-2"> · </span>
            <span>{t("footer.onPitch", { current: setup.startingPlayerIds.length, required })}</span>
          </p>
          <p
            id={`${uid}-ready`}
            className={cn(
              "flex shrink-0 items-center gap-1.5",
              matchReady ? "text-fp-ok-text" : "text-fp-ink-2"
            )}
          >
            {matchReady ? (
              <CheckCircle2 size={16} aria-hidden />
            ) : (
              <CircleDashed size={16} aria-hidden />
            )}
            {matchReady ? t("footer.ready") : t("footer.notReady")}
          </p>
        </div>

        {/* A disabled button can't take focus, so the reason it is locked sits
            in reading order right before it, and is its description too. */}
        {blockedReason ? (
          <p id={`${uid}-blocked`} className="sr-only">
            {blockedReason}
          </p>
        ) : null}

        <Button
          variant="primary"
          block
          aria-describedby={blockedReason ? `${uid}-blocked` : `${uid}-ready`}
          disabled={!matchReady || isStarting}
          onClick={() => {
            void handleStartMatch();
          }}
        >
          {isStarting ? t("actions.starting") : t("startMatch")}
        </Button>
      </div>
    </PageShell>
  );
}
