"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, Loader2, ShieldAlert } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  Button,
  ButtonLink,
  ConfirmSheet,
  EmptyState,
  ListGroup,
  ListRow,
  Notice,
  Sheet,
  SkeletonList,
} from "@/components/ui/primitives";
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
import { cn } from "@/lib/utils";
import { EventTimeline } from "@/components/match/EventTimeline";

/** Section kicker (DESIGN.md §3 "Label"), as in `MatchPlayingTime`. */
const KICKER = "px-1 text-[13px] font-semibold uppercase leading-tight tracking-[0.06em] text-fp-ink-2 outline-none";
/** Form field in a sheet: 44px, 16px text (no iOS zoom), 10px radius (DESIGN.md §4). */
const FIELD =
  "block min-h-11 w-full rounded-[10px] border border-fp-rule bg-fp-surface px-3 text-base text-fp-ink outline-none focus-visible:ring-2 focus-visible:ring-fp-focus";

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

/**
 * A goal minute is empty (unknown) or a whole number from 0; stoppage has no
 * match-minute limit, only JavaScript's safe-integer range (C4-F5).
 */
export function isValidGoalMinute(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || (/^\d+$/.test(trimmed) && Number.isSafeInteger(Number(trimmed)));
}

function parseApiError(payload: unknown, fallback: string): { message: string } {
  if (typeof payload !== "object" || payload === null) {
    return { message: fallback };
  }

  const value = payload as Record<string, unknown>;

  return {
    message: typeof value.message === "string" ? value.message : fallback,
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
  // Shows the minute error once the coach has left the field or tried to save.
  const [editMinuteTouched, setEditMinuteTouched] = useState(false);
  const editMinuteRef = useRef<HTMLInputElement | null>(null);
  const [editScorerId, setEditScorerId] = useState<string>("");
  const [editAssistId, setEditAssistId] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [deleteEventOpen, setDeleteEventOpen] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  // Shown inside the edit sheet: the page behind it is inert and hidden.
  const [editError, setEditError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingMatch, setIsDeletingMatch] = useState(false);
  // Shown beside the delete row, where the coach is when it fails.
  const [deleteMatchError, setDeleteMatchError] = useState<string | null>(null);
  // Bumped per message so a repeated one is announced again.
  const [noticeKey, setNoticeKey] = useState(0);
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
  // A deleted goal's row is gone, so focus returns to the timeline heading.
  const timelineHeadingRef = useRef<HTMLHeadingElement | null>(null);
  // Where focus goes when the delete-goal confirmation closes: the goal's row
  // on cancel, the timeline heading once the row is gone.
  const deleteEventFinalFocus = useRef<HTMLElement | null>(null);

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
          throw new Error(parseApiError(matchPayload, t("errors.generic")).message);
        }

        const eventsPayload = (await eventsResponse.json()) as unknown;
        if (!eventsResponse.ok) {
          throw new Error(parseApiError(eventsPayload, t("errors.generic")).message);
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
        showNotice(t("completedNotice"));
        await refreshActiveMatch();
      } else if (result?.status === "failed") {
        setError(result.message ?? t("errors.generic"));
      } else {
        showNotice(t("completedOfflineNotice"));
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
      showNotice(t("finishConfirm.changed"));
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
            showNotice(t("completedNotice"));
          } else if (result.status === "offline") {
            showNotice(t("completedOfflineNotice"));
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
      showNotice(t("completedNotice"));
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
    setEditMinuteTouched(false);
    setEditScorerId(event.primaryPlayerId ?? "");
    setEditAssistId(event.secondaryPlayerId ?? "");
    setEditError(null);
    setEditSheetOpen(true);
  };

  const showNotice = (message: string) => {
    setNotice(message);
    setNoticeKey((key) => key + 1);
  };

  const handleSaveEdit = async () => {
    if (!match || !editingEvent) {
      return;
    }
    // C4-F5: empty or a whole number from 0, no upper limit (stoppage).
    if (!isValidGoalMinute(editMinute)) {
      setEditMinuteTouched(true);
      editMinuteRef.current?.focus();
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);

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
          minute: editMinute.trim() ? Number(editMinute.trim()) : null,
          primaryPlayerId: editScorerId || null,
          secondaryPlayerId: editAssistId || null,
          payload: mergedPayload,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { event?: MatchEventItem; message?: string };

      if (!response.ok || !payload.event) {
        throw new Error(payload.message ?? t("errors.generic"));
      }

      setEvents((previous) => previous.map((event) => (event.id === payload.event?.id ? payload.event : event)));
      setEditSheetOpen(false);
      showNotice(t("event.editSaved"));
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!match || !editingEvent || isDeletingEvent) {
      return;
    }

    setIsDeletingEvent(true);

    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}/events/${encodeURIComponent(editingEvent.id)}`, {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await response.json().catch(() => null)) as unknown;
        throw new Error(parseApiError(payload, t("errors.generic")).message);
      }

      deleteEventFinalFocus.current = timelineHeadingRef.current;
      setDeleteEventOpen(false);
      setEvents((previous) => previous.filter((event) => event.id !== editingEvent.id));
      showNotice(t("event.deleted"));
    } catch (cause) {
      // Back to the goal, with the reason, so the coach can try again.
      setDeleteEventOpen(false);
      setEditError(cause instanceof Error ? cause.message : t("errors.generic"));
      setEditSheetOpen(true);
    } finally {
      setIsDeletingEvent(false);
    }
  };

  const handleDeleteMatch = async () => {
    if (!match || isDeletingMatch) return;

    setDeleteMatchError(null);
    setIsDeletingMatch(true);

    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}`, {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await response.json().catch(() => null)) as unknown;
        throw new Error(parseApiError(payload, t("errors.generic")).message);
      }

      setShowDeleteConfirm(false);
      router.push("/historikk");
    } catch (cause) {
      setShowDeleteConfirm(false);
      setDeleteMatchError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setIsDeletingMatch(false);
    }
  };

  if (isLoading || auth.status === "loading") {
    return (
      <PageShell>
        <SkeletonList rows={5} withDescription label={common("loading")} />
      </PageShell>
    );
  }

  if (auth.status !== "authenticated") {
    return (
      <PageShell>
        <SectionHeader title={t("detailsTitle")} />
        <EmptyState
          icon={ShieldAlert}
          title={t("loginRequiredTitle")}
          description={t("loginRequiredDescription")}
          action={<ButtonLink href="/auth/sign-in" variant="primary">{t("loginCta")}</ButtonLink>}
        />
      </PageShell>
    );
  }

  if (!match) {
    return (
      <PageShell className="flex flex-col gap-4">
        <ButtonLink href="/historikk" variant="ghost" size="sm" className="-ml-3 self-start">
          <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
          {t("backToHistory")}
        </ButtonLink>
        <SectionHeader title={t("detailsTitle")} className="mb-0" />
        <Notice tone="error">{error ?? t("errors.generic")}</Notice>
      </PageShell>
    );
  }

  const isCompleted = match.status === "completed";
  const isPlanned = match.status === "upcoming" || match.status === "draft";
  const resultLabel = isCompleted
    ? match.scoreFor > match.scoreAgainst
      ? t("result.win")
      : match.scoreFor < match.scoreAgainst
        ? t("result.loss")
        : t("result.draw")
    : null;
  const statusLabel = t(`status.${isPlanned ? "planned" : match.status}`);

  const ownTeamName =
    workspace.teams.find((team) => team.id === match.teamId)?.name ?? match.title;
  const opponentDisplayName = match.opponentName?.trim() || t("defaultOpponent");
  const meta = [formatDate(match.startsAt), match.location].filter(Boolean).join(" · ");

  // C4: the timeline is goals and substitutions; kick-off and the final
  // whistle are implied by the result above it.
  const timelineRows = timelineEvents.filter((event) => event.type === "goal" || event.type === "substitution");
  const minuteInvalid = editMinuteTouched && !isValidGoalMinute(editMinute);

  // Only our own goals stored on the server can be corrected here.
  const editableServerEvent = (rowId: string): MatchEventItem | null => {
    const event = timelineRows.find((row) => row.id === rowId);
    return event && event.type === "goal" && event.teamSide === "own" && event.source === "server" && event.serverEventId
      ? events.find((serverEvent) => serverEvent.id === event.serverEventId) ?? null
      : null;
  };

  return (
    <PageShell className="flex flex-col gap-6 pb-8">
      <ButtonLink href={isCompleted ? "/historikk" : "/match"} variant="ghost" size="sm" className="-ml-3 self-start">
        <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
        {isCompleted ? t("backToHistory") : t("backToPlanner")}
      </ButtonLink>

      {notice ? <Notice key={noticeKey} tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {/* Result first: the club-green scoreboard (DESIGN.md §2.2, §3). */}
      <section className="rounded-[20px] bg-fp-club p-5 text-fp-on-club" data-testid="match-hero">
        <p className="text-[13px] font-semibold uppercase leading-tight tracking-[0.06em] text-fp-on-club-2">
          {[statusLabel, match.format].join(" · ")}
        </p>
        <h1 className="mt-2 text-[20px] font-semibold leading-[1.2] tracking-[-0.01em] [overflow-wrap:anywhere]">
          {ownTeamName}
          <span className="text-fp-on-club-2"> – </span>
          {opponentDisplayName}
        </h1>
        {isPlanned ? null : (
          <p className="mt-4 flex items-baseline gap-3" data-testid="match-score">
            <span aria-hidden className="font-num text-[50px] leading-[0.9] [@media(max-height:700px)]:text-[44px]">
              {match.scoreFor}
              <span className="px-2 text-fp-on-club-2">–</span>
              {match.scoreAgainst}
            </span>
            <span className="sr-only">{t("scoreA11y", { scoreFor: match.scoreFor, scoreAgainst: match.scoreAgainst })}</span>
            {resultLabel ? <span className="text-base font-semibold">{resultLabel}</span> : null}
          </p>
        )}
        <p className="mt-3 text-[14px] font-medium text-fp-on-club-2">{meta}</p>
      </section>

      {isPlanned || match.status === "live" ? (
        <div className="space-y-3">
          {match.status === "live" && deviceRelation === "other" ? (
            <p className="px-1 text-[14px] text-fp-ink-2">{t("otherMatchOnDevice")}</p>
          ) : null}
          {match.status === "live" && deviceRelation === "closed" ? (
            <p className="px-1 text-[14px] text-fp-ink-2">{t("closedOnDevice")}</p>
          ) : null}
          {isPlanned ? (
            <Button variant="primary" block onClick={handleStart}>
              {t("startMatchCta")}
            </Button>
          ) : (
            <div className="grid gap-2">
              {/* Only a link that opens this very match: the live screen
                  always shows the match running on this device. */}
              {deviceRelation === "this" || (deviceRelation === "none" && match.runtimeState) ? (
                <ButtonLink
                  href={deviceRelation === "this" ? liveHrefFor(match.id) : `/match/live?matchId=${encodeURIComponent(match.id)}`}
                  variant="primary"
                  block
                >
                  {t("continueMatchCta")}
                </ButtonLink>
              ) : deviceRelation === "none" ? (
                <Button variant="primary" block onClick={handleStart}>
                  {t("startMatchCta")}
                </Button>
              ) : null}
              {/* Destructive only inside its confirmation (DESIGN.md §5.7). */}
              <Button
                variant="secondary"
                block
                disabled={isUpdatingStatus}
                onClick={() => { void handleFinish(); }}
              >
                {isUpdatingStatus
                  ? t("statusUpdating")
                  : deviceRelation === "closed"
                    ? t("syncFinishCta")
                    : t("finishMatchCta")}
              </Button>
            </div>
          )}
        </div>
      ) : null}

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

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* Timeline: hairline rows, the minute in front (DESIGN.md §7). */}
        <section className="space-y-2" data-testid="match-timeline">
          <h2 ref={timelineHeadingRef} tabIndex={-1} className={KICKER}>
            {t("timelineTitle")}
          </h2>
          {timelineRows.length === 0 ? (
            <p className="px-1 text-[14px] text-fp-ink-2">{t("timelineEmpty")}</p>
          ) : (
            // The event timeline (DESIGN.md §7.2), from kick-off. Our goals
            // stored on the server open the edit sheet.
            <EventTimeline
              label={t("timelineTitle")}
              opponentName={opponentDisplayName}
              entries={timelineRows.map((event) => ({
                id: event.id,
                minute: event.minute,
                side: event.type === "substitution" || event.teamSide === "own" ? "own" : "opponent",
                kind: event.type === "substitution" ? "substitution" : "goal",
                primary: event.type === "substitution" ? event.inPlayerName : event.scorerName,
                secondary: event.type === "substitution" ? event.outPlayerName : event.assistName,
              }))}
              canEdit={(entry) => editableServerEvent(entry.id) !== null}
              onEdit={(entry) => {
                const serverEvent = editableServerEvent(entry.id);
                if (!serverEvent) return;
                deleteEventFinalFocus.current = document.querySelector<HTMLElement>(`[data-testid="timeline-${entry.id}"]`);
                openEditModal(serverEvent);
              }}
              editLabel={t("event.editA11y")}
              rowTestIdPrefix="timeline-"
            />
          )}
        </section>

        {/* Playing time: shown whenever the match recorded it, and for every
            completed match, which says so when it did not. */}
        {playingTime || isCompleted ? (
          <MatchPlayingTime summary={playingTime} names={playingTimeNames} isLive={match.status === "live"} />
        ) : null}
      </div>

      {/* The generated summary: its own calm section, text first. */}
      {match.reportEnabled ? (
        <section className="space-y-2" data-testid="match-report">
          <h2 className={KICKER}>{t("reportTitle")}</h2>
          <div className="space-y-3 rounded-[14px] border border-fp-rule bg-fp-surface p-4">
            {/* One live region that stays mounted, so a change of status is announced. */}
            <p role="status" className="sr-only">
              {match.reportStatus === "ready" ? t("reportReady") : match.reportStatus === "failed" ? t("reportFailed") : t("reportPending")}
            </p>
            {match.reportStatus === "pending" || match.reportStatus === "not_requested" ? (
              <p aria-hidden className="flex items-center gap-2 text-base text-fp-ink-2">
                {match.reportStatus === "pending" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
                {t("reportPending")}
              </p>
            ) : null}
            {match.reportStatus === "failed" ? (
              <p aria-hidden className="text-base text-fp-ink">{t("reportFailed")}</p>
            ) : null}
            {match.reportStatus === "ready" && match.reportText ? (
              <>
                <p className="whitespace-pre-line text-base leading-relaxed text-fp-ink">{match.reportText}</p>
                <p className="text-[14px] text-fp-ink-2">
                  {t("reportGeneratedAt", { value: formatDate(match.reportGeneratedAt ?? null) })}
                </p>
              </>
            ) : null}
            <Button
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
            </Button>
          </div>
        </section>
      ) : null}

      {/* Destructive on its own, behind a confirmation (DESIGN.md §5.5). */}
      {deleteMatchError ? <Notice tone="error">{deleteMatchError}</Notice> : null}
      <ListGroup aria-label={t("deleteSectionLabel")} testId="match-delete">
        <ListRow destructive label={t("delete.cta")} onClick={() => { setShowDeleteConfirm(true); }} />
      </ListGroup>

      {/* Goal edit sheet (C4: on the shared Sheet, UI-A11Y-03). */}
      <Sheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        title={t("event.editTitle")}
        closeButton={common("cancel")}
        testId="goal-edit-sheet"
        actions={
          <Button
            variant="primary"
            block
            aria-disabled={isSavingEdit || undefined}
            aria-busy={isSavingEdit || undefined}
            onClick={() => {
              if (!isSavingEdit) void handleSaveEdit();
            }}
          >
            {isSavingEdit ? t("event.saving") : t("event.save")}
          </Button>
        }
      >
        <div className="space-y-4">
          {editError ? <Notice tone="error">{editError}</Notice> : null}
          <div className="space-y-1.5">
            <label htmlFor="goal-edit-minute" className="block text-[14px] font-medium text-fp-ink-2">
              {t("event.minute")}
            </label>
            <input
              id="goal-edit-minute"
              ref={editMinuteRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={editMinute}
              aria-invalid={minuteInvalid || undefined}
              aria-describedby={minuteInvalid ? "goal-edit-minute-error" : undefined}
              onChange={(event) => { setEditMinute(event.target.value); }}
              onBlur={() => setEditMinuteTouched(true)}
              className={cn(FIELD, minuteInvalid && "border-fp-danger-text")}
            />
            {minuteInvalid ? (
              <p id="goal-edit-minute-error" className="text-sm font-medium text-fp-danger-text">
                {t("event.minuteError")}
              </p>
            ) : null}
          </div>

          <label className="block space-y-1.5">
            <span className="text-[14px] font-medium text-fp-ink-2">{t("event.scorer")}</span>
            <select value={editScorerId} onChange={(event) => { setEditScorerId(event.target.value); }} className={FIELD}>
              <option value="">{t("event.notRegistered")}</option>
              {playerOptions.map((player) => (
                <option key={player.id} value={player.id}>{player.name}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[14px] font-medium text-fp-ink-2">{t("event.assist")}</span>
            <select value={editAssistId} onChange={(event) => { setEditAssistId(event.target.value); }} className={FIELD}>
              <option value="">{t("event.noAssist")}</option>
              {playerOptions.map((player) => (
                <option key={player.id} value={player.id}>{player.name}</option>
              ))}
            </select>
          </label>

          <ListGroup className="pt-4">
            <ListRow
              destructive
              label={t("event.deleteGoal")}
              onClick={() => {
                setEditSheetOpen(false);
                setDeleteEventOpen(true);
              }}
            />
          </ListGroup>
        </div>
      </Sheet>

      <ConfirmSheet
        open={deleteEventOpen}
        onOpenChange={setDeleteEventOpen}
        title={t("event.deleteConfirmTitle")}
        description={
          editingEvent?.minute != null
            ? t("event.deleteConfirmDescription", { minute: editingEvent.minute })
            : t("event.deleteConfirmDescriptionNoMinute")
        }
        confirmLabel={t("event.deleteConfirmCta")}
        destructive
        pending={isDeletingEvent}
        onConfirm={() => { void handleDeleteEvent(); }}
        finalFocus={deleteEventFinalFocus}
        testId="goal-delete-confirm"
      />

      <ConfirmSheet
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t("delete.title")}
        description={t("delete.description")}
        confirmLabel={t("delete.confirmCta")}
        destructive
        pending={isDeletingMatch}
        onConfirm={() => { void handleDeleteMatch(); }}
        testId="delete-match-confirm"
      />
    </PageShell>
  );
}
