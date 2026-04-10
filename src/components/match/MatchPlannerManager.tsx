"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, MapPin, ShieldAlert, PlusCircle, ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
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
  status: "draft" | "upcoming" | "live" | "completed";
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
  const auth = useAuth();
  const workspace = useTeamWorkspace();

  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [events, setEvents] = useState<SpondEventItem[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [loadingEventId, setLoadingEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [eventsLastSyncedAt, setEventsLastSyncedAt] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<"manual" | "spond">("manual");
  const [hasSpondLink, setHasSpondLink] = useState(false);

  const [title, setTitle] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [startsAt, setStartsAt] = useState(() => {
    const oneHourAhead = new Date(Date.now() + 60 * 60 * 1000);
    return toLocalDateTimeInputValue(oneHourAhead);
  });
  const [location, setLocation] = useState("");

  const team = workspace.activeTeam;

  const sortedMatches = useMemo(
    () => [...matches].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
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
          setEntryMode(linked ? "spond" : "manual");
        } else {
          setHasSpondLink(false);
          setEntryMode("manual");
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("errors.generic"));
      }
    })();
  }, [auth.status, loadEvents, loadMatches, team, t]);

  const handleCreateMatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!team) {
      return;
    }

    setError(null);
    setNotice(null);
    setIsCreating(true);

    try {
      const startsAtIso = new Date(startsAt).toISOString();

      const response = await fetch("/api/matches", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          teamId: team.id,
          title,
          opponentName,
          startsAt: startsAtIso,
          location,
          status: "upcoming",
        }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const parsed = parseApiError(payload);
        throw new Error(mapError(parsed.code, parsed.message));
      }

      setTitle("");
      setOpponentName("");
      setLocation("");
      setNotice(t("createdNotice"));
      await loadMatches();
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

  if (auth.status === "loading" || workspace.isLoading) {
    return (
      <PageShell>
        <AppCard className="p-6 text-sm text-muted-foreground">{common("loading")}</AppCard>
      </PageShell>
    );
  }

  if (auth.status !== "authenticated") {
    return (
      <PageShell className="space-y-4">
        <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />
        <EmptyState
          icon={ShieldAlert}
          title={t("loginRequiredTitle")}
          description={t("loginRequiredDescription")}
          action={
            <Link href="/auth/sign-in">
              <FpButton variant="primary" size="md">{t("loginCta")}</FpButton>
            </Link>
          }
        />
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
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={
              entryMode === "manual"
                ? "tap-target rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"
                : "tap-target rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-2 text-xs font-semibold text-muted-foreground"
            }
            onClick={() => setEntryMode("manual")}
          >
            {t("mode.manual")}
          </button>
          <button
            type="button"
            className={
              entryMode === "spond"
                ? "tap-target rounded-xl border border-fp-spond-border bg-fp-spond-soft px-3 py-2 text-xs font-semibold text-fp-spond-foreground"
                : "tap-target rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-2 text-xs font-semibold text-muted-foreground"
            }
            onClick={() => setEntryMode("spond")}
            disabled={!hasSpondLink}
          >
            {t("mode.spond")}
          </button>
        </div>

        {!hasSpondLink ? (
          <p className="text-xs text-muted-foreground">{t("mode.spondHint")}</p>
        ) : null}

        {entryMode === "manual" ? (
          <>
            <div className="flex items-center gap-2">
              <PlusCircle size={16} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">{t("createTitle")}</h3>
            </div>

            <form onSubmit={handleCreateMatch} className="space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("fields.title")}
                className={teamTextInputClassName}
                required
              />
              <input
                value={opponentName}
                onChange={(e) => setOpponentName(e.target.value)}
                placeholder={t("fields.opponent")}
                className={teamTextInputClassName}
              />
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={teamTextInputClassName}
                required
              />
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
        ) : (
          <p className="text-xs text-muted-foreground">{t("mode.spondActiveHint")}</p>
        )}
      </AppCard>

      <AppCard className="space-y-3 p-4">
        <h3 className="text-sm font-semibold text-foreground">{t("listTitle")}</h3>

        {isLoadingMatches ? (
          <p className="text-xs text-muted-foreground">{common("loading")}</p>
        ) : sortedMatches.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {sortedMatches.map((match) => (
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
                    <span className="rounded-full border border-fp-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {formatStatus(match.status)}
                    </span>
                    <Link href={`/match/${match.id}`}>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
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

      {hasSpondLink ? (
      <AppCard className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">{t("spondTitle")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("lastEventsSync", { value: formatSyncedAt(eventsLastSyncedAt) })}
            </p>
          </div>
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
            {isLoadingEvents ? t("syncEventsLoading") : t("syncEventsCta")}
          </FpButton>
        </div>

        {isLoadingEvents ? (
          <p className="text-xs text-muted-foreground">{common("loading")}</p>
        ) : events.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noEvents")}</p>
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
      </AppCard>
      ) : null}
    </PageShell>
  );
}
