"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CalendarClock, MapPin, ShieldAlert, PlusCircle, ExternalLink, Link2Off, RefreshCcw } from "lucide-react";
import { generateMatchName, isAutoMatchName } from "@/lib/utils/matchName";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { getStoredMatchSetup } from "@/lib/storage/matchStorage";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FpButton } from "@/components/ui/FpButton";
import { teamTextInputClassName } from "@/components/team/styles";

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

function parseApiError(payload: unknown): { code: string; message: string } {
  if (typeof payload !== "object" || payload === null) {
    return { code: "UNKNOWN", message: "Ukjent feil." };
  }

  const value = payload as Record<string, unknown>;

  return {
    code: typeof value.errorCode === "string" ? value.errorCode : "UNKNOWN",
    message: typeof value.message === "string" ? value.message : "Ukjent feil.",
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

  const formatStatus = (status: MatchItem["status"]) => {
    if (status === "upcoming") {
      return t("status.planned");
    }

    if (status === "live") {
      return t("status.live");
    }

    if (status === "completed") {
      return t("status.completed");
    }

    return t("status.planned");
  };

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
        const parsed = parseApiError(payload);
        throw new Error(mapError(parsed.code, parsed.message));
      }

      const data = payload as { matches: MatchItem[] };
      setMatches(data.matches ?? []);
    } finally {
      setIsLoadingMatches(false);
    }
  }, [mapError, team]);

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
        const parsed = parseApiError(payload);
        throw new Error(mapError(parsed.code, parsed.message));
      }

      const data = payload as { events: SpondEventItem[]; syncedAt: string };
      setEvents(data.events ?? []);
      setEventsLastSyncedAt(data.syncedAt ?? new Date().toISOString());
    } finally {
      setIsLoadingEvents(false);
    }
  }, [mapError, team]);

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
        const parsed = parseApiError(payload);
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
        const parsed = parseApiError(payload);
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
        <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />
        <EmptyState
          icon={ShieldAlert}
          title={t("noTeamTitle")}
          description={t("noTeamDescription")}
          action={
            <Link href="/team">
              <FpButton variant="primary" size="md">{t("goToTeam")}</FpButton>
            </Link>
          }
        />
      </PageShell>
    );
  }

  if (isGuestMode) {
    return (
      <PageShell className="space-y-4">
        <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />
        <AppCard className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-foreground">{t("guest.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("guest.description")}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/match/setup">
              <FpButton variant="primary" size="md">{t("guest.startCta")}</FpButton>
            </Link>
            {hasActiveLocalMatch ? (
              <Link href="/match/live">
                <FpButton variant="secondary" size="md">{t("guest.resumeCta")}</FpButton>
              </Link>
            ) : null}
          </div>
        </AppCard>
        <AppCard className="p-3 text-xs text-muted-foreground">{t("guest.cloudHint")}</AppCard>
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

  if (!team) {
    return (
      <PageShell className="space-y-4">
        <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />
        <EmptyState
          icon={ShieldAlert}
          title={t("noTeamTitle")}
          description={t("noTeamDescription")}
          action={
            <Link href="/team">
              <FpButton variant="primary" size="md">{t("goToTeam")}</FpButton>
            </Link>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell className="space-y-5">
      <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />

      <AppCard className="p-3 text-xs text-muted-foreground">
        {t("activeTeam", { name: team.name })}
      </AppCard>

      {notice ? <AppCard className="p-3 text-xs text-fp-accent">{notice}</AppCard> : null}
      {error ? <AppCard className="p-3 text-xs text-danger">{error}</AppCard> : null}

      <AppCard className="space-y-3 p-4">
        {isResolvingEntryMode ? (
          <div className="rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-4 text-xs text-muted-foreground">
            {common("loading")}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={
                entryMode === "manual"
                  ? "tap-target rounded-xl border border-fp-cta/30 bg-fp-cta/10 px-3 py-2.5 text-xs font-semibold text-fp-cta"
                  : "tap-target rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-2.5 text-xs font-semibold text-muted-foreground"
              }
              onClick={() => setEntryMode("manual")}
            >
              {t("mode.manual")}
            </button>
            <button
              type="button"
              className={
                entryMode === "spond"
                  ? "tap-target rounded-xl border border-fp-spond-border bg-fp-spond-soft px-3 py-2.5 text-xs font-semibold text-fp-spond-foreground"
                  : "tap-target rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-2.5 text-xs font-semibold text-muted-foreground"
              }
              onClick={() => setEntryMode("spond")}
            >
              {t("mode.spond")}
            </button>
          </div>
        )}

        {isResolvingEntryMode ? (
          <p className="text-xs text-muted-foreground">{common("loading")}</p>
        ) : entryMode === "manual" ? (
          <>
            <div className="flex items-center gap-2">
              <PlusCircle size={16} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">{t("createTitle")}</h3>
            </div>

            <form onSubmit={handleCreateMatch} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={
                    manualStartMode === "now"
                      ? "tap-target rounded-xl border border-fp-cta/35 bg-fp-cta/10 px-3 py-2 text-xs font-semibold text-fp-cta"
                      : "tap-target rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-2 text-xs font-semibold text-muted-foreground"
                  }
                  onClick={() => setManualStartMode("now")}
                >
                  {t("manualStart.now")}
                </button>
                <button
                  type="button"
                  className={
                    manualStartMode === "scheduled"
                      ? "tap-target rounded-xl border border-fp-cta/35 bg-fp-cta/10 px-3 py-2 text-xs font-semibold text-fp-cta"
                      : "tap-target rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-2 text-xs font-semibold text-muted-foreground"
                  }
                  onClick={() => setManualStartMode("scheduled")}
                >
                  {t("manualStart.scheduled")}
                </button>
              </div>

              <input
                value={opponentName}
                onChange={(e) => setOpponentName(e.target.value)}
                placeholder={t("fields.opponent")}
                className={teamTextInputClassName}
              />
              <div className="space-y-1">
                <input
                  value={customTitle}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Stop auto-generating if user types; resume if they clear
                    setCustomTitle(isAutoMatchName(val) || val === "" ? "" : val);
                  }}
                  placeholder={autoTitle}
                  className={teamTextInputClassName}
                />
                <p className="px-1 text-[11px] text-muted-foreground">
                  {customTitle ? t("fields.titleCustom") : t("fields.titleAuto")}
                </p>
              </div>
              {manualStartMode === "scheduled" ? (
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className={teamTextInputClassName}
                  required
                />
              ) : (
                <p className="rounded-xl border border-fp-cta/20 bg-fp-cta/5 px-3 py-2 text-xs text-fp-cta">
                  {t("manualStart.nowHint")}
                </p>
              )}
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("fields.location")}
                className={teamTextInputClassName}
              />
              <FpButton type="submit" variant="primary" size="md" disabled={isCreating}>
                {isCreating ? t("creating") : t("createCta")}
              </FpButton>
            </form>
          </>
        ) : hasSpondLink ? (
          /* Spond mode — show events or empty state */
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("spondTitle")}
              </p>
              <FpButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void loadEvents().catch((cause) => {
                    setError(cause instanceof Error ? cause.message : t("errors.generic"));
                  });
                }}
                disabled={isLoadingEvents}
              >
                <RefreshCcw size={13} />
                {isLoadingEvents ? t("syncEventsLoading") : t("syncEventsCta")}
              </FpButton>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {t("lastEventsSync", { value: formatSyncedAt(eventsLastSyncedAt) })}
            </p>

            {isLoadingEvents ? (
              <p className="text-xs text-muted-foreground">{common("loading")}</p>
            ) : events.length === 0 ? (
              <div className="rounded-xl border border-fp-border bg-fp-surface-2 p-4 text-center space-y-2">
                <p className="text-sm font-semibold text-foreground">{t("mode.spondNoEventsTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("mode.spondNoEventsHint")}</p>
                <FpButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void loadEvents().catch((cause) => {
                      setError(cause instanceof Error ? cause.message : t("errors.generic"));
                    });
                  }}
                  disabled={isLoadingEvents}
                >
                  {t("syncEventsCta")}
                </FpButton>
              </div>
            ) : (
              <ul className="space-y-2">
                {events.map((event) => (
                  <li key={event.externalId} className="rounded-xl border border-fp-border bg-fp-surface-2 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold text-foreground truncate">{event.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(event.startsAt)}</p>
                        {event.location ? (
                          <p className="text-xs text-muted-foreground">{event.location}</p>
                        ) : null}
                      </div>
                      {event.importedMatchId ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="rounded-full border border-fp-spond-border bg-fp-spond-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fp-spond-foreground">
                            {t("alreadyImported")}
                          </span>
                          <Link href={`/match/${event.importedMatchId}`}>
                            <span className="text-xs font-medium text-primary">{t("openMatch")}</span>
                          </Link>
                        </div>
                      ) : (
                        <FpButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={loadingEventId === event.externalId}
                          onClick={() => {
                            void handleImportEvent(event.externalId);
                          }}
                        >
                          {loadingEventId === event.externalId ? t("importing") : t("importCta")}
                        </FpButton>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          /* Spond mode selected, but no link configured */
          <div className="rounded-xl border border-fp-border bg-fp-surface-2 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Link2Off size={16} className="text-muted-foreground shrink-0" />
              <p className="text-sm font-semibold text-foreground">{t("mode.spondNotLinkedTitle")}</p>
            </div>
            <p className="text-xs text-muted-foreground">{t("mode.spondNotLinkedHint")}</p>
            <Link href="/settings">
              <FpButton variant="secondary" size="sm">{t("mode.spondGoToSettings")}</FpButton>
            </Link>
          </div>
        )}
      </AppCard>

      <AppCard className="space-y-3 p-4">
        <h3 className="text-sm font-semibold text-foreground">{t("ongoingTitle")}</h3>

        {activeMatch ? (
          <div className="rounded-xl border border-fp-cta/30 bg-fp-cta/8 p-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-fp-cta font-semibold">{t("status.live")}</p>
            <p className="text-sm font-semibold text-foreground">{activeMatch.title}</p>
            <div className="grid grid-cols-2 gap-2">
              <Link href={activeMatchHref}>
                <FpButton variant="primary" size="sm" fullWidth>{t("activeActions.continue")}</FpButton>
              </Link>
              <FpButton
                variant="secondary"
                size="sm"
                fullWidth
                disabled={isResolvingActiveAction}
                onClick={() => {
                  setIsResolvingActiveAction(true);
                  void forceCloseActiveMatch()
                    .then(() => loadMatches())
                    .finally(() => setIsResolvingActiveAction(false));
                }}
              >
                {t("activeActions.end")}
              </FpButton>
            </div>
            <FpButton
              variant="danger"
              size="sm"
              fullWidth
              disabled={isResolvingActiveAction}
              onClick={() => {
                setIsResolvingActiveAction(true);
                void discardActiveMatch()
                  .then(() => loadMatches())
                  .finally(() => setIsResolvingActiveAction(false));
              }}
            >
              {t("activeActions.discard")}
            </FpButton>
          </div>
        ) : null}

        {ongoingMatches.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("ongoingEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {ongoingMatches.map((match) => (
              <li key={match.id} className="rounded-xl border border-fp-cta/25 bg-fp-cta/8 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-fp-cta/40 bg-fp-cta/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fp-cta">
                        {t("status.live")}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-foreground truncate">{match.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(match.startsAt)}</p>
                  </div>
                  <Link href={`/match/live?matchId=${encodeURIComponent(match.id)}`}>
                    <span className="text-xs font-semibold text-fp-cta">{t("activeActions.continue")}</span>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      <AppCard className="space-y-3 p-4">
        <h3 className="text-sm font-semibold text-foreground">{t("listTitle")}</h3>

        {isLoadingMatches ? (
          <p className="text-xs text-muted-foreground">{common("loading")}</p>
        ) : plannedMatches.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {plannedMatches.map((match) => (
              <li key={match.id} className="rounded-xl border border-fp-border bg-fp-surface-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground truncate">{match.title}</p>
                    {match.opponentName ? (
                      <p className="text-xs text-muted-foreground">{t("vs", { opponent: match.opponentName })}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarClock size={12} />
                      {formatDate(match.startsAt)}
                    </p>
                    {match.location ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin size={12} />
                        {match.location}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {match.source === "spond" ? (
                      <span className="rounded-full border border-fp-spond-border bg-fp-spond-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fp-spond-foreground">
                        {t("spondBadge")}
                      </span>
                    ) : null}
                    <span className={
                      match.status === "live"
                        ? "rounded-full border border-fp-cta/40 bg-fp-cta/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fp-cta"
                        : "rounded-full border border-fp-border bg-fp-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    }>
                      {formatStatus(match.status)}
                    </span>
                    <Link href={`/match/${match.id}`}>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-fp-cta">
                        {t("openMatch")}
                        <ExternalLink size={12} />
                      </span>
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      <AppCard className="p-3">
        <Link href="/historikk">
          <FpButton variant="secondary" size="md" fullWidth>
            {t("goToHistory")}
          </FpButton>
        </Link>
      </AppCard>
    </PageShell>
  );
}
