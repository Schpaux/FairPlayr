"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { ButtonLink, ListGroup, ListRow } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/primitives/Skeleton";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { fetchOrNull, readJsonOrNull } from "@/lib/utils/fetchOrNull";
import type { HomeSummary } from "@/lib/server/seasonStats";

// Home's personal data, rendered on the client only (FP-OFF-01 B6/D2/D3).
//
// The server renders Home as a user-agnostic shell, so a service worker may
// cache its HTML. Everything personal is filled in here after hydration:
// - the panel follows the ACTIVE team of the client workspace and this
//   device's running match, for guests and signed-in users alike (D3);
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
  /** Server summary for the active team; null when hidden or unavailable. */
  summary: HomeSummary | null;
  countdown: { days: number; hours: number } | null;
  /** A request for the active team is in flight and nothing is shown yet. */
  isLoading: boolean;
  /** Hydrated, the workspace has loaded and it holds no team at all. */
  hasNoTeam: boolean;
}

const EMPTY: HomeSummaryContextValue = {
  summary: null,
  countdown: null,
  isLoading: false,
  hasNoTeam: false,
};

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
    summary: current?.summary ?? null,
    countdown: current?.countdown ?? null,
    isLoading: eligible && current === null,
    hasNoTeam: hydrated && !workspace.isLoading && workspace.teams.length === 0,
  };

  return <HomeSummaryContext.Provider value={value}>{children}</HomeSummaryContext.Provider>;
}

function useHomeSummary(): HomeSummaryContextValue {
  return useContext(HomeSummaryContext);
}


// ─── Formatting ───────────────────────────────────────────────────────────────

function formatKickoff(startsAt: string, locale: string): string {
  const date = new Date(startsAt);
  return (
    date.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }) +
    " · " +
    date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
  );
}

/**
 * A faint centre-circle arc in the panel corner: the one piece of decorative
 * geometry in the system (DESIGN.md §7), at 14 % stroke.
 */
function CentreCircleArc() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 160"
      className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 text-fp-on-club"
      fill="none"
    >
      <circle cx="80" cy="80" r="64" stroke="currentColor" strokeOpacity="0.14" strokeWidth="2" />
    </svg>
  );
}

// ─── Slots ────────────────────────────────────────────────────────────────────

/**
 * The one club-green fixture panel (DESIGN.md §7) with the screen's single lime
 * action. In order: the match running on this device, the next fixture, or a
 * new setup; a workspace without a team is sent to create one first.
 * The server and hydration render show the plain "set up" state, so the shell
 * HTML is the same for every user; the action waits for hydration, so a coach
 * back mid-match is never offered "set up" first. The team is named by the
 * header's team switcher, not repeated here.
 */
export function HomeFixturePanel() {
  const t = useTranslations("home.fixture");
  const locale = useLocale();
  const hydrated = useIsHydrated();
  const { summary, countdown, hasNoTeam } = useHomeSummary();
  const { activeMatch, activeMatchHref } = useActiveMatch();
  const live = hydrated && activeMatch?.status === "live" ? activeMatch : null;
  const upcoming = summary?.upcoming ?? null;

  let kicker: string;
  let title: string;
  let detail: string | null = null;
  let action: { href: string; label: string; accessibleName?: string };

  if (live) {
    kicker = t("liveLabel");
    title = live.title || t("liveTitle");
    detail = t("liveHint");
    // Starts with the visible label (WCAG 2.5.3), then says what it opens.
    action = { href: activeMatchHref, label: t("continue"), accessibleName: `${t("continue")} – ${t("liveLabel")}` };
  } else if (hasNoTeam) {
    kicker = t("nextLabel");
    title = t("noTeamTitle");
    detail = t("noTeamHint");
    action = { href: "/team", label: t("noTeamAction") };
  } else if (upcoming) {
    kicker = countdown ? `${t("nextLabel")} · ${t("countdown", countdown)}` : t("nextLabel");
    title = upcoming.opponent ? t("versus", { opponent: upcoming.opponent }) : t("unknownOpponent");
    detail = formatKickoff(upcoming.startsAt, locale) + (upcoming.location ? ` · ${upcoming.location}` : "");
    // MATCH-13: set up this planned match, so it starts as that server match.
    action = { href: `/match/setup?matchId=${encodeURIComponent(upcoming.matchId)}`, label: t("setup") };
  } else {
    kicker = t("nextLabel");
    title = t("noFixture");
    detail = t("noFixtureHint");
    action = { href: "/match/setup", label: t("setup") };
  }

  return (
    <div
      data-testid="home-fixture-panel"
      data-state={live ? "live" : hasNoTeam ? "no-team" : upcoming ? "upcoming" : "setup"}
      className="relative overflow-hidden rounded-[20px] bg-fp-club p-5 text-fp-on-club"
    >
      <CentreCircleArc />
      <div className="relative flex flex-col gap-1">
        <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-on-club-2">
          {/* A steady dot: no ambient motion (DESIGN.md §4). */}
          {live ? <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-fp-on-club" aria-hidden /> : null}
          {kicker}
        </p>
        <h1
          className="mt-1 text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-fp-on-club [overflow-wrap:break-word]"
        >
          {title}
        </h1>
        {detail ? <p className="text-[14px] font-medium text-fp-on-club-2">{detail}</p> : null}
      </div>
      {hydrated ? (
        <ButtonLink
          href={action.href}
          variant="primary"
          block
          // The global focus ring is club green in light mode: invisible here.
          className="relative mt-5 focus-visible:ring-fp-on-club focus-visible:ring-offset-fp-club"
          aria-label={action.accessibleName}
          data-testid="home-primary-action"
        >
          {action.label}
        </ButtonLink>
      ) : (
        <div aria-hidden className="relative mt-5 h-[52px]" />
      )}
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  /** Read instead of `value` by screen readers ("2 mot 1" for "2–1"). */
  spokenValue?: string;
  note?: string;
  /** A missing value: shown quieter than a real number. */
  muted?: boolean;
  testId?: string;
}

// A div per dt/dd group is valid inside <dl>; the value and note are two dd.
function Stat({ label, value, spokenValue, note, muted, testId }: StatProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3 py-3 first:pl-4 last:pr-4" data-testid={testId}>
      <dt className="text-[14px] font-medium text-fp-ink-2">{label}</dt>
      <dd
        className={
          muted
            ? "m-0 text-[16px] font-semibold leading-snug text-fp-ink-2 [overflow-wrap:break-word]"
            : "m-0 text-[20px] font-bold leading-tight tabular-nums text-fp-ink [overflow-wrap:break-word]"
        }
      >
        {spokenValue ? (
          <>
            <span aria-hidden>{value}</span>
            <span className="sr-only">{spokenValue}</span>
          </>
        ) : (
          value
        )}
      </dd>
      {note ? <dd className="m-0 text-[14px] font-medium text-fp-ink-2">{note}</dd> : null}
    </div>
  );
}

/**
 * The season as compact numbers, then who has played least. Online and signed
 * in only; nothing offline, for guests, or before the team's first completed
 * match. With no match whose playing time could be counted, the balance reads
 * "no data" instead of a perfect score (UI-HOME-NODATA-01).
 */
export function HomeSeasonSummary() {
  const t = useTranslations("home");
  const { summary, isLoading } = useHomeSummary();

  if (isLoading) {
    return (
      <div role="status" aria-busy="true" data-testid="home-summary-loading" className="flex flex-col gap-2">
        <span className="sr-only">{t("summary.loading")}</span>
        <Skeleton height={20} width="40%" />
        <Skeleton height={84} radius="group" />
      </div>
    );
  }

  const stats = summary?.stats ?? null;
  if (!stats || stats.matchesPlayed === 0) return null;

  // `timedMatches` is absent only from a server older than this client (a
  // short deploy window): fail closed and say "no data" rather than 100 %.
  const timedMatches = stats.timedMatches ?? 0;
  const hasData = timedMatches > 0;
  const last = stats.lastMatch;

  let hint: string;
  if (!hasData) hint = t("summary.noDataHint");
  else if (timedMatches < stats.matchesPlayed) hint = t("summary.partial", { timed: timedMatches, played: stats.matchesPlayed });
  else hint = t("summary.spread", { minutes: stats.spreadMinutes });

  return (
    <div data-testid="home-season-summary" className="flex flex-col gap-6">
      <section aria-labelledby="home-season-title">
        <h2
          id="home-season-title"
          className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2"
        >
          {t("summary.title")}
        </h2>
        <dl className="m-0 grid grid-cols-3 divide-x divide-fp-rule rounded-[14px] border border-fp-rule bg-fp-surface">
          <Stat label={t("summary.played")} value={String(stats.matchesPlayed)} testId="home-stat-played" />
          <Stat
            label={t("summary.balance")}
            value={hasData ? t("summary.balanceValue", { balance: stats.balance }) : t("summary.noData")}
            muted={!hasData}
            testId="home-stat-balance"
          />
          {last ? (
            <Stat
              label={t("summary.lastMatch")}
              value={`${last.scoreFor}–${last.scoreAgainst}`}
              spokenValue={t("summary.scoreSpoken", { for: last.scoreFor, against: last.scoreAgainst })}
              note={t(`summary.${last.result}`)}
              testId="home-stat-last"
            />
          ) : (
            <Stat label={t("summary.lastMatch")} value="–" spokenValue={t("summary.noLastMatch")} muted testId="home-stat-last" />
          )}
        </dl>
        <p className="mt-2 px-1 text-[14px] text-fp-ink-2" data-testid="home-season-hint">
          {hint}
        </p>
      </section>

      {hasData && stats.needsMinutes.length > 0 ? (
        <ListGroup title={t("needsMinutes.title")} testId="home-needs-minutes">
          {stats.needsMinutes.map((player) => (
            <ListRow
              key={player.playerId}
              label={player.name}
              trailing={
                <span className="font-bold tabular-nums text-fp-ink">
                  {t("needsMinutes.total", { minutes: player.totalMinutes })}
                </span>
              }
            />
          ))}
        </ListGroup>
      ) : null}
    </div>
  );
}
