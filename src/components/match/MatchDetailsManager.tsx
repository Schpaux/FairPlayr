"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeftRight, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FpButton } from "@/components/ui/FpButton";
import { Button, ButtonLink, ConfirmSheet } from "@/components/ui/primitives";
import { MatchPlayingTime } from "@/components/match/MatchPlayingTime";
import { summarizeMatchPlayingTime } from "@/domain/matchPlayingTime";
import type { Player } from "@/domain/team";
import {
  createGoalEvent,
  createMatchEndedEvent,
  createMatchStartedEvent,
  createSubstitutionEvent,
  normalizeMatchEvents,
  type MatchEvent,
} from "@/domain/matchEvent";
import { endLocalActiveMatch, liveHrefFor } from "@/lib/match/activeMatchRecovery";
import { retryPendingMatchCompletion, submitMatchCompletion } from "@/lib/match/matchCompletion";
import { getStoredMatchSetup } from "@/lib/storage/matchStorage";
import { getPendingMatchCompletion } from "@/lib/storage/pendingMatchCompletionStorage";

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

/**
 * How this device relates to a match: running it, running another, free, or
 * "closed" — ended here with its completion still waiting for the server.
 */
type DeviceRelation = "this" | "other" | "none" | "closed";

function readDeviceRelation(matchId: string): DeviceRelation {
  const stored = getStoredMatchSetup();

  if (getPendingMatchCompletion(matchId) && !(stored?.status === "active" && stored.serverMatchId === matchId)) {
    return "closed";
  }

  if (stored?.status !== "active") {
    return "none";
  }

  return stored.serverMatchId === matchId ? "this" : "other";
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
  const [isRegeneratingReport, setIsRegeneratingReport] = useState(false);
  const [autoReportTriggeredFor, setAutoReportTriggeredFor] = useState<string | null>(null);
  const [deviceRelation, setDeviceRelation] = useState<DeviceRelation>("none");
  const [finishConfirm, setFinishConfirm] = useState<{ open: boolean; relation: Exclude<DeviceRelation, "closed"> }>({
    open: false,
    relation: "this",
  });
  // The Finish button is disabled and then gone once the match is completed,
  // so after confirming, focus goes to the page's first control instead.
  const finishFinalFocus = useRef<HTMLElement | null>(null);

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

  // UI-DETAIL-01: every squad player's total, 0′ included, from the stored
  // match state. A running match is counted up to when the page loaded.
  const [loadedAtMs] = useState(() => Date.now());
  const playingTime = useMemo(
    () =>
      summarizeMatchPlayingTime(match?.runtimeState, {
        format: match?.format ?? null,
        nowMs: loadedAtMs,
        completed: match?.status === "completed",
      }),
    [loadedAtMs, match?.format, match?.runtimeState, match?.status]
  );

  // Current team names first; names stored with the match's own events cover
  // players who have since left the team.
  const playingTimeNames = useMemo(() => {
    const names = new Map<string, string>();
    const remember = (playerId: string | null | undefined, name: string | null | undefined) => {
      if (playerId && name && !names.has(playerId)) names.set(playerId, name);
    };

    for (const player of playerOptions) remember(player.id, player.name);
    for (const event of timelineEvents) {
      if (event.type === "goal") {
        remember(event.scorerPlayerId, event.scorerName);
        remember(event.assistPlayerId, event.assistName);
      } else if (event.type === "substitution") {
        remember(event.inPlayerId, event.inPlayerName);
        remember(event.outPlayerId, event.outPlayerName);
      }
    }

    return names;
  }, [playerOptions, timelineEvents]);

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
        setDeviceRelation(readDeviceRelation(matchId));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : t("errors.generic");
        setError(message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [auth.status, matchId, t]);

  // FP-P0-F2: starting goes through setup, which marks the match live only
  // after this device has actually started it (and refuses while it runs
  // another one). Nothing is written to the server here.
  const handleStart = () => {
    if (!match) {
      return;
    }

    router.push(`/match/setup?matchId=${encodeURIComponent(match.id)}`);
  };

  const handleFinish = async () => {
    if (!match) {
      return;
    }

    const relation = readDeviceRelation(match.id);
    setDeviceRelation(relation);

    if (relation === "closed") {
      // Already ended (and confirmed) on this device: send that result now.
      setError(null);
      setNotice(null);
      setIsUpdatingStatus(true);
      const pending = getPendingMatchCompletion(match.id);
      const result = await retryPendingMatchCompletion(match.id);

      if (result?.status === "completed" && pending) {
        setMatch({
          ...match,
          status: "completed",
          scoreFor: pending.body.scoreFor,
          scoreAgainst: pending.body.scoreAgainst,
          endedAt: pending.endedAt,
          runtimeState: (pending.body.runtimeState as MatchRuntimeState | null | undefined) ?? match.runtimeState,
        });
        setDeviceRelation("none");
        setNotice(t("completedNotice"));
        await refreshActiveMatch();
      } else if (result?.status === "failed") {
        setError(result.message ?? t("errors.generic"));
      } else {
        setNotice(t("completedOfflineNotice"));
      }

      setIsUpdatingStatus(false);
      return;
    }

    finishFinalFocus.current = null;
    setFinishConfirm({ open: true, relation });
  };

  // UI-A11Y-02: runs only for the relation the confirmation described. If it
  // changed while the sheet was open (another tab), nothing happens and the
  // page shows the new state instead.
  const confirmFinish = async () => {
    // A second press while the sheet slides out is ignored.
    if (!finishConfirm.open) {
      return;
    }

    const shown = finishConfirm.relation;
    finishFinalFocus.current = document.querySelector("main");
    setFinishConfirm((current) => ({ ...current, open: false }));

    if (!match) {
      return;
    }

    const relation = readDeviceRelation(match.id);
    setDeviceRelation(relation);

    if (relation !== shown) {
      setNotice(t("finishConfirm.changed"));
      return;
    }

    setError(null);
    setNotice(null);
    setIsUpdatingStatus(true);

    try {
      if (relation === "this") {
        // This device runs the match: end it here first, exactly like the
        // live screen's End, so the clock stops whatever the network does.
        const ended = endLocalActiveMatch({
          reportEnabled: match.reportEnabled,
          onlyServerMatchId: match.id,
        });
        setDeviceRelation("none");

        if (ended?.completion) {
          setMatch({
            ...match,
            status: "completed",
            scoreFor: ended.completion.body.scoreFor,
            scoreAgainst: ended.completion.body.scoreAgainst,
            endedAt: ended.completion.endedAt,
            runtimeState: (ended.endedLiveMatch as MatchRuntimeState | null) ?? match.runtimeState,
          });

          const result = await submitMatchCompletion(
            ended.completion.matchId,
            ended.completion.body,
            ended.completion.endedAt
          );

          if (result.status === "completed") {
            setNotice(t("completedNotice"));
          } else if (result.status === "offline") {
            setNotice(t("completedOfflineNotice"));
          } else {
            setError(result.message ?? t("errors.generic"));
          }
        }

        await refreshActiveMatch();
        return;
      }

      // Not this device's match: complete the server record only. Nothing
      // stored on this device is read or changed.
      const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "completed" }),
      });

      const payload = (await response.json()) as { message?: string; match?: MatchDetails };

      if (!response.ok) {
        throw new Error(payload.message ?? t("errors.generic"));
      }

      if (payload.match) {
        setMatch(payload.match);
      }

      await refreshActiveMatch();
      setNotice(t("completedNotice"));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("errors.generic");
      setError(message);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const fetchMatchById = useCallback(async (targetMatchId: string): Promise<MatchDetails> => {
    const response = await fetch(`/api/matches/${encodeURIComponent(targetMatchId)}`, {
      method: "GET",
    });

    const payload = (await response.json()) as { message?: string; match?: MatchDetails };
    if (!response.ok || !payload.match) {
      throw new Error(payload.message ?? t("errors.generic"));
    }

    return payload.match;
  }, [t]);

  const pollReportStatus = useCallback(async (targetMatchId: string) => {
    const maxAttempts = 10;
    const delayMs = 1500;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const latest = await fetchMatchById(targetMatchId);
      setMatch(latest);

      if (latest.reportStatus !== "pending") {
        return;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }, [fetchMatchById]);

  const triggerReportGeneration = useCallback(async (targetMatch: MatchDetails, silent = false) => {
    setIsRegeneratingReport(true);
    if (!silent) {
      setError(null);
      setNotice(null);
    }

    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(targetMatch.id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: "completed",
          reportEnabled: true,
        }),
      });

      const payload = (await response.json()) as { message?: string; match?: MatchDetails };
      if (!response.ok || !payload.match) {
        throw new Error(payload.message ?? t("errors.generic"));
      }

      setMatch(payload.match);

      if (payload.match.reportStatus === "pending") {
        await pollReportStatus(payload.match.id);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("errors.generic");
      if (!silent) {
        setError(message);
      }
    } finally {
      setIsRegeneratingReport(false);
    }
  }, [pollReportStatus, t]);

  useEffect(() => {
    if (!match) {
      return;
    }

    const shouldAutoTrigger =
      match.status === "completed" &&
      match.reportEnabled &&
      (match.reportStatus === "not_requested" || match.reportStatus === "failed") &&
      autoReportTriggeredFor !== match.id;

    if (!shouldAutoTrigger) {
      return;
    }

    setAutoReportTriggeredFor(match.id);
    void triggerReportGeneration(match, true);
  }, [autoReportTriggeredFor, match, triggerReportGeneration]);

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
            <ButtonLink href="/auth/sign-in" variant="primary" size="sm">{t("loginCta")}</ButtonLink>
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
          <ButtonLink href="/match" variant="ghost" size="sm">{t("backToList")}</ButtonLink>
        }
      />

      {notice ? (
        <AppCard className="p-3 text-xs text-fp-accent">
          <p role="status">{notice}</p>
        </AppCard>
      ) : null}
      {error ? (
        <AppCard className="p-3 text-xs text-danger">
          <p role="alert">{error}</p>
        </AppCard>
      ) : null}

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
          <div className="mt-4 space-y-2">
            {match.status === "live" && deviceRelation === "other" ? (
              <p className="text-xs text-muted-foreground">{t("otherMatchOnDevice")}</p>
            ) : null}
            {match.status === "live" && deviceRelation === "closed" ? (
              <p className="text-xs text-muted-foreground">{t("closedOnDevice")}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {(match.status === "upcoming" || match.status === "draft") && (
                <FpButton
                  type="button"
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={handleStart}
                >
                  {t("startMatchCta")}
                </FpButton>
              )}
              {match.status === "live" && (
                <>
                  {/* Only a link that opens this very match: the live screen
                      always shows the match running on this device. */}
                  {deviceRelation === "this" || (deviceRelation === "none" && match.runtimeState) ? (
                    <ButtonLink
                      href={deviceRelation === "this" ? liveHrefFor(match.id) : `/match/live?matchId=${encodeURIComponent(match.id)}`}
                      variant="primary"
                      size="sm"
                      className="flex-1"
                    >
                      {t("continueMatchCta")}
                    </ButtonLink>
                  ) : deviceRelation === "none" ? (
                    <FpButton type="button" variant="primary" size="md" className="flex-1" onClick={handleStart}>
                      {t("startMatchCta")}
                    </FpButton>
                  ) : null}
                  {/* Destructive only inside its confirmation (DESIGN.md §5.7). */}
                  <Button
                    size="sm"
                    className={deviceRelation === "other" || deviceRelation === "closed" ? "flex-1" : undefined}
                    disabled={isUpdatingStatus}
                    onClick={() => { void handleFinish(); }}
                  >
                    {isUpdatingStatus
                      ? t("statusUpdating")
                      : deviceRelation === "closed"
                        ? t("syncFinishCta")
                        : t("finishMatchCta")}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </AppCard>

      <ConfirmSheet
        open={finishConfirm.open}
        onOpenChange={(open) => setFinishConfirm((current) => ({ ...current, open }))}
        title={t("finishConfirm.title")}
        description={
          finishConfirm.relation === "this" ? t("finishConfirm.description") : t("finishConfirm.descriptionServerOnly")
        }
        confirmLabel={t("finishConfirm.confirm")}
        destructive
        onConfirm={() => { void confirmFinish(); }}
        finalFocus={finishFinalFocus}
        testId="finish-match-confirm"
      />

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

      {/* Playing time: shown whenever the match recorded it, and for every
          completed match, which says so when it did not. */}
      {playingTime || isCompleted ? (
        <MatchPlayingTime summary={playingTime} names={playingTimeNames} isLive={match.status === "live"} />
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
            <div className="space-y-2">
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">
                {match.reportText}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t("reportGeneratedAt", { value: formatDate(match.reportGeneratedAt ?? null) })}
              </p>
            </div>
          ) : null}
          {match.reportStatus === "not_requested" && (
            <p className="text-xs text-muted-foreground">{t("reportPending")}</p>
          )}
          <FpButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void triggerReportGeneration(match);
            }}
            disabled={isRegeneratingReport || match.reportStatus === "pending"}
          >
            {isRegeneratingReport || match.reportStatus === "pending"
              ? t("reportRetrying")
              : t("reportRegenerateCta")}
          </FpButton>
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
