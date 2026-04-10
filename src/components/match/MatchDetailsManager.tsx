"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";
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

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const aTime = a.timestampMs ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.timestampMs ?? Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) {
        return aTime - bTime;
      }

      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [events]);

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

  const formatStatus = (status: MatchDetails["status"]) => {
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

  const scorerLabel = useCallback((event: MatchEventItem) => {
    const fromPayload = payloadName(event.payload, "primaryPlayerName");
    if (fromPayload) {
      return fromPayload;
    }

    if (event.primaryPlayerId) {
      return playerById.get(event.primaryPlayerId)?.name ?? t("event.notRegistered");
    }

    return t("event.notRegistered");
  }, [playerById, t]);

  const assistLabel = useCallback((event: MatchEventItem) => {
    const fromPayload = payloadName(event.payload, "secondaryPlayerName");
    if (fromPayload) {
      return fromPayload;
    }

    if (event.secondaryPlayerId) {
      return playerById.get(event.secondaryPlayerId)?.name ?? t("event.noAssist");
    }

    return t("event.noAssist");
  }, [playerById, t]);

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
    if (!match || !window.confirm(t("delete.confirm"))) {
      return;
    }

    setError(null);

    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}`, {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await response.json()) as unknown;
        throw new Error(parseApiError(payload).message);
      }

      router.push("/match");
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

  return (
    <PageShell className="space-y-4 pb-8">
      <SectionHeader title={t("detailsTitle")} subtitle={match.title} accent />

      {notice ? <AppCard className="p-3 text-xs text-fp-accent">{notice}</AppCard> : null}
      {error ? <AppCard className="p-3 text-xs text-danger">{error}</AppCard> : null}

      <AppCard className="space-y-2 p-4">
        <p className="text-sm font-semibold text-foreground">
          {match.title} {match.opponentName ? `vs ${match.opponentName}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">{t("timeLabel", { value: formatDate(match.startsAt) })}</p>
        <p className="text-xs text-muted-foreground">{t("locationLabel", { value: match.location ?? t("noLocation") })}</p>
        <p className="text-xs text-muted-foreground">{t("formatLabel", { value: match.format })}</p>
        <p className="text-xs text-muted-foreground">{t("statusLabel", { value: formatStatus(match.status) })}</p>
        <p className="text-lg font-bold text-foreground">{t("resultLabel", { scoreFor: match.scoreFor, scoreAgainst: match.scoreAgainst })}</p>

        <div className="flex flex-wrap gap-2 pt-1">
          {(match.status === "upcoming" || match.status === "draft") ? (
            <FpButton
              type="button"
              variant="primary"
              size="sm"
              disabled={isUpdatingStatus}
              onClick={() => {
                void handleStatusChange("live");
              }}
            >
              {isUpdatingStatus ? t("statusUpdating") : t("startMatchCta")}
            </FpButton>
          ) : null}

          {match.status === "live" ? (
            <>
              <Link href={`/match/live?matchId=${encodeURIComponent(match.id)}`}>
                <FpButton variant="secondary" size="sm">{t("continueMatchCta")}</FpButton>
              </Link>
              <FpButton
                type="button"
                variant="danger"
                size="sm"
                disabled={isUpdatingStatus}
                onClick={() => {
                  void handleStatusChange("completed");
                }}
              >
                {isUpdatingStatus ? t("statusUpdating") : t("finishMatchCta")}
              </FpButton>
            </>
          ) : null}
        </div>
      </AppCard>

      <AppCard className="space-y-3 p-4">
        <p className="text-sm font-semibold text-foreground">{t("timelineTitle")}</p>
        {sortedEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("timelineEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {sortedEvents.map((event) => (
              <li key={event.id} className="rounded-xl border border-fp-border bg-fp-surface-2 p-3">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    if (event.type === "goal_for") {
                      openEditModal(event);
                    }
                  }}
                >
                  <p className="text-xs font-semibold text-muted-foreground">
                    {event.minute !== null ? `${String(event.minute).padStart(2, "0")}'` : "--"}
                  </p>
                  {event.type === "goal_for" ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">⚽ {scorerLabel(event)}</p>
                      <p className="text-xs text-muted-foreground">{t("event.assistLabel", { value: assistLabel(event) })}</p>
                    </>
                  ) : event.type === "goal_against" ? (
                    <p className="text-sm font-semibold text-foreground">⚽ {t("event.opponentGoal")}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{event.type}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      {match.reportEnabled && match.reportText ? (
        <AppCard className="space-y-2 p-4">
          <p className="text-sm font-semibold text-foreground">{t("reportTitle")}</p>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{match.reportText}</p>
        </AppCard>
      ) : null}

      <AppCard className="space-y-3 p-4">
        <p className="text-sm font-semibold text-foreground">{t("actionsTitle")}</p>
        <FpButton type="button" variant="danger" size="md" onClick={() => { void handleDeleteMatch(); }}>
          {t("delete.cta")}
        </FpButton>
      </AppCard>

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
                onChange={(event) => setEditMinute(event.target.value)}
                className="w-full rounded-xl border border-fp-border bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">{t("event.scorer")}</span>
              <select
                value={editScorerId}
                onChange={(event) => setEditScorerId(event.target.value)}
                className="w-full rounded-xl border border-fp-border bg-background px-3 py-2 text-sm"
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
                onChange={(event) => setEditAssistId(event.target.value)}
                className="w-full rounded-xl border border-fp-border bg-background px-3 py-2 text-sm"
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
                onClick={() => setEditingEvent(null)}
              >
                {common("cancel")}
              </FpButton>
              <FpButton
                variant="primary"
                size="md"
                disabled={isSavingEdit}
                onClick={() => {
                  void handleSaveEdit();
                }}
              >
                {isSavingEdit ? t("event.saving") : t("event.save")}
              </FpButton>
            </div>

            <FpButton
              variant="danger"
              size="md"
              onClick={() => {
                void handleDeleteEvent();
              }}
            >
              {t("event.delete")}
            </FpButton>
          </AppCard>
        </div>
      ) : null}

      <Link href="/match">
        <FpButton variant="secondary" size="md">{t("backToList")}</FpButton>
      </Link>
    </PageShell>
  );
}
