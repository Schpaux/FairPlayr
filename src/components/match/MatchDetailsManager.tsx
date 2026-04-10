"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { PageShell } from "@/components/ui/PageShell";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { createLiveMatchFromSetup, startLiveMatch } from "@/domain/liveMatch";
import { autoFillLineup, createMatchSetup, setSelectedSquad, type MatchFormat } from "@/domain/match";
import { activateMatch, saveMatchSetupDraft } from "@/lib/storage/matchStorage";
import { saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FpButton } from "@/components/ui/FpButton";

interface MatchDetails {
  id: string;
  title: string;
  teamId: string;
  opponentName: string | null;
  startsAt: string;
  location: string | null;
  status: "draft" | "upcoming" | "live" | "completed";
  source: "manual" | "spond";
  externalEventId: string | null;
  rsvpLastSyncedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

function inferFormatFromSquadSize(playerCount: number): MatchFormat {
  if (playerCount >= 11) return "11v11";
  if (playerCount >= 9) return "9v9";
  if (playerCount >= 7) return "7v7";
  if (playerCount >= 5) return "5v5";
  return "3v3";
}

interface RsvpSnapshot {
  snapshotId: string;
  syncedAt: string;
  counts: {
    accepted: number;
    declined: number;
    unanswered: number;
    unconfirmed: number;
    waitinglist: number;
    total: number;
  };
  entries: Array<{
    externalMemberId: string;
    playerId: string | null;
    memberName: string;
    response: "accepted" | "declined" | "unanswered" | "unconfirmed" | "waitinglist";
    isOwner: boolean;
  }>;
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

export function MatchDetailsManager({ matchId }: { matchId: string }) {
  const t = useTranslations("matchPlanner");
  const common = useTranslations("common");
  const locale = useLocale();
  const auth = useAuth();
  const workspace = useTeamWorkspace();
  const router = useRouter();
  const { refreshActiveMatch } = useActiveMatch();

  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [snapshot, setSnapshot] = useState<RsvpSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingRsvp, setIsSyncingRsvp] = useState(false);
  const [isLoadingRsvp, setIsLoadingRsvp] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  const mapError = useCallback((message: string) => {
    if (message.includes("Kampen er ikke koblet")) {
      return t("errors.matchNotSpond");
    }

    return message;
  }, [t]);

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

  useEffect(() => {
    if (auth.status !== "authenticated") {
      setIsLoading(false);
      return;
    }

    void (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, {
          method: "GET",
        });

        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          throw new Error(parseApiError(payload).message);
        }

        const data = payload as { match: MatchDetails };
        setMatch(data.match);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : t("errors.generic");
        setError(mapError(message));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [auth.status, mapError, matchId, t]);

  useEffect(() => {
    if (!match || match.source !== "spond" || auth.status !== "authenticated") {
      setSnapshot(null);
      return;
    }

    void (async () => {
      setIsLoadingRsvp(true);

      try {
        const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}/rsvp`, {
          method: "GET",
        });
        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          throw new Error(parseApiError(payload).message);
        }

        const data = payload as { snapshot: RsvpSnapshot | null };
        setSnapshot(data.snapshot ?? null);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : t("errors.generic");
        setError(mapError(message));
      } finally {
        setIsLoadingRsvp(false);
      }
    })();
  }, [auth.status, mapError, match, t]);

  const handleSyncRsvp = async () => {
    if (!match) {
      return;
    }

    setError(null);
    setNotice(null);
    setIsSyncingRsvp(true);

    try {
      const response = await fetch("/api/integrations/spond/sync-rsvp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ matchId: match.id }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(parseApiError(payload).message);
      }

      const data = payload as RsvpSnapshot;
      setSnapshot(data);
      setNotice(t("rsvpUpdatedNotice"));
      setMatch((previous) =>
        previous
          ? {
              ...previous,
              rsvpLastSyncedAt: data.syncedAt,
            }
          : previous
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("errors.generic");
      setError(mapError(message));
    } finally {
      setIsSyncingRsvp(false);
    }
  };

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

      if (status === "live") {
        const team = workspace.teams.find((candidate) => candidate.id === resolvedMatch.teamId) ?? null;

        if (team && team.players.length > 0) {
          const playerIds = team.players.map((player) => player.id);
          const format = inferFormatFromSquadSize(playerIds.length);

          let setup = createMatchSetup(team.id, format);
          setup = setSelectedSquad(setup, playerIds);
          setup = autoFillLineup(setup);

          saveMatchSetupDraft(setup);
          activateMatch(setup);

          const live = startLiveMatch(createLiveMatchFromSetup(setup), Date.now());
          saveStoredLiveMatch(live);
        }
      }

      await refreshActiveMatch();

      if (status === "live") {
        setNotice(t("startedNotice"));
        router.push(`/match/live?matchId=${encodeURIComponent(resolvedMatch.id)}`);
      } else {
        setNotice(t("completedNotice"));
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("errors.generic");
      setError(mapError(message));
    } finally {
      setIsUpdatingStatus(false);
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

  const startsAt = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(match.startsAt));

  return (
    <PageShell className="space-y-4">
      <SectionHeader title={t("detailsTitle")} subtitle={match.title} accent />

      {notice ? <AppCard className="p-3 text-xs text-fp-accent">{notice}</AppCard> : null}
      {error ? <AppCard className="p-3 text-xs text-danger">{error}</AppCard> : null}

      <AppCard className="space-y-2 p-4">
        {match.source === "spond" ? (
          <span className="inline-flex rounded-full border border-fp-spond-border bg-fp-spond-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fp-spond-foreground">
            {t("spondBadge")}
          </span>
        ) : null}
        <p className="text-sm font-semibold text-foreground">{match.title}</p>
        {match.opponentName ? <p className="text-xs text-muted-foreground">{t("vs", { opponent: match.opponentName })}</p> : null}
        <p className="text-xs text-muted-foreground">{t("timeLabel", { value: startsAt })}</p>
        <p className="text-xs text-muted-foreground">{t("locationLabel", { value: match.location ?? t("noLocation") })}</p>
        <p className="text-xs text-muted-foreground">{t("statusLabel", { value: formatStatus(match.status) })}</p>
        {match.source === "spond" ? (
          <p className="text-xs text-muted-foreground">
            {t("lastRsvpSync", { value: formatDate(match.rsvpLastSyncedAt ?? snapshot?.syncedAt ?? null) })}
          </p>
        ) : null}

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

      {match.source === "spond" ? (
        <AppCard className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{t("rsvpTitle")}</p>
            <FpButton
              type="button"
              variant="primary"
              size="sm"
              disabled={isSyncingRsvp}
              onClick={() => {
                void handleSyncRsvp();
              }}
            >
              {isSyncingRsvp ? t("syncRsvpLoading") : t("syncRsvpCta")}
            </FpButton>
          </div>

          {isLoadingRsvp ? (
            <p className="text-xs text-muted-foreground">{common("loading")}</p>
          ) : null}

          {snapshot ? (
            <>
              <p className="text-xs text-muted-foreground">
                {t("rsvpCounts", {
                  accepted: snapshot.counts.accepted,
                  declined: snapshot.counts.declined,
                  unanswered: snapshot.counts.unanswered,
                  unconfirmed: snapshot.counts.unconfirmed,
                  waitinglist: snapshot.counts.waitinglist,
                })}
              </p>
              <ul className="space-y-1">
                {snapshot.entries.map((entry) => (
                  <li key={entry.externalMemberId} className="flex items-center justify-between gap-2 rounded-lg border border-fp-border bg-fp-surface-2 px-2 py-1 text-xs">
                    <span className="truncate text-foreground">{entry.memberName}</span>
                    <span className="uppercase tracking-wide text-muted-foreground">{t(`rsvpStatus.${entry.response}`)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : !isLoadingRsvp ? (
            <p className="text-xs text-muted-foreground">{t("rsvpEmpty")}</p>
          ) : null}
        </AppCard>
      ) : null}

      <Link href="/match">
        <FpButton variant="secondary" size="md">{t("backToList")}</FpButton>
      </Link>
    </PageShell>
  );
}
