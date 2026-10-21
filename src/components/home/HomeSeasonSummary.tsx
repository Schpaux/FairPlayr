"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { Skeleton } from "@/components/ui/primitives/Skeleton";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { fetchOrNull, readJsonOrNull } from "@/lib/utils/fetchOrNull";
import type { HomeSummary } from "@/lib/server/seasonStats";

// Home's personal data, rendered on the client only (FP-OFF-01 B6/D2/D3).
//
// The server renders Home as a user-agnostic shell, so a service worker may
// cache its HTML. Everything personal is filled in here after hydration:
// - the team name follows the ACTIVE team of the client workspace, for guests
//   (local team) and signed-in users alike (D3);
// - season stats and the next fixture come from GET /api/home/summary, only
//   while online and signed in to a cloud team; offline and for guests they
//   are hidden, and nothing is cached on the device (D2).
// The server render and the hydration render have no data, so there is no
// hydration mismatch.

// ─── Data ─────────────────────────────────────────────────────────────────────

interface LoadedSummary {
  teamId: string;
  summary: HomeSummary | null;
  /** Countdown to the next fixture, computed when the data arrived. */
  countdown: { days: number; hours: number } | null;
}

interface HomeSummaryContextValue {
  /** Active team name (local or cloud), or null while unknown. */
  teamName: string | null;
  /** Server summary for the active team; null when hidden or unavailable. */
  summary: HomeSummary | null;
  countdown: { days: number; hours: number } | null;
  /** A request for the active team is in flight and nothing is shown yet. */
  isLoading: boolean;
}

const EMPTY: HomeSummaryContextValue = { teamName: null, summary: null, countdown: null, isLoading: false };

const HomeSummaryContext = createContext<HomeSummaryContextValue>(EMPTY);

function getCountdownParts(startsAt: string, nowMs: number): { days: number; hours: number } | null {
  const diffMs = new Date(startsAt).getTime() - nowMs;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  return {
    days: Math.floor(diffMs / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
  };
}

const subscribeNever = () => () => {};

/** False during SSR and hydration, true once hydrated (no hydration mismatch). */
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
}

export function HomeSummaryProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const workspace = useTeamWorkspace();
  const online = useOnlineStatus();
  // Nothing personal in the server or hydration render, whatever the providers
  // hold: the shell HTML must be the same for every user.
  const hydrated = useIsHydrated();
  const [loaded, setLoaded] = useState<LoadedSummary | null>(null);

  const teamId = workspace.activeTeamId;
  const eligible =
    hydrated &&
    online &&
    auth.status === "authenticated" &&
    workspace.mode === "cloud" &&
    !workspace.isLoading &&
    teamId !== null;

  useEffect(() => {
    if (!eligible || !teamId) return;

    const controller = new AbortController();

    void (async () => {
      const response = await fetchOrNull(`/api/home/summary?teamId=${encodeURIComponent(teamId)}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const summary = response?.ok ? await readJsonOrNull<HomeSummary>(response) : null;
      if (controller.signal.aborted) return;

      const usable = summary && summary.teamId === teamId ? summary : null;
      setLoaded({
        teamId,
        summary: usable,
        countdown: usable?.upcoming ? getCountdownParts(usable.upcoming.startsAt, Date.now()) : null,
      });
    })();

    return () => controller.abort();
    // `online` is part of `eligible`: coming back online fetches again.
  }, [eligible, teamId]);

  const current = eligible && loaded?.teamId === teamId ? loaded : null;
  const value: HomeSummaryContextValue = {
    teamName: hydrated ? (workspace.activeTeam?.name ?? null) : null,
    summary: current?.summary ?? null,
    countdown: current?.countdown ?? null,
    isLoading: eligible && current === null,
  };

  return <HomeSummaryContext.Provider value={value}>{children}</HomeSummaryContext.Provider>;
}

function useHomeSummary(): HomeSummaryContextValue {
  return useContext(HomeSummaryContext);
}

function hasSeasonStats(summary: HomeSummary | null): boolean {
  return !!summary?.stats && summary.stats.matchesPlayed > 0;
}

// ─── Formatting (unchanged from the server-rendered Home) ─────────────────────

function formatKickoff(startsAt: string): string {
  const date = new Date(startsAt);
  return (
    date.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }) +
    " · " +
    date.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })
  );
}

function formatLastMatchDay(when: string): string {
  return new Date(when).toLocaleDateString("en", { weekday: "short" });
}

function getInitials(name: string): string {
  const parts = name.split(" ");
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

// ─── Slots ────────────────────────────────────────────────────────────────────

/** The active team's name above the season label in the hero. */
export function HomeTeamName() {
  const { teamName } = useHomeSummary();
  if (!teamName) return null;

  return (
    <p
      data-testid="home-team-name"
      className="font-mono text-[13px] font-semibold uppercase tracking-wider text-fp-on-club"
    >
      {teamName}
    </p>
  );
}

/** Countdown, opponent and kickoff inside the "next match" CTA. */
export function HomeNextMatch() {
  const t = useTranslations("home");
  const { summary, countdown } = useHomeSummary();
  const upcoming = summary?.upcoming ?? null;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="rounded-full border border-fp-rule bg-fp-surface-2 text-fp-ink px-2 py-0.5 text-[10px] font-bold">
          {t("nextMatch.badge")}
        </span>
        {upcoming && countdown ? (
          <span className="font-mono text-[10px] opacity-55">
            {t("nextMatch.countdown", { days: countdown.days, hours: countdown.hours })}
          </span>
        ) : null}
      </div>
      <p className="heading-display text-[22px] leading-none">
        {upcoming ? `vs ${upcoming.opponent ?? "–"}` : t("nextMatch.setup")}
      </p>
      {upcoming && (
        <p className="mt-1.5 text-[11px] opacity-55">
          {formatKickoff(upcoming.startsAt)}
          {upcoming.location ? ` · ${upcoming.location}` : ""}
        </p>
      )}
    </div>
  );
}

/** Hint under "Kamphistorikk": the season's match count, when known. */
export function HomeHistoryHint() {
  const t = useTranslations("home");
  const { summary } = useHomeSummary();

  return (
    <p className="text-[11px] text-fp-text-secondary">
      {hasSeasonStats(summary) && summary?.stats
        ? t("actions.historyHint", { count: summary.stats.matchesPlayed })
        : t("actions.historyHintEmpty")}
    </p>
  );
}

/**
 * Season balance, last match, matches played and "needs minutes" (blocks 3–4).
 * Online and signed in only; renders nothing offline, for guests, or when the
 * team has no completed matches.
 */
export function HomeSeasonSummary() {
  const t = useTranslations("home");
  const { summary, isLoading } = useHomeSummary();

  if (isLoading) {
    return (
      <div role="status" aria-busy="true" data-testid="home-summary-loading" className="grid grid-cols-[1.4fr_1fr] gap-2">
        <span className="sr-only">{t("summary.loading")}</span>
        <Skeleton height={148} radius="group" />
        <div className="flex flex-col gap-2">
          <Skeleton height={70} radius="group" />
          <Skeleton height={70} radius="group" />
        </div>
      </div>
    );
  }

  if (!hasSeasonStats(summary) || !summary?.stats) return null;
  const stats = summary.stats;

  return (
    <div data-testid="home-season-summary" className="contents">
      {/* ── Block 3: Season balance + last match ─────────────────────── */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-2">
        {/* Left: Balance card */}
        <div className="flex flex-col justify-between rounded-[20px] bg-fp-surface p-4 shadow-[inset_0_0_0_1px_var(--fp-border)]">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-fp-ink-2 shrink-0" />
            <p className="text-[11px] font-semibold text-fp-text-secondary">{t("balance.title")}</p>
          </div>
          <div>
            <p className="font-mono text-[44px] font-bold leading-none text-foreground tabular-nums">
              {stats.balance}
              <span className="text-[22px] text-fp-text-secondary">%</span>
            </p>
            {/* Progress bar */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-fp-surface-3">
              <div className="h-full rounded-full bg-fp-ink transition-[width]" style={{ width: `${stats.balance}%` }} />
            </div>
            <p className="mt-2 text-[10px] text-fp-text-secondary">
              {t("balance.spread", {
                hours: (stats.spreadMinutes / 60).toFixed(1),
                count: stats.matchesPlayed,
              })}
            </p>
          </div>
        </div>

        {/* Right: Two stacked cards */}
        <div className="flex flex-col gap-2">
          {/* Last match */}
          {stats.lastMatch && (
            <div className="flex flex-col justify-between rounded-[20px] bg-fp-surface p-3 shadow-[inset_0_0_0_1px_var(--fp-border)]">
              <p className="font-mono text-[10px] text-fp-text-secondary">
                {t("lastMatch.title", { when: formatLastMatchDay(stats.lastMatch.when) })}
              </p>
              <div className="flex items-baseline gap-1">
                <span className="text-[11px] font-bold text-fp-ink">{t(`lastMatch.${stats.lastMatch.result}`)}</span>
                <span className="font-mono text-base font-bold text-foreground tabular-nums">
                  {stats.lastMatch.scoreFor}–{stats.lastMatch.scoreAgainst}
                </span>
              </div>
            </div>
          )}

          {/* Played */}
          <div className="flex flex-1 flex-col justify-between rounded-[20px] bg-fp-surface p-3 shadow-[inset_0_0_0_1px_var(--fp-border)]">
            <p className="font-mono text-[10px] text-fp-text-secondary">{t("played")}</p>
            <p className="font-mono text-xl font-bold tabular-nums text-foreground">{stats.matchesPlayed}</p>
          </div>
        </div>
      </div>

      {/* ── Block 4: Needs minutes ──────────────────────────────────── */}
      {stats.needsMinutes.length > 0 && (
        <div className="rounded-[20px] bg-fp-surface p-4 shadow-[inset_0_0_0_1px_var(--fp-border)]">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-[13px] font-semibold text-foreground">{t("needsMinutes.title")}</p>
            <span className="rounded-full bg-fp-surface-2 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-fp-text-secondary">
              {t("needsMinutes.subtitle")}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {stats.needsMinutes.map((player) => (
              <div key={player.playerId} className="flex items-center gap-3">
                {/* Avatar */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fp-club-disc text-[11px] font-black text-fp-on-club">
                  {getInitials(player.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground">{player.name}</p>
                  <p className="text-[11px] text-fp-text-secondary">
                    {player.position ?? "–"} · {player.totalMinutes}min
                  </p>
                </div>
                <span className="rounded-full bg-fp-surface-2 px-2 py-0.5 text-[11px] font-bold text-fp-warn-text">
                  {t("needsMinutes.deficit", { hours: (player.deficitMinutes / 60).toFixed(1) })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
