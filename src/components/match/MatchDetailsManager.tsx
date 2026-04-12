"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeftRight, Loader2, ShieldAlert, Sparkles, Users } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FpButton } from "@/components/ui/FpButton";
import type { Player } from "@/domain/team";
import {
  createGoalEvent,
  createMatchEndedEvent,
  createMatchStartedEvent,
  createSubstitutionEvent,
  normalizeMatchEvents,
  type MatchEvent,
} from "@/domain/matchEvent";

interface MatchRuntimeState {
  initialOnFieldPlayerIds?: string[];
  onFieldPlayerIds?: string[];
  benchPlayerIds?: string[];
  events?: unknown;
}

type TimelineEvent = MatchEvent & {
  source: "runtime" | "server";
  serverEventId: string | null;
};

interface MatchDetails {
  id: string;
  title: string;
  teamId: string;
  opponentName: string | null;
  startsAt: string;
  location: string | null;
  format: "3v3" | "5v5" | "7v7" | "9v9" | "11v11";
  status: "draft" | "upcoming" | "live" | "completed";
  source: "manual" | "spond";
  externalEventId: string | null;
  rsvpLastSyncedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  scoreFor: number;
  scoreAgainst: number;
  reportEnabled: boolean;
  reportStatus: "not_requested" | "pending" | "ready" | "failed";
  reportText: string | null;
  reportGeneratedAt?: string | null;
  runtimeState?: MatchRuntimeState | null;
}

interface MatchEventItem {
  id: string;
  matchId: string;
  type:
    | "goal_for"
    | "goal_against"
    | "substitution"
    | "penalty"
    | "corner"
    | "free_kick"
    | "card_yellow"
    | "card_red"
    | "own_goal"
    | "period_start"
    | "period_end";
  minute: number | null;
  timestampMs: number | null;
  teamSide: "own" | "opponent" | null;
  primaryPlayerId: string | null;
  secondaryPlayerId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

function parseApiError(payload: unknown): { message: string } {
  if (typeof payload !== "object" || payload === null) {
    return { message: "Ukjent feil." };
  }

  const value = payload as Record<string, unknown>;

  return {
    message: typeof value.message === "string" ? value.message : "Ukjent feil.",
  };
}

function payloadName(payload: Record<string, unknown> | null, key: string): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function MatchDetailsManager({ matchId }: { matchId: string }) {
  const t = useTranslations("matchPlanner");
  const common = useTranslations("common");
  const locale = useLocale();
  const auth = useAuth();
  const router = useRouter();
  const { refreshActiveMatch } = useActiveMatch();
  const workspace = useTeamWorkspace();

  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [events, setEvents] = useState<MatchEventItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<MatchEventItem | null>(null);
  const [editMinute, setEditMinute] = useState<string>("");
  const [editScorerId, setEditScorerId] = useState<string>("");
  const [editAssistId, setEditAssistId] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const playerOptions = useMemo(() => {
    if (!match) {
      return [] as Player[];
    }

    const team = workspace.teams.find((item) => item.id === match.teamId) ?? null;
    return team?.players ?? [];
  }, [match, workspace.teams]);

  const playerById = useMemo(() => {
    return new Map(playerOptions.map((player) => [player.id, player]));
  }, [playerOptions]);

  const sortedServerEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const aTime = a.timestampMs ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.timestampMs ?? Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) {
        return aTime - bTime;
      }

      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [events]);

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const runtimeEvents = normalizeMatchEvents(match?.runtimeState?.events);

    if (runtimeEvents.length > 0) {
      const runtimeTimeline: TimelineEvent[] = runtimeEvents
        .map((event) => ({ ...event, source: "runtime" as const, serverEventId: null }))
        .sort((a, b) => {
          const aTime = a.timestampMs ?? Number.MAX_SAFE_INTEGER;
          const bTime = b.timestampMs ?? Number.MAX_SAFE_INTEGER;
          if (aTime !== bTime) {
            return aTime - bTime;
          }

          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });

      return runtimeTimeline;
    }

    return sortedServerEvents.flatMap<TimelineEvent>((event) => {
        if (event.type === "goal_for") {
          return [{
            ...createGoalEvent({
              id: event.id,
              minute: event.minute,
              timestampMs: event.timestampMs,
              createdAt: event.createdAt,
              teamSide: "own",
              scorerPlayerId: event.primaryPlayerId,
              scorerName: payloadName(event.payload, "primaryPlayerName"),
              assistPlayerId: event.secondaryPlayerId,
              assistName: payloadName(event.payload, "secondaryPlayerName"),
            }),
            source: "server" as const,
            serverEventId: event.id,
          }];
        }

        if (event.type === "goal_against") {
          return [{
            ...createGoalEvent({
              id: event.id,
              minute: event.minute,
              timestampMs: event.timestampMs,
              createdAt: event.createdAt,
              teamSide: "opponent",
              scorerPlayerId: event.primaryPlayerId,
              scorerName: payloadName(event.payload, "primaryPlayerName"),
              assistPlayerId: event.secondaryPlayerId,
              assistName: payloadName(event.payload, "secondaryPlayerName"),
            }),
            source: "server" as const,
            serverEventId: event.id,
          }];
        }

        if (event.type === "substitution") {
          return [{
            ...createSubstitutionEvent({
              id: event.id,
              minute: event.minute,
              timestampMs: event.timestampMs,
              createdAt: event.createdAt,
              inPlayerId: event.primaryPlayerId,
              inPlayerName: payloadName(event.payload, "inPlayerName"),
              outPlayerId: event.secondaryPlayerId,
              outPlayerName: payloadName(event.payload, "outPlayerName"),
            }),
            source: "server" as const,
            serverEventId: event.id,
          }];
        }

        if (event.type === "period_start") {
          return [{
            ...createMatchStartedEvent({
              id: event.id,
              minute: event.minute,
              timestampMs: event.timestampMs,
              createdAt: event.createdAt,
            }),
            source: "server" as const,
            serverEventId: event.id,
          }];
        }

        if (event.type === "period_end") {
          return [{
            ...createMatchEndedEvent({
              id: event.id,
              minute: event.minute,
              timestampMs: event.timestampMs,
              createdAt: event.createdAt,
            }),
            source: "server" as const,
            serverEventId: event.id,
          }];
        }

        return [];
      });
  }, [match?.runtimeState?.events, sortedServerEvents]);

  // Playing time per player, derived from live match accumulated time tracking
  const playerTimes = useMemo(() => {
    const runtimeState = match?.runtimeState as Record<string, unknown> | null | undefined;
    const accumulated = runtimeState?.playerAccumulatedMs;
    if (!accumulated || typeof accumulated !== "object" || Array.isArray(accumulated)) {
      return [];
    }

    return Object.entries(accumulated as Record<string, unknown>)
      .map(([playerId, ms]) => {
        const name = playerById.get(playerId)?.name;
        const minutes = Math.round((typeof ms === "number" && Number.isFinite(ms) ? ms : 0) / 60000);
        return name && minutes > 0 ? { name, minutes } : null;
      })
      .filter((entry): entry is { name: string; minutes: number } => entry !== null)
      .sort((a, b) => b.minutes - a.minutes);
  }, [match?.runtimeState, playerById]);

  const formatDate = (value: string | null) => {
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

  useEffect(() => {
    if (auth.status !== "authenticated") {
      setIsLoading(false);
      return;
    }

    void (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [matchResponse, eventsResponse] = await Promise.all([
          fetch(`/api/matches/${encodeURIComponent(matchId)}`, { method: "GET" }),
          fetch(`/api/matches/${encodeURIComponent(matchId)}/events`, { method: "GET" }),
        ]);

        const matchPayload = (await matchResponse.json()) as unknown;
        if (!matchResponse.ok) {
          throw new Error(parseApiError(matchPayload).message);
        }

        const eventsPayload = (await eventsResponse.json()) as unknown;
        if (!eventsResponse.ok) {
          throw new Error(parseApiError(eventsPayload).message);
        }

        const matchData = matchPayload as { match: MatchDetails };
        const eventData = eventsPayload as { events: MatchEventItem[] };

        setMatch(matchData.match);
        setEvents(eventData.events ?? []);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : t("errors.generic");
        setError(message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [auth.status, matchId, t]);

  const handleStatusChange = async (status: "live" | "completed") => {
    if (!match) {
      return;
    }

    setError(null);
    setNotice(null);
    setIsUpdatingStatus(true);

    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const payload = (await response.json()) as { message?: string; match?: MatchDetails };

      if (!response.ok) {
        throw new Error(payload.message ?? t("errors.generic"));
      }

      const nextMatch = payload.match ?? null;
      const resolvedMatch = nextMatch ?? match;

      if (nextMatch) {
        setMatch(nextMatch);
      }

      await refreshActiveMatch();

      if (status === "live") {
        router.push(`/match/setup?matchId=${encodeURIComponent(resolvedMatch.id)}`);
      } else {
        setNotice(t("completedNotice"));
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("errors.generic");
      setError(message);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const openEditModal = (event: MatchEventItem) => {
    setEditingEvent(event);
    setEditMinute(event.minute === null ? "" : String(event.minute));
    setEditScorerId(event.primaryPlayerId ?? "");
    setEditAssistId(event.secondaryPlayerId ?? "");
  };

  const handleSaveEdit = async () => {
    if (!match || !editingEvent) {
      return;
    }

    setIsSavingEdit(true);
    setError(null);

    try {
      const scorerName = editScorerId ? playerById.get(editScorerId)?.name ?? null : null;
      const assistName = editAssistId ? playerById.get(editAssistId)?.name ?? null : null;
      const mergedPayload: Record<string, unknown> = {
        ...(editingEvent.payload ?? {}),
        primaryPlayerName: scorerName,
        secondaryPlayerName: assistName,
      };

      const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}/events/${encodeURIComponent(editingEvent.id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          minute: editMinute ? Number(editMinute) : null,
          primaryPlayerId: editScorerId || null,
          secondaryPlayerId: editAssistId || null,
          payload: mergedPayload,
        }),
      });

      const payload = (await response.json()) as { event?: MatchEventItem; message?: string };

      if (!response.ok || !payload.event) {
        throw new Error(payload.message ?? t("errors.generic"));
      }

      setEvents((previous) => previous.map((event) => (event.id === payload.event?.id ? payload.event : event)));
      setEditingEvent(null);
      setNotice(t("event.editSaved"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!match || !editingEvent) {
      return;
    }

    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}/events/${encodeURIComponent(editingEvent.id)}`, {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await response.json()) as unknown;
        throw new Error(parseApiError(payload).message);
      }

      setEvents((previous) => previous.filter((event) => event.id !== editingEvent.id));
      setEditingEvent(null);
      setNotice(t("event.deleted"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    }
  };

  const handleDeleteMatch = async () => {
    if (!match) return;

    setError(null);
    setShowDeleteConfirm(false);

    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}`, {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await response.json()) as unknown;
        throw new Error(parseApiError(payload).message);
      }

      router.push("/historikk");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    }
  };

  if (isLoading || auth.status === "loading") {
    return (
      <PageShell>
        <AppCard className="p-6 text-sm text-muted-foreground">{common("loading")}</AppCard>
      </PageShell>
    );
  }

  if (auth.status !== "authenticated") {
    return (
      <PageShell className="space-y-4">
        <SectionHeader title={t("detailsTitle")} subtitle={t("subtitle")} accent />
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

  if (error || !match) {
    return (
      <PageShell className="space-y-4">
        <SectionHeader title={t("detailsTitle")} subtitle={t("subtitle")} accent />
        <AppCard className="p-3 text-xs text-danger">{error ?? t("errors.generic")}</AppCard>
      </PageShell>
    );
  }

  const isCompleted = match.status === "completed";
  const resultBadge = isCompleted
    ? match.scoreFor > match.scoreAgainst
      ? { label: t("result.win"), className: "bg-green-500/15 text-green-600 dark:text-green-400" }
      : match.scoreFor < match.scoreAgainst
        ? { label: t("result.loss"), className: "bg-danger/10 text-danger" }
        : { label: t("result.draw"), className: "bg-fp-surface text-muted-foreground" }
    : null;

  const ownTeamName =
    workspace.teams.find((team) => team.id === match.teamId)?.name ?? match.title;
  const opponentDisplayName = match.opponentName?.trim() || t("defaultOpponent");

  return (
    <PageShell className="space-y-4 pb-8">
      <SectionHeader
        title={t("detailsTitle")}
        subtitle={match.title}
        accent
        action={
          <Link href="/match">
            <FpButton variant="ghost" size="sm">{t("backToList")}</FpButton>
          </Link>
        }
      />

      {notice ? <AppCard className="p-3 text-xs text-fp-accent">{notice}</AppCard> : null}
      {error ? <AppCard className="p-3 text-xs text-danger">{error}</AppCard> : null}

      {/* Hero score card */}
      <AppCard className="p-5">
        <div className="flex flex-col items-center gap-2 text-center">
          {/* Team names */}
          <p className="text-sm font-semibold leading-snug text-foreground">
            {ownTeamName}
            <span className="mx-1.5 font-normal text-muted-foreground">—</span>
            {opponentDisplayName}
          </p>
          <div className="flex items-center gap-4">
            <span className="text-5xl font-black tabular-nums text-foreground">{match.scoreFor}</span>
            <span className="text-2xl font-light text-muted-foreground">–</span>
            <span className="text-5xl font-black tabular-nums text-foreground">{match.scoreAgainst}</span>
          </div>
          {resultBadge && (
            <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${resultBadge.className}`}>
              {resultBadge.label}
            </span>
          )}
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span className="text-[11px] text-muted-foreground">{formatDate(match.startsAt)}</span>
            {match.location && (
              <span className="text-[11px] text-muted-foreground">· {match.location}</span>
            )}
            <span className="text-[11px] text-muted-foreground">· {match.format}</span>
          </div>
        </div>

        {(match.status === "upcoming" || match.status === "draft" || match.status === "live") && (
          <div className="mt-4 flex flex-wrap gap-2">
            {(match.status === "upcoming" || match.status === "draft") && (
              <FpButton
                type="button"
                variant="primary"
                size="md"
                fullWidth
                disabled={isUpdatingStatus}
                onClick={() => { void handleStatusChange("live"); }}
              >
                {isUpdatingStatus ? t("statusUpdating") : t("startMatchCta")}
              </FpButton>
            )}
            {match.status === "live" && (
              <>
                <Link href={`/match/live?matchId=${encodeURIComponent(match.id)}`} className="flex-1">
                  <FpButton variant="primary" size="md" fullWidth>{t("continueMatchCta")}</FpButton>
                </Link>
                <FpButton
                  type="button"
                  variant="danger"
                  size="md"
                  disabled={isUpdatingStatus}
                  onClick={() => { void handleStatusChange("completed"); }}
                >
                  {isUpdatingStatus ? t("statusUpdating") : t("finishMatchCta")}
                </FpButton>
              </>
            )}
          </div>
        )}
      </AppCard>

      {/* Timeline */}
      <AppCard className="space-y-3 p-4">
        <p className="text-sm font-semibold text-foreground">{t("timelineTitle")}</p>
        {timelineEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("timelineEmpty")}</p>
        ) : (
          <ul className="space-y-1.5">
            {timelineEvents.map((event) => {
              const isOwnGoal = event.type === "goal" && event.teamSide === "own";
              const isOpponentGoal = event.type === "goal" && event.teamSide === "opponent";
              const isSub = event.type === "substitution";
              const isStart = event.type === "match_started";
              const isEnd = event.type === "match_ended";
              const minuteStr = event.minute !== null ? `${event.minute}'` : "—";
              const editableServerEvent =
                isOwnGoal && event.source === "server" && event.serverEventId
                  ? events.find((serverEvent) => serverEvent.id === event.serverEventId) ?? null
                  : null;

              return (
                <li key={event.id}>
                  <button
                    type="button"
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      isOwnGoal
                        ? "border-green-500/20 bg-green-500/5 active:bg-green-500/10"
                        : isOpponentGoal
                          ? "border-danger/20 bg-danger/5 active:bg-danger/10"
                          : "border-fp-border bg-fp-surface-2 active:bg-fp-surface"
                    }`}
                    onClick={() => {
                      if (editableServerEvent) {
                        openEditModal(editableServerEvent);
                      }
                    }}
                  >
                    {/* Opponent goals: reversed layout so minute is right, content is right-aligned */}
                    <div className={`flex items-start gap-2.5 ${isOpponentGoal ? "flex-row-reverse" : ""}`}>
                      <span className="mt-0.5 w-8 shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
                        {minuteStr}
                      </span>
                      <div className={`flex-1 min-w-0 ${isOpponentGoal ? "text-right" : ""}`}>
                        {isOwnGoal && (
                          <>
                            <p className="text-sm font-semibold text-foreground">
                              ⚽ {event.scorerName ?? t("event.notRegistered")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("event.assistLabel", { value: event.assistName ?? t("event.noAssist") })}
                            </p>
                          </>
                        )}
                        {isOpponentGoal && (
                          <p className="text-sm font-semibold text-foreground">
                            {t("event.opponentGoal")} ⚽
                          </p>
                        )}
                        {isSub && (
                          <div className="flex items-center gap-1.5">
                            <ArrowLeftRight size={13} className="shrink-0 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-foreground">
                                <span className="text-green-600 dark:text-green-400">
                                  {t("event.substitutionIn")}: {event.inPlayerName ?? t("event.notRegistered")}
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t("event.substitutionOut")}: {event.outPlayerName ?? t("event.notRegistered")}
                              </p>
                            </div>
                          </div>
                        )}
                        {isStart && (
                          <p className="text-xs text-muted-foreground">{t("event.matchStarted")}</p>
                        )}
                        {isEnd && (
                          <p className="text-xs text-muted-foreground">{t("event.matchEnded")}</p>
                        )}
                        {!isOwnGoal && !isOpponentGoal && !isSub && !isStart && !isEnd && (
                          <p className="text-xs text-muted-foreground">{event.type}</p>
                        )}
                      </div>
                      {editableServerEvent && (
                        <span className="shrink-0 text-[10px] text-muted-foreground/60">{t("event.editTitle")} →</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </AppCard>

      {/* Playing time overview */}
      {playerTimes.length > 0 ? (
        <AppCard className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-primary" />
            <p className="text-sm font-semibold text-foreground">{t("playingTimeTitle")}</p>
          </div>
          <ul className="space-y-2">
            {playerTimes.map(({ name, minutes }) => {
              const maxMinutes = playerTimes[0]?.minutes ?? 1;
              const pct = Math.round((minutes / Math.max(maxMinutes, 1)) * 100);
              return (
                <li key={name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">{name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {minutes} min
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-fp-surface">
                    <div
                      className="h-full rounded-full bg-primary/50 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </AppCard>
      ) : null}

      {/* AI report */}
      {match.reportEnabled ? (
        <AppCard className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-fp-accent" />
            <p className="text-sm font-semibold text-foreground">{t("reportTitle")}</p>
          </div>
          {match.reportStatus === "pending" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              {t("reportPending")}
            </div>
          )}
          {match.reportStatus === "failed" && (
            <p className="text-sm text-danger">{t("reportFailed")}</p>
          )}
          {match.reportStatus === "ready" && match.reportText ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">
              {match.reportText}
            </p>
          ) : null}
          {match.reportStatus === "not_requested" && (
            <p className="text-xs text-muted-foreground">{t("reportPending")}</p>
          )}
        </AppCard>
      ) : null}

      {/* Danger zone */}
      <AppCard className="space-y-3 border-danger/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-danger/70">
          {t("actionsTitle")}
        </p>
        <FpButton
          type="button"
          variant="danger"
          size="md"
          fullWidth
          onClick={() => { setShowDeleteConfirm(true); }}
        >
          {t("delete.cta")}
        </FpButton>
      </AppCard>

      {/* Goal edit modal */}
      {editingEvent ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/45 p-3">
          <AppCard className="w-full space-y-3 p-4">
            <p className="text-sm font-semibold text-foreground">{t("event.editTitle")}</p>

            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">{t("event.minute")}</span>
              <input
                type="number"
                min={0}
                value={editMinute}
                onChange={(event) => { setEditMinute(event.target.value); }}
                className="w-full rounded-lg border border-fp-border bg-fp-surface-2 px-3 py-2 text-sm text-foreground"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">{t("event.scorer")}</span>
              <select
                value={editScorerId}
                onChange={(event) => { setEditScorerId(event.target.value); }}
                className="w-full rounded-lg border border-fp-border bg-fp-surface-2 px-3 py-2 text-sm text-foreground"
              >
                <option value="">{t("event.notRegistered")}</option>
                {playerOptions.map((player) => (
                  <option key={player.id} value={player.id}>{player.name}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">{t("event.assist")}</span>
              <select
                value={editAssistId}
                onChange={(event) => { setEditAssistId(event.target.value); }}
                className="w-full rounded-lg border border-fp-border bg-fp-surface-2 px-3 py-2 text-sm text-foreground"
              >
                <option value="">{t("event.noAssist")}</option>
                {playerOptions.map((player) => (
                  <option key={player.id} value={player.id}>{player.name}</option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <FpButton
                variant="secondary"
                size="md"
                onClick={() => { setEditingEvent(null); }}
              >
                {common("cancel")}
              </FpButton>
              <FpButton
                variant="primary"
                size="md"
                onClick={() => { void handleSaveEdit(); }}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? t("event.saving") : t("event.save")}
              </FpButton>
            </div>

            <FpButton
              variant="danger"
              size="md"
              fullWidth
              onClick={() => { void handleDeleteEvent(); }}
            >
              {t("event.delete")}
            </FpButton>
          </AppCard>
        </div>
      ) : null}

      {/* Delete confirmation modal */}
      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-3">
          <AppCard className="w-full space-y-4 p-5">
            <div className="space-y-1.5">
              <p className="text-base font-semibold text-foreground">{t("delete.title")}</p>
              <p className="text-sm text-muted-foreground">{t("delete.description")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FpButton
                variant="secondary"
                size="md"
                onClick={() => { setShowDeleteConfirm(false); }}
              >
                {common("cancel")}
              </FpButton>
              <FpButton
                variant="danger"
                size="md"
                onClick={() => { void handleDeleteMatch(); }}
              >
                {t("delete.cta")}
              </FpButton>
            </div>
          </AppCard>
        </div>
      ) : null}
    </PageShell>
  );
}
