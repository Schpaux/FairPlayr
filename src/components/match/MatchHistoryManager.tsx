"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CalendarClock, MapPin, Trophy, ShieldAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/primitives";

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
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // undefined = not yet chosen by user → falls back to workspace.activeTeamId
  // null = user explicitly chose "Alle lag"
  // string = specific team ID chosen by user
  const [localFilterId, setLocalFilterId] = useState<string | null | undefined>(undefined);

  const effectiveTeamId =
    localFilterId !== undefined ? localFilterId : (workspace.activeTeamId ?? null);

  const isGuestMode = workspace.mode === "guest-local" || auth.status !== "authenticated";

  const historyMatches = useMemo(() => {
    const completed = matches.filter((match) => match.status === "completed");
    const filtered = effectiveTeamId
      ? completed.filter((match) => match.teamId === effectiveTeamId)
      : completed;
    return filtered.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  }, [matches, effectiveTeamId]);

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

    setIsLoadingMatches(true);
    setError(null);
    try {
      const results = await Promise.all(
        workspace.teams.map(async (team) => {
          const response = await fetch(`/api/matches?teamId=${encodeURIComponent(team.id)}`);
          const payload = (await response.json()) as unknown;
          if (!response.ok) return [] as MatchItem[];
          const data = payload as { matches: MatchItem[] };
          return data.matches ?? ([] as MatchItem[]);
        })
      );
      setMatches(results.flat());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setIsLoadingMatches(false);
    }
  }, [workspace.teams, t]);

  useEffect(() => {
    if (auth.status !== "authenticated" || workspace.isLoading) return;
    void loadMatches();
  }, [auth.status, loadMatches, workspace.isLoading]);

  if (!isHydrated || auth.status === "loading" || workspace.isLoading) {
    return (
      <PageShell>
        <AppCard className="p-6 text-sm text-muted-foreground">{common("loading")}</AppCard>
      </PageShell>
    );
  }

  if (isGuestMode) {
    return (
      <PageShell className="space-y-4">
        <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />
        <EmptyState
          icon={ShieldAlert}
          title={t("guestTitle")}
          description={t("guestDescription")}
          action={
            <ButtonLink href="/auth/sign-in" variant="primary" size="sm">{t("guestCta")}</ButtonLink>
          }
        />
      </PageShell>
    );
  }

  if (workspace.teams.length === 0) {
    return (
      <PageShell className="space-y-4">
        <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />
        <EmptyState
          icon={ShieldAlert}
          title={t("noTeamTitle")}
          description={t("noTeamDescription")}
          action={
            <ButtonLink href="/team" variant="primary" size="sm">{t("goToTeam")}</ButtonLink>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell className="space-y-5">
      <SectionHeader title={t("title")} subtitle={t("subtitle")} accent />

      {/* Team filter */}
      <AppCard className="p-3">
        <label className="flex items-center gap-2.5">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {t("filterLabel")}
          </span>
          <select
            value={effectiveTeamId ?? ""}
            onChange={(e) => { setLocalFilterId(e.target.value || null); }}
            className="min-w-0 flex-1 rounded-lg border border-fp-border bg-background px-3 py-1.5 text-sm font-medium text-foreground outline-none focus:border-transparent focus:ring-2 focus:ring-ring"
          >
            <option value="">{t("filterAllTeams")}</option>
            {workspace.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      </AppCard>

      {error ? <AppCard className="p-3 text-xs text-danger">{error}</AppCard> : null}

      <div className="space-y-3">
        <h3 className="px-1 text-sm font-semibold text-foreground">{t("listTitle")}</h3>

        {isLoadingMatches ? (
          <AppCard className="p-6">
            <p className="text-center text-xs text-muted-foreground">{common("loading")}</p>
          </AppCard>
        ) : historyMatches.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <ButtonLink href="/match" variant="secondary" size="sm">{t("goToMatches")}</ButtonLink>
            }
          />
        ) : (
          <ul className="space-y-3">
            {historyMatches.map((match) => {
              const scoreFor = match.scoreFor ?? 0;
              const scoreAgainst = match.scoreAgainst ?? 0;
              const won = scoreFor > scoreAgainst;
              const draw = scoreFor === scoreAgainst;

              return (
                <li key={match.id}>
                  <AppCard className="space-y-3 p-4">
                    {/* Title + Spond badge */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-snug text-foreground">
                        {match.opponentName
                          ? `${match.title} — ${match.opponentName}`
                          : match.title}
                      </p>
                      {match.source === "spond" ? (
                        <span className="shrink-0 rounded-full border border-fp-spond-border bg-fp-spond-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fp-spond-foreground">
                          Spond
                        </span>
                      ) : null}
                    </div>

                    {/* Score + result badge */}
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-2xl font-black leading-none tabular-nums ${
                          won ? "text-fp-accent" : draw ? "text-foreground" : "text-danger"
                        }`}
                      >
                        {scoreFor} – {scoreAgainst}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                          won
                            ? "border-fp-accent/25 bg-fp-accent/10 text-fp-accent"
                            : draw
                              ? "border-fp-border bg-fp-surface text-muted-foreground"
                              : "border-danger/25 bg-danger/10 text-danger"
                        }`}
                      >
                        {won ? t("resultWon") : draw ? t("resultDraw") : t("resultLost")}
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="space-y-0.5">
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarClock size={11} />
                        {formatDate(match.startsAt)}
                      </p>
                      {match.location ? (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin size={11} />
                          {match.location}
                        </p>
                      ) : null}
                    </div>

                    {/* Primary action */}
                    <ButtonLink href={`/match/${match.id}`} variant="primary" size="sm" block>
                      {t("openMatch")}
                    </ButtonLink>
                  </AppCard>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
