"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { History, ShieldAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button, ButtonLink, EmptyState, ListGroup, ListRow, Notice, SkeletonList } from "@/components/ui/primitives";

interface MatchItem {
  id: string;
  teamId: string;
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

/** Planned matches are a glance ahead here; the full list lives on Kamp. */
const PLANNED_LIMIT = 3;

function startsAtMs(match: MatchItem): number {
  const time = new Date(match.startsAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function MatchHistoryManager() {
  const t = useTranslations("matchHistory");
  const common = useTranslations("common");
  const locale = useLocale();
  const auth = useAuth();
  const workspace = useTeamWorkspace();

  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [matches, setMatches] = useState<MatchItem[]>([]);
  // Loading until the first answer, so the empty state never flashes first.
  const [isLoadingMatches, setIsLoadingMatches] = useState(true);
  // Only the latest load may write (a team change or retry mid-flight).
  const loadId = useRef(0);
  const [error, setError] = useState<string | null>(null);

  // undefined = not yet chosen by user → falls back to workspace.activeTeamId
  // null = user explicitly chose "Alle lag"
  // string = specific team ID chosen by user
  const [localFilterId, setLocalFilterId] = useState<string | null | undefined>(undefined);

  const effectiveTeamId =
    localFilterId !== undefined ? localFilterId : (workspace.activeTeamId ?? null);

  const isGuestMode = workspace.mode === "guest-local" || auth.status !== "authenticated";

  // C4 (UI-HIST-01): live first, then the next few planned matches, then
  // results newest first (an unbounded list, so it goes last). Status is told
  // by the group, not by colour.
  const groups = useMemo(() => {
    const visible = effectiveTeamId ? matches.filter((match) => match.teamId === effectiveTeamId) : matches;
    return {
      live: visible.filter((match) => match.status === "live").sort((a, b) => startsAtMs(b) - startsAtMs(a)),
      completed: visible.filter((match) => match.status === "completed").sort((a, b) => startsAtMs(b) - startsAtMs(a)),
      planned: visible
        .filter((match) => match.status === "upcoming" || match.status === "draft")
        .sort((a, b) => startsAtMs(a) - startsAtMs(b)),
    };
  }, [matches, effectiveTeamId]);

  const teamNameById = useMemo(
    () => new Map(workspace.teams.map((team) => [team.id, team.name])),
    [workspace.teams]
  );
  // The team is named on each row only when rows from several teams can mix.
  const showTeamName = effectiveTeamId === null && workspace.teams.length > 1;

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const loadMatches = useCallback(async () => {
    if (workspace.teams.length === 0) return;

    const id = ++loadId.current;
    setIsLoadingMatches(true);
    setError(null);
    try {
      const results = await Promise.all(
        workspace.teams.map(async (team) => {
          const response = await fetch(`/api/matches?teamId=${encodeURIComponent(team.id)}`);
          // A team that fails is an error, not an empty history.
          if (!response.ok) throw new Error(`matches ${response.status}`);
          const data = (await response.json()) as { matches?: MatchItem[] };
          return data.matches ?? ([] as MatchItem[]);
        })
      );
      if (id === loadId.current) setMatches(results.flat());
    } catch {
      if (id === loadId.current) setError(t("errors.generic"));
    } finally {
      if (id === loadId.current) setIsLoadingMatches(false);
    }
  }, [workspace.teams, t]);

  useEffect(() => {
    if (auth.status !== "authenticated" || workspace.isLoading) return;
    void loadMatches();
  }, [auth.status, loadMatches, workspace.isLoading]);

  if (!isHydrated || auth.status === "loading" || workspace.isLoading) {
    return (
      <PageShell>
        <SectionHeader title={t("title")} />
        <SkeletonList rows={4} withDescription label={common("loading")} />
      </PageShell>
    );
  }

  if (isGuestMode) {
    return (
      <PageShell>
        <SectionHeader title={t("title")} />
        <EmptyState
          icon={ShieldAlert}
          title={t("guestTitle")}
          description={t("guestDescription")}
          action={<ButtonLink href="/auth/sign-in" variant="primary">{t("guestCta")}</ButtonLink>}
        />
      </PageShell>
    );
  }

  if (workspace.teams.length === 0) {
    return (
      <PageShell>
        <SectionHeader title={t("title")} />
        <EmptyState
          icon={ShieldAlert}
          title={t("noTeamTitle")}
          description={t("noTeamDescription")}
          action={<ButtonLink href="/team" variant="primary">{t("goToTeam")}</ButtonLink>}
        />
      </PageShell>
    );
  }

  const describe = (match: MatchItem) =>
    [
      formatDate(match.startsAt),
      match.location,
      showTeamName ? teamNameById.get(match.teamId) : null,
      match.source === "spond" ? "Spond" : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const label = (match: MatchItem) => match.opponentName?.trim() || match.title;

  const resultWord = (scoreFor: number, scoreAgainst: number) =>
    scoreFor > scoreAgainst ? t("resultWon") : scoreFor < scoreAgainst ? t("resultLost") : t("resultDraw");

  const isEmpty = groups.live.length + groups.completed.length + groups.planned.length === 0;

  return (
    <PageShell className="flex flex-col gap-6">
      <SectionHeader title={t("title")} className="mb-0" />

      {workspace.teams.length > 1 ? (
        <label className="flex items-center gap-3">
          <span className="shrink-0 text-[14px] font-medium text-fp-ink-2">{t("filterLabel")}</span>
          <select
            value={effectiveTeamId ?? ""}
            onChange={(e) => { setLocalFilterId(e.target.value || null); }}
            className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-fp-rule bg-fp-surface px-3 text-base font-medium text-fp-ink outline-none focus-visible:ring-2 focus-visible:ring-fp-focus"
          >
            <option value="">{t("filterAllTeams")}</option>
            {workspace.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {error ? (
        <Notice
          tone="error"
          action={
            <Button size="sm" onClick={() => { void loadMatches(); }}>
              {t("retry")}
            </Button>
          }
        >
          {error}
        </Notice>
      ) : null}

      {isLoadingMatches ? (
        <SkeletonList rows={4} withDescription label={common("loading")} />
      ) : error ? null : isEmpty ? (
        <EmptyState
          icon={History}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={<ButtonLink href="/match" variant="primary">{t("goToMatches")}</ButtonLink>}
          testId="history-empty"
        />
      ) : (
        <>
          {groups.live.length > 0 ? (
            <ListGroup title={t("groupLive")} testId="history-live">
              {groups.live.map((match) => (
                <ListRow
                  key={match.id}
                  href={`/match/${match.id}`}
                  label={label(match)}
                  description={describe(match)}
                  testId={`history-row-${match.id}`}
                />
              ))}
            </ListGroup>
          ) : null}

          {groups.planned.length > 0 ? (
            <ListGroup title={t("groupPlanned")} testId="history-planned">
              {groups.planned.slice(0, PLANNED_LIMIT).map((match) => (
                <ListRow
                  key={match.id}
                  href={`/match/${match.id}`}
                  label={label(match)}
                  description={describe(match)}
                  testId={`history-row-${match.id}`}
                />
              ))}
              {groups.planned.length > PLANNED_LIMIT ? (
                <ListRow
                  href="/match"
                  label={t("allPlanned")}
                  trailing={<span className="text-[14px] font-medium tabular-nums text-fp-ink-2">{groups.planned.length}</span>}
                  testId="history-all-planned"
                />
              ) : null}
            </ListGroup>
          ) : null}
          {groups.completed.length > 0 ? (
            <ListGroup title={t("groupCompleted")} testId="history-completed">
              {groups.completed.map((match) => {
                const scoreFor = match.scoreFor ?? 0;
                const scoreAgainst = match.scoreAgainst ?? 0;

                return (
                  <ListRow
                    key={match.id}
                    href={`/match/${match.id}`}
                    label={label(match)}
                    description={describe(match)}
                    trailing={
                      <span className="flex flex-col items-end leading-none">
                        <span aria-hidden className="font-num text-[28px] leading-none text-fp-ink">
                          {scoreFor}–{scoreAgainst}
                        </span>
                        <span className="sr-only">{t("scoreA11y", { scoreFor, scoreAgainst })}</span>
                        <span className="mt-1 text-[13px] font-medium text-fp-ink-2">
                          {resultWord(scoreFor, scoreAgainst)}
                        </span>
                      </span>
                    }
                    testId={`history-row-${match.id}`}
                  />
                );
              })}
            </ListGroup>
          ) : null}

        </>
      )}
    </PageShell>
  );
}
