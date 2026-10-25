"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { CalendarClock, MapPin, Link2Off, RefreshCcw, Users } from "lucide-react";
import { generateMatchName, isAutoMatchName } from "@/lib/utils/matchName";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { getStoredMatchSetup } from "@/lib/storage/matchStorage";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import {
  Button,
  ButtonLink,
  EmptyState,
  ListGroup,
  ListRow,
  Notice,
  SegmentedChoice,
} from "@/components/ui/primitives";
import { teamTextInputClassName } from "@/components/team/styles";
import { ActiveMatchCloseConfirm, useActiveMatchCloseConfirm } from "@/components/match/ActiveMatchCloseConfirm";

/** A flat panel: surface on canvas, 1px rule, 14px radius (DESIGN.md §4). */
const PANEL_CLASS = "space-y-3 rounded-[14px] border border-fp-rule bg-fp-surface p-4";

interface MatchItem {
  id: string;
  title: string;
  opponentName: string | null;
  startsAt: string;
  location: string | null;
  format?: "3v3" | "5v5" | "7v7" | "9v9" | "11v11";
  status: "draft" | "upcoming" | "live" | "completed";
  reportEnabled?: boolean;
  reportStatus?: "not_requested" | "pending" | "ready" | "failed";
  reportText?: string | null;
  scoreFor?: number;
  scoreAgainst?: number;
  source: "manual" | "spond";
  startedAt?: string | null;
  endedAt?: string | null;
}

interface SpondEventItem {
  externalId: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  importedMatchId: string | null;
}

function parseApiError(payload: unknown, unknownMessage: string): { code: string; message: string } {
  if (typeof payload !== "object" || payload === null) {
    return { code: "UNKNOWN", message: unknownMessage };
  }

  const value = payload as Record<string, unknown>;

  return {
    code: typeof value.errorCode === "string" ? value.errorCode : "UNKNOWN",
    message: typeof value.message === "string" ? value.message : unknownMessage,
  };
}

function toLocalDateTimeInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/** Visible field label (DESIGN.md §3 Label: 13px caps), as in PlayerQuickAddForm. */
const PLANNER_LABEL = "block px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2";

export function MatchPlannerManager() {
  const t = useTranslations("matchPlanner");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const auth = useAuth();
  const workspace = useTeamWorkspace();
  const {
    activeMatch,
    activeMatchHref,
    forceCloseActiveMatch,
    discardActiveMatch,
  } = useActiveMatch();
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [events, setEvents] = useState<SpondEventItem[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isResolvingEntryMode, setIsResolvingEntryMode] = useState(false);
  const [loadingEventId, setLoadingEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [eventsLastSyncedAt, setEventsLastSyncedAt] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<"manual" | "spond" | null>(null);
  const [hasSpondLink, setHasSpondLink] = useState(false);
  const [manualStartMode, setManualStartMode] = useState<"now" | "scheduled">("now");
  const [isResolvingActiveAction, setIsResolvingActiveAction] = useState(false);
  const closeConfirm = useActiveMatchCloseConfirm(async (action) => {
    setIsResolvingActiveAction(true);
    try {
      await (action === "end" ? forceCloseActiveMatch() : discardActiveMatch());
      await loadMatches();
    } catch {
      setError(t("errors.generic"));
    } finally {
      setIsResolvingActiveAction(false);
    }
  });

  // Custom title only set when user has deliberately typed one
  const [customTitle, setCustomTitle] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [startsAt, setStartsAt] = useState(() => {
    return toLocalDateTimeInputValue(new Date());
  });
  const [location, setLocation] = useState("");

  // Derived: the effective title shown/sent — auto-generated unless overridden
  const startsAtDate = useMemo(() => {
    const d = new Date(startsAt);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [startsAt]);
  const autoTitle = generateMatchName(opponentName || null, startsAtDate);
  const effectiveTitle = customTitle || autoTitle;

  const team = workspace.activeTeam;
  const isGuestMode = workspace.mode === "guest-local" || auth.status !== "authenticated";
  const hasActiveLocalMatch = useMemo(() => {
    if (!isHydrated) {
      return false;
    }

    const stored = getStoredMatchSetup();
    return Boolean(stored?.status === "active");
  }, [isHydrated]);

  const plannedMatches = useMemo(
    () =>
      matches
        .filter((match) => match.status !== "completed" && match.status !== "live")
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [matches]
  );

  const ongoingMatches = useMemo(
    () =>
      matches
        .filter((match) => match.status === "live")
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
    [matches]
  );

  const formatDate = (value: string | null) => {
    if (!value) {
      return t("unknownTime");
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return t("unknownTime");
    }

    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const mapError = useCallback((code: string, fallback: string) => {
    switch (code) {
      case "UNAUTHORIZED":
        return t("errors.unauthorized");
      case "TEAM_NOT_FOUND":
        return t("errors.teamAccess");
      case "TEAM_LINK_NOT_FOUND":
        return t("errors.teamLinkMissing");
      case "CONNECTION_NOT_FOUND":
        return t("errors.spondNotConnected");
      case "EVENT_NOT_FOUND":
        return t("errors.eventNotFound");
      case "EVENT_MISSING_START":
        return t("errors.eventMissingStart");
      case "ACTIVE_MATCH_EXISTS":
        return t("errors.activeMatchExists");
      default:
        return fallback;
    }
  }, [t]);

  const formatSyncedAt = (value: string | null) => {
    if (!value) {
      return t("neverSynced");
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return t("neverSynced");
    }

    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const loadMatches = useCallback(async () => {
    if (!team) {
      return;
    }

    setIsLoadingMatches(true);

    try {
      const response = await fetch(`/api/matches?teamId=${encodeURIComponent(team.id)}`, {
        method: "GET",
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const parsed = parseApiError(payload, t("errors.unknown"));
        throw new Error(mapError(parsed.code, parsed.message));
      }

      const data = payload as { matches: MatchItem[] };
      setMatches(data.matches ?? []);
    } finally {
      setIsLoadingMatches(false);
    }
  }, [mapError, t, team]);

  const loadEvents = useCallback(async () => {
    if (!team) {
      return;
    }

    setIsLoadingEvents(true);

    try {
      const response = await fetch("/api/integrations/spond/sync-events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ teamId: team.id }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const parsed = parseApiError(payload, t("errors.unknown"));
        throw new Error(mapError(parsed.code, parsed.message));
      }

      const data = payload as { events: SpondEventItem[]; syncedAt: string };
      setEvents(data.events ?? []);
      setEventsLastSyncedAt(data.syncedAt ?? new Date().toISOString());
    } finally {
      setIsLoadingEvents(false);
    }
  }, [mapError, t, team]);

  useEffect(() => {
    if (auth.status !== "authenticated" || !team) {
      return;
    }

    setError(null);
    setIsResolvingEntryMode(true);

    void (async () => {
      try {
        await loadMatches();

        const statusResponse = await fetch(`/api/integrations/spond/status?teamId=${encodeURIComponent(team.id)}`);
        const statusPayload = (await statusResponse.json()) as {
          connected?: boolean;
          teamLink?: { externalTeamId: string } | null;
        };

        if (statusResponse.ok) {
          const linked = Boolean(statusPayload.connected && statusPayload.teamLink?.externalTeamId);
          setHasSpondLink(linked);
          // DEL 1: always default to manual — Spond is accessible but not pre-selected
          setEntryMode("manual");
        } else {
          setHasSpondLink(false);
          setEntryMode("manual");
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("errors.generic"));
        setEntryMode("manual");
      } finally {
        setIsResolvingEntryMode(false);
      }
    })();
  }, [auth.status, loadMatches, team, t]);

  const handleCreateMatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!team) {
      return;
    }

    setError(null);
    setNotice(null);
    setIsCreating(true);

    try {
      const startsAtIso =
        manualStartMode === "now"
          ? new Date().toISOString()
          : new Date(startsAt).toISOString();
      const status = manualStartMode === "now" ? "draft" : "upcoming";

      const response = await fetch("/api/matches", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          teamId: team.id,
          title: effectiveTitle,
          opponentName,
          startsAt: startsAtIso,
          location,
          status,
        }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const parsed = parseApiError(payload, t("errors.unknown"));
        throw new Error(mapError(parsed.code, parsed.message));
      }

      const data = payload as { match: MatchItem };

      setCustomTitle("");
      setOpponentName("");
      setLocation("");
      setNotice(
        manualStartMode === "now" ? t("createdNowNotice") : t("createdNotice")
      );
      await loadMatches();

      if (manualStartMode === "now") {
        router.push(`/match/setup?matchId=${encodeURIComponent(data.match.id)}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleImportEvent = async (externalEventId: string) => {
    if (!team) {
      return;
    }

    setError(null);
    setNotice(null);
    setLoadingEventId(externalEventId);

    try {
      const response = await fetch("/api/integrations/spond/import-event", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          teamId: team.id,
          externalEventId,
        }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const parsed = parseApiError(payload, t("errors.unknown"));
        throw new Error(mapError(parsed.code, parsed.message));
      }

      const data = payload as { matchId: string; alreadyImported: boolean };
      setNotice(data.alreadyImported ? t("alreadyImportedNotice") : t("importedNotice"));
      await Promise.all([loadMatches(), loadEvents()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setLoadingEventId(null);
    }
  };


  if (!isHydrated || auth.status === "loading" || workspace.isLoading) {
    return (
      <PageShell>
        <AppCard className="p-6 text-sm text-muted-foreground">{common("loading")}</AppCard>
      </PageShell>
    );
  }

  if (isGuestMode && !team) {
    return (
      <PageShell className="space-y-4">
        <SectionHeader title={t("title")} />
        <EmptyState
          icon={Users}
          title={t("noTeamTitle")}
          description={t("noTeamDescription")}
          action={
            <ButtonLink href="/team" variant="primary" size="sm">{t("goToTeam")}</ButtonLink>
          }
        />
      </PageShell>
    );
  }

  if (isGuestMode) {
    return (
      <PageShell className="space-y-5">
        <SectionHeader title={t("title")} />

        {/* A match in progress comes first (C1). */}
        {hasActiveLocalMatch ? (
          <section aria-labelledby="planner-ongoing-title" className="space-y-2" data-testid="planner-ongoing">
            <Kicker id="planner-ongoing-title">{t("ongoingTitle")}</Kicker>
            <ButtonLink href="/match/live" variant="primary" block>{t("guest.resumeCta")}</ButtonLink>
          </section>
        ) : null}

        <section aria-labelledby="planner-guest-title" className={PANEL_CLASS} data-testid="planner-new-match">
          <h2 id="planner-guest-title" className="text-base font-semibold text-fp-ink">{t("guest.title")}</h2>
          <p className="text-sm text-fp-ink-2">{t("guest.description")}</p>
          <ButtonLink href="/match/setup" variant={hasActiveLocalMatch ? "secondary" : "primary"} block>
            {t("guest.startCta")}
          </ButtonLink>
        </section>

        <p className="px-1 text-sm text-fp-ink-2">{t("guest.cloudHint")}</p>
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

  if (!team) {
    return (
      <PageShell className="space-y-4">
        <SectionHeader title={t("title")} />
        <EmptyState
          icon={Users}
          title={t("noTeamTitle")}
          description={t("noTeamDescription")}
          action={
            <ButtonLink href="/team" variant="primary" size="sm">{t("goToTeam")}</ButtonLink>
          }
        />
      </PageShell>
    );
  }

  const activeMatchTitle = activeMatch ? activeMatch.title || t("deviceMatchTitle") : "";
  const hasOngoing = Boolean(activeMatch) || ongoingMatches.length > 0;
  const refreshEvents = () => {
    void loadEvents().catch((cause) => {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    });
  };

  return (
    <PageShell className="space-y-6">
      <SectionHeader title={t("title")} />

      {/* C1: a match in progress (this device's and other live matches)
          comes first, directly under the title. Nothing ongoing, nothing shown. */}
      {hasOngoing ? (
        <section aria-labelledby="planner-ongoing-title" className="space-y-2" data-testid="planner-ongoing">
          <Kicker id="planner-ongoing-title">{t("ongoingTitle")}</Kicker>

          {activeMatch ? (
            <div
              role="group"
              aria-labelledby="planner-device-match-title"
              className={PANEL_CLASS}
              data-testid="planner-device-match"
            >
              <p id="planner-device-match-title" className="text-base font-semibold leading-tight text-fp-ink">
                {activeMatchTitle}
              </p>
              <ButtonLink href={activeMatchHref} variant="primary" block>
                {t("activeActions.continue")}
              </ButtonLink>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  block
                  disabled={isResolvingActiveAction}
                  onClick={() => closeConfirm.request("end", activeMatchTitle)}
                >
                  {t("activeActions.end")}
                </Button>
                {/* Destructive only inside its confirmation (DESIGN.md §5.7). */}
                <Button
                  variant="ghost"
                  size="sm"
                  block
                  disabled={isResolvingActiveAction}
                  onClick={() => closeConfirm.request("discard", activeMatchTitle)}
                >
                  {t("activeActions.discard")}
                </Button>
              </div>
            </div>
          ) : null}

          {ongoingMatches.length > 0 ? (
            <ListGroup aria-label={t("ongoingTitle")} testId="planner-ongoing-list">
              {ongoingMatches.map((match) => (
                <ListRow
                  key={match.id}
                  label={match.title}
                  description={formatDate(match.startsAt)}
                  trailing={
                    /* The live screen always shows this device's match, so only
                       that one continues there; any other opens its own page. */
                    activeMatch?.serverMatchId === match.id ? (
                      <ButtonLink href={activeMatchHref} variant="primary" size="sm">{t("activeActions.continue")}</ButtonLink>
                    ) : (
                      <ButtonLink href={`/match/${encodeURIComponent(match.id)}`} variant="secondary" size="sm">{t("ongoingResolve")}</ButtonLink>
                    )
                  }
                />
              ))}
            </ListGroup>
          ) : null}
        </section>
      ) : null}
      {/* Outside the card: it must be able to slide out after the match closes. */}
      <ActiveMatchCloseConfirm state={closeConfirm} />

      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <section aria-labelledby="planner-new-title" className="space-y-2" data-testid="planner-new-match">
        <Kicker id="planner-new-title">{t("newMatchTitle")}</Kicker>
        <div className={PANEL_CLASS}>
          {isResolvingEntryMode || entryMode === null ? (
            <p className="text-sm text-fp-ink-2">{common("loading")}</p>
          ) : (
            <>
              <SegmentedChoice
                label={t("mode.label")}
                hideLabel
                options={[
                  { value: "manual", label: t("mode.manual") },
                  { value: "spond", label: t("mode.spond") },
                ]}
                value={entryMode}
                onValueChange={setEntryMode}
              />

              {entryMode === "manual" ? (
                <form onSubmit={handleCreateMatch} className="space-y-3">
                  <SegmentedChoice
                    label={t("manualStart.label")}
                    hideLabel
                    options={[
                      { value: "now", label: t("manualStart.now") },
                      { value: "scheduled", label: t("manualStart.scheduled") },
                    ]}
                    value={manualStartMode}
                    onValueChange={setManualStartMode}
                  />

                  {/* C1-F4: visible labels (DESIGN.md §7.1), so a field keeps
                      its name while typing. */}
                  <div className="space-y-1.5">
                    <label htmlFor="planner-opponent" className={PLANNER_LABEL}>
                      {t("fields.opponent")}
                    </label>
                    <input
                      id="planner-opponent"
                      value={opponentName}
                      onChange={(e) => setOpponentName(e.target.value)}
                      autoComplete="off"
                      className={teamTextInputClassName}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="planner-title" className={PLANNER_LABEL}>
                      {t("fields.title")}
                    </label>
                    <input
                      id="planner-title"
                      autoComplete="off"
                      value={customTitle}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Stop auto-generating if user types; resume if they clear
                        setCustomTitle(isAutoMatchName(val) || val === "" ? "" : val);
                      }}
                      placeholder={autoTitle}
                      aria-describedby="planner-title-hint"
                      className={teamTextInputClassName}
                    />
                    <p id="planner-title-hint" className="px-1 text-[13px] text-fp-ink-2">
                      {customTitle ? t("fields.titleCustom") : t("fields.titleAuto")}
                    </p>
                  </div>
                  {manualStartMode === "scheduled" ? (
                    <div className="space-y-1.5">
                      <label htmlFor="planner-starts-at" className={PLANNER_LABEL}>
                        {t("fields.startsAt")}
                      </label>
                      <input
                        id="planner-starts-at"
                        type="datetime-local"
                        value={startsAt}
                        onChange={(e) => setStartsAt(e.target.value)}
                        className={teamTextInputClassName}
                        required
                      />
                    </div>
                  ) : (
                    <p className="px-1 text-sm text-fp-ink-2">{t("manualStart.nowHint")}</p>
                  )}
                  <div className="space-y-1.5">
                    <label htmlFor="planner-location" className={PLANNER_LABEL}>
                      {t("fields.location")}
                    </label>
                    <input
                      id="planner-location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className={teamTextInputClassName}
                    />
                  </div>
                  {/* Lime only when it is the next action: with a match in
                      progress, continuing that one is (DESIGN.md §1). */}
                  <Button type="submit" variant={activeMatch ? "secondary" : "primary"} block disabled={isCreating}>
                    {isCreating ? t("creating") : t("createCta")}
                  </Button>
                </form>
              ) : hasSpondLink ? (
                /* Spond mode: events or empty state */
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-fp-ink">{t("spondTitle")}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<RefreshCcw size={16} strokeWidth={1.75} />}
                      onClick={refreshEvents}
                      disabled={isLoadingEvents}
                    >
                      {isLoadingEvents ? t("syncEventsLoading") : t("syncEventsCta")}
                    </Button>
                  </div>

                  <p className="text-[13px] text-fp-ink-2">
                    {t("lastEventsSync", { value: formatSyncedAt(eventsLastSyncedAt) })}
                  </p>

                  {isLoadingEvents ? (
                    <p className="text-sm text-fp-ink-2">{common("loading")}</p>
                  ) : events.length === 0 ? (
                    <EmptyState
                      titleAs="h3"
                      title={t("mode.spondNoEventsTitle")}
                      description={t("mode.spondNoEventsHint")}
                      action={
                        <Button size="sm" onClick={refreshEvents} disabled={isLoadingEvents}>
                          {t("syncEventsCta")}
                        </Button>
                      }
                    />
                  ) : (
                    <ListGroup aria-label={t("spondTitle")} testId="planner-spond-events">
                      {events.map((event) => (
                        <ListRow
                          key={event.externalId}
                          label={event.title}
                          description={
                            <>
                              {formatDate(event.startsAt)}
                              {event.location ? <span className="block">{event.location}</span> : null}
                              {event.importedMatchId ? <span className="block">{t("alreadyImported")}</span> : null}
                            </>
                          }
                          trailing={
                            event.importedMatchId ? (
                              <ButtonLink href={`/match/${event.importedMatchId}`} variant="ghost" size="sm">
                                {t("openMatch")}
                              </ButtonLink>
                            ) : (
                              <Button
                                size="sm"
                                disabled={loadingEventId === event.externalId}
                                onClick={() => {
                                  void handleImportEvent(event.externalId);
                                }}
                              >
                                {loadingEventId === event.externalId ? t("importing") : t("importCta")}
                              </Button>
                            )
                          }
                        />
                      ))}
                    </ListGroup>
                  )}
                </div>
              ) : (
                /* Spond mode selected, but no link configured */
                <EmptyState
                  icon={Link2Off}
                  titleAs="h3"
                  title={t("mode.spondNotLinkedTitle")}
                  description={t("mode.spondNotLinkedHint")}
                  action={<ButtonLink href="/settings" size="sm">{t("mode.spondGoToSettings")}</ButtonLink>}
                />
              )}
            </>
          )}
        </div>
      </section>

      <ListGroup title={t("listTitle")} testId="planner-planned">
        {isLoadingMatches ? (
          <ListRow label={<span className="text-fp-ink-2">{common("loading")}</span>} />
        ) : plannedMatches.length === 0 ? (
          <ListRow label={<span className="text-fp-ink-2">{t("empty")}</span>} />
        ) : (
          plannedMatches.map((match) => (
            <ListRow
              key={match.id}
              href={`/match/${match.id}`}
              label={match.title}
              description={
                <>
                  {match.opponentName ? <span className="block">{t("vs", { opponent: match.opponentName })}</span> : null}
                  <span className="flex items-center gap-1">
                    <CalendarClock size={14} strokeWidth={1.75} aria-hidden />
                    {formatDate(match.startsAt)}
                  </span>
                  {match.location ? (
                    <span className="flex items-center gap-1">
                      <MapPin size={14} strokeWidth={1.75} aria-hidden />
                      {match.location}
                    </span>
                  ) : null}
                </>
              }
              trailing={
                match.source === "spond" ? (
                  <span className="rounded-md border border-fp-spond-border bg-fp-spond-soft px-2 py-0.5 text-[13px] font-semibold text-fp-spond-foreground">
                    {t("spondBadge")}
                  </span>
                ) : null
              }
            />
          ))
        )}
      </ListGroup>

      <ButtonLink href="/historikk" variant="secondary" block>
        {t("goToHistory")}
      </ButtonLink>
    </PageShell>
  );
}

/** Section kicker: Inter 600 13, caps, +6 % (DESIGN.md §3 "Label"). */
function Kicker({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="px-1 text-[13px] font-semibold uppercase leading-tight tracking-[0.06em] text-fp-ink-2">
      {children}
    </h2>
  );
}
