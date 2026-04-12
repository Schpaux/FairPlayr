"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CalendarClock, MapPin, Trophy, ShieldAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FpButton } from "@/components/ui/FpButton";

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

function parseApiError(payload: unknown): { message: string } {
  if (typeof payload !== "object" || payload === null) {
    return { message: "Ukjent feil." };
  }
  const value = payload as Record<string, unknown>;
  return {
    message: typeof value.message === "string" ? value.message : "Ukjent feil.",
  };
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
  const [notice, setNotice] = useState<string | null>(null);

  const team = workspace.activeTeam;
  const isGuestMode = workspace.mode === "guest-local" || auth.status !== "authenticated";

  const historyMatches = useMemo(
    () =>
      matches
        .filter((match) => match.status === "completed")
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
    [matches]
  );

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
    if (!team) return;

    setIsLoadingMatches(true);
    try {
      const response = await fetch(`/api/matches?teamId=${encodeURIComponent(team.id)}`);
      const payload = (await response.json()) as unknown;
      if (!response.ok) throw new Error(parseApiError(payload).message);
      const data = payload as { matches: MatchItem[] };
      setMatches(data.matches ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setIsLoadingMatches(false);
    }
  }, [team, t]);

  useEffect(() => {
    if (auth.status !== "authenticated" || !team) return;
    setError(null);
    void loadMatches();
  }, [auth.status, loadMatches, team]);

  const handleDeleteMatch = async (matchId: string) => {
    if (!window.confirm(t("delete.confirm"))) return;

    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await response.json()) as unknown;
        throw new Error(parseApiError(payload).message);
      }

      setMatches((previous) => previous.filter((match) => match.id !== matchId));
      setNotice(t("delete.success"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    }
  };

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
            <Link href="/auth/sign-in">
              <FpButton variant="primary" size="md">{t("guestCta")}</FpButton>
            </Link>
          }
        />
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
        <h3 className="text-sm font-semibold text-foreground">{t("listTitle")}</h3>

        {isLoadingMatches ? (
          <p className="text-xs text-muted-foreground">{common("loading")}</p>
        ) : historyMatches.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Link href="/match">
                <FpButton variant="secondary" size="md">{t("goToMatches")}</FpButton>
              </Link>
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
                <li
                  key={match.id}
                  className="rounded-xl border border-fp-border bg-fp-surface-2 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {match.opponentName
                          ? `${match.title} — ${match.opponentName}`
                          : match.title}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        {t("opponentLabel", { value: match.opponentName ?? "—" })}
                      </p>

                      {/* Result badge */}
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-lg font-bold leading-none ${
                            won
                              ? "text-fp-accent"
                              : draw
                                ? "text-muted-foreground"
                                : "text-danger"
                          }`}
                        >
                          {scoreFor} – {scoreAgainst}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            won
                              ? "border border-fp-accent/30 bg-fp-accent/10 text-fp-accent"
                              : draw
                                ? "border border-fp-border bg-fp-surface text-muted-foreground"
                                : "border border-danger/30 bg-danger/10 text-danger"
                          }`}
                        >
                          {won ? t("resultWon") : draw ? t("resultDraw") : t("resultLost")}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarClock size={11} />
                        {formatDate(match.startsAt)}
                      </p>

                      {match.location ? (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin size={11} />
                          {t("locationLabel", { value: match.location })}
                        </p>
                      ) : null}

                      {match.format ? (
                        <p className="text-xs text-muted-foreground">
                          {t("formatLabel", { value: match.format })}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {match.source === "spond" ? (
                        <span className="rounded-full border border-fp-spond-border bg-fp-spond-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fp-spond-foreground">
                          Spond
                        </span>
                      ) : null}

                      {match.reportStatus === "ready" ? (
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          {t("reportBadge")}
                        </span>
                      ) : null}

                      <Link href={`/match/${match.id}`}>
                        <span className="text-xs font-medium text-primary">{t("openMatch")}</span>
                      </Link>

                      <button
                        type="button"
                        className="inline-flex items-center justify-center h-8 px-3 text-xs font-semibold rounded-lg border border-danger/30 bg-danger/10 text-danger tap-target transition-colors hover:bg-danger/20"
                        onClick={() => {
                          void handleDeleteMatch(match.id);
                        }}
                      >
                        {t("delete.cta")}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AppCard>
    </PageShell>
  );
}
