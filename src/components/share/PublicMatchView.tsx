"use client";

/**
 * FEAT-SHARE-01: the public match page. One link goes from a countdown to a
 * live view and then a summary; what it shows comes from the server's
 * filtered answer only (src/domain/matchShare.ts).
 *
 * - Before the match: teams, kick-off and a countdown. Without a kick-off
 *   time, or once it has passed, it is «Venter på avspark» (no countdown)
 *   until the coach starts the match.
 * - During it: a LIVE badge with a quiet red pulse (solid with reduced
 *   motion), and the score and goals when the level shares them. With only
 *   «Del oppsummering» it just says the match is in progress.
 * - After it: the public summary first when it is shared (a calm waiting
 *   state until it is written), and the final status per level.
 * - The page refreshes itself (polling, calm after the match, paused while
 *   hidden, at once when shown again) and always says when the coach last
 *   updated and when it last checked; old data is marked as possibly out of
 *   date, never shown as fresh.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import { EventTimeline, type TimelineEntry } from "@/components/match/EventTimeline";
import { Skeleton } from "@/components/ui/primitives";
import {
  LIVE_STALE_AFTER_MINUTES,
  buildFactualSummary,
  minutesSince,
  publicMatchMinute,
  publicRefreshIntervalMs,
  sanitizePublicMatchShare,
  type PublicMatchShare,
} from "@/domain/matchShare";

interface PublicMatchViewProps {
  token: string;
  locale: "no" | "en";
  initialShare: PublicMatchShare | null;
  initialFetchedAt: string;
}

const TIME_ZONE = "Europe/Oslo";

function intlLocale(locale: "no" | "en"): string {
  return locale === "no" ? "nb-NO" : "en-GB";
}

export function PublicMatchView({ token, locale, initialShare, initialFetchedAt }: PublicMatchViewProps) {
  const t = useTranslations("publicMatch");
  const [share, setShare] = useState<PublicMatchShare | null>(initialShare);
  const [fetchedAt, setFetchedAt] = useState(initialFetchedAt);
  const [fetchFailed, setFetchFailed] = useState(false);
  // Starts at the server's time, so the first client render matches the HTML.
  const [nowMs, setNowMs] = useState(() => Date.parse(initialFetchedAt));
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch(`/api/public/matches/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (response.status === 404) {
        // Turned off (or never valid): stop showing what it was.
        setShare(null);
        setFetchFailed(false);
        setFetchedAt(new Date().toISOString());
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { share?: unknown; fetchedAt?: unknown };
      setShare(sanitizePublicMatchShare(body.share));
      setFetchedAt(typeof body.fetchedAt === "string" ? body.fetchedAt : new Date().toISOString());
      setFetchFailed(false);
    } catch {
      setFetchFailed(true);
    } finally {
      inFlight.current = false;
    }
  }, [token]);

  // Clock for the countdown, the match minute and the freshness line.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Refresh while the share is on (calmly once the match is over, so a
  // revoked link, a lower level or a correction still arrives); paused while
  // hidden, and checked at once when the page is shown again.
  const intervalMs = publicRefreshIntervalMs(share);
  useEffect(() => {
    if (intervalMs === null) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [intervalMs, refresh]);

  const timeFormat = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
  const formatTime = (iso: string | null) => {
    const at = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(at) ? "" : timeFormat.format(at);
  };

  if (!share) {
    return (
      <PublicShell footer={t("footer")} brand={t("brand")}>
        <section className="rounded-[20px] border border-fp-rule bg-fp-surface p-5" data-testid="public-match-unavailable">
          <h1 className="text-[20px] font-semibold leading-[1.2] tracking-[-0.01em] text-fp-ink">{t("unavailableTitle")}</h1>
          <p className="mt-2 text-base text-fp-ink-2">{t("unavailableBody")}</p>
        </section>
      </PublicShell>
    );
  }

  const opponent = share.opponentName ?? t("opponentFallback");
  const kickoffMs = share.startsAt ? Date.parse(share.startsAt) : NaN;
  const kickoffLabel = Number.isNaN(kickoffMs)
    ? ""
    : new Intl.DateTimeFormat(intlLocale(locale), {
        timeZone: TIME_ZONE,
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }).format(kickoffMs);

  const liveData = share.phase === "live" && share.shareLive ? share.live : null;
  const minute = publicMatchMinute(liveData, nowMs);
  const sinceUpdate = minutesSince(liveData?.updatedAt ?? null, nowMs);
  const stale = sinceUpdate !== null && sinceUpdate >= LIVE_STALE_AFTER_MINUTES;

  const statusLabel =
    share.phase === "upcoming"
      ? t("status.upcoming")
      : share.phase === "completed"
        ? t("status.completed")
        : share.shareLive
          ? t("status.live")
          : t("status.inProgress");

  const resultWord = share.score && share.phase === "completed"
    ? share.score.for > share.score.against
      ? t("result.win")
      : share.score.for === share.score.against
        ? t("result.draw")
        : t("result.loss")
    : null;

  const timeline: TimelineEntry[] = (share.goals ?? []).map((goal, index) => ({
    id: String(index),
    minute: goal.minute,
    side: goal.side,
    kind: "goal",
    primary: goal.scorer ?? null,
    secondary: goal.assist ?? null,
  }));

  // The AI text is Norwegian; the English page gets the factual text.
  const summaryText =
    share.summary?.status === "ready"
      ? locale === "no"
        ? share.summary.text
        : buildFactualSummary(share, "en")
      : null;

  return (
    <PublicShell footer={t("footer")} brand={t("brand")}>
      <section className="rounded-[20px] bg-fp-club p-5 text-fp-on-club sm:p-7" data-testid="public-match-hero">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold uppercase leading-tight tracking-[0.06em] text-fp-on-club-2">
            {kickoffLabel ? t("kickoff", { time: kickoffLabel }) : null}
          </p>
          <StatusBadge label={statusLabel} live={share.phase === "live" && share.shareLive} />
        </div>
        <h1 className="mt-3 text-[24px] font-bold leading-[1.15] tracking-[-0.02em] [overflow-wrap:anywhere] sm:text-[30px]">
          {share.teamName}
          <span className="text-fp-on-club-2"> – </span>
          {opponent}
        </h1>

        {share.phase === "upcoming" ? (
          <Countdown kickoffMs={kickoffMs} nowMs={nowMs} />
        ) : null}

        {share.phase !== "upcoming" && share.score ? (
          <p className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1" data-testid="public-match-score">
            <span aria-hidden className="font-num text-[56px] leading-[0.9] sm:text-[72px]">
              {share.score.for}
              <span className="px-2 text-fp-on-club-2">–</span>
              {share.score.against}
            </span>
            <span className="sr-only" aria-live="polite">
              {t("scoreA11y", { team: share.teamName, scoreFor: share.score.for, opponent, scoreAgainst: share.score.against })}
            </span>
            {resultWord ? <span className="text-base font-semibold">{resultWord}</span> : null}
          </p>
        ) : null}

        {liveData ? (
          <p className="mt-3 text-base font-semibold text-fp-on-club" data-testid="public-match-phase">
            {liveData.phase ? t(`phase.${liveData.phase}`) : t("inProgress")}
            {minute ? <span className="font-num text-[22px] leading-none"> · {t("minute", { minute })}</span> : null}
          </p>
        ) : null}

        {share.phase === "live" && !share.shareLive ? (
          <div className="mt-4" data-testid="public-match-in-progress">
            <p className="text-[20px] font-semibold">{t("inProgress")}</p>
            <p className="mt-1 text-[15px] text-fp-on-club-2">{t("inProgressSummaryOnly")}</p>
          </div>
        ) : null}

        {share.phase === "live" && share.shareLive && !share.score ? (
          <p className="mt-2 text-[15px] text-fp-on-club-2">{t("inProgressStatusOnly")}</p>
        ) : null}

        {share.phase === "completed" && !share.score ? (
          <p className="mt-4 text-[20px] font-semibold">{t("completed")}</p>
        ) : null}
      </section>

      {liveData || (share.phase === "upcoming") ? (
        <Freshness
          lastChange={liveData ? liveData.updatedAt : null}
          sinceUpdate={sinceUpdate}
          stale={stale}
          checkedAt={fetchedAt}
          fetchFailed={fetchFailed}
          formatTime={formatTime}
        />
      ) : null}

      {share.phase === "completed" && share.shareSummary ? (
        <section className="rounded-[14px] border border-fp-rule bg-fp-surface p-5 sm:p-6" aria-labelledby="public-summary-title">
          <h2 id="public-summary-title" className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2">
            {t("summaryTitle")}
          </h2>
          <div aria-live="polite">
            {summaryText ? (
              <SummaryText text={summaryText} />
            ) : (
              <div className="mt-3 flex flex-col gap-3" data-testid="public-match-summary-pending">
                <Skeleton width="70%" height={18} />
                <Skeleton height={14} />
                <p className="text-[15px] text-fp-ink-2">{t("summaryPending")}</p>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {share.goals && share.phase !== "upcoming" ? (
        <section aria-labelledby="public-goals-title" className="space-y-2">
          <h2 id="public-goals-title" className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2">
            {share.phase === "completed" && share.shareSummary ? t("finalStatusTitle") : t("goalsTitle")}
          </h2>
          {timeline.length > 0 ? (
            <EventTimeline entries={timeline} opponentName={opponent} label={t("goalsLabel")} testId="public-match-goals" />
          ) : (
            <p className="px-1 text-[15px] text-fp-ink-2">{share.phase === "completed" ? t("noGoalsFinal") : t("noGoals")}</p>
          )}
        </section>
      ) : null}
    </PublicShell>
  );
}

function PublicShell({ children, footer, brand }: { children: React.ReactNode; footer: string; brand: string }) {
  return (
    <div className="min-h-dvh bg-fp-canvas text-fp-ink">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] sm:gap-5 sm:px-6 sm:pt-10">
        <p className="px-1 text-[15px] font-bold tracking-[-0.01em] text-fp-ink">{brand}</p>
        {children}
        <p className="px-1 pt-2 text-[14px] text-fp-ink-2">{footer}</p>
      </main>
    </div>
  );
}

/** The stored text: a short headline on the first line, then the paragraph(s). */
function SummaryText({ text }: { text: string }) {
  const [first, ...rest] = text.split("\n");
  const body = rest.join("\n").trim();
  return (
    <div className="mt-3 space-y-2" data-testid="public-match-summary">
      <p className={body ? "text-[18px] font-semibold leading-snug text-fp-ink" : "text-base leading-relaxed text-fp-ink"}>{first}</p>
      {body ? <p className="whitespace-pre-line text-base leading-relaxed text-fp-ink">{body}</p> : null}
    </div>
  );
}

function StatusBadge({ label, live }: { label: string; live: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-2 rounded-full bg-fp-tag px-3 py-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-on-tag"
      data-testid="public-match-status"
    >
      {live ? <span aria-hidden className="fp-live-pulse size-2.5 rounded-full bg-fp-danger" /> : null}
      {label}
    </span>
  );
}

function Countdown({ kickoffMs, nowMs }: { kickoffMs: number; nowMs: number }) {
  const t = useTranslations("publicMatch");
  const remaining = Number.isNaN(kickoffMs) ? 0 : kickoffMs - nowMs;

  if (remaining <= 0) {
    return (
      <div className="mt-4" data-testid="public-match-waiting">
        <p className="text-[20px] font-semibold">{t("waitingForKickoff")}</p>
        <p className="mt-1 text-[15px] text-fp-on-club-2">{t("waitingForKickoffHelp")}</p>
      </div>
    );
  }

  const totalMinutes = Math.floor(remaining / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const text =
    totalMinutes < 1
      ? t("countdown.lessThanMinute")
      : days > 0
        ? t("countdown.days", { days, hours })
        : hours > 0
          ? t("countdown.hours", { hours, minutes })
          : t("countdown.minutes", { minutes });

  return (
    <div className="mt-4" data-testid="public-match-countdown">
      <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-on-club-2">{t("countdownLabel")}</p>
      <p className="mt-1 font-num text-[40px] leading-[0.95] sm:text-[52px]">{text}</p>
    </div>
  );
}

function Freshness({
  lastChange,
  sinceUpdate,
  stale,
  checkedAt,
  fetchFailed,
  formatTime,
}: {
  lastChange: string | null;
  sinceUpdate: number | null;
  stale: boolean;
  checkedAt: string;
  fetchFailed: boolean;
  formatTime: (iso: string | null) => string;
}) {
  const t = useTranslations("publicMatch");

  return (
    <div className="space-y-1 px-1 text-[14px] text-fp-ink-2" data-testid="public-match-freshness">
      {lastChange ? (
        <p>
          {sinceUpdate !== null && sinceUpdate >= 1
            ? t("freshness.lastChangeAgo", { minutes: sinceUpdate, time: formatTime(lastChange) })
            : t("freshness.lastChange", { time: formatTime(lastChange) })}
        </p>
      ) : null}
      {stale && sinceUpdate !== null ? (
        <p className="flex items-start gap-1.5 font-medium text-fp-warn-text" data-testid="public-match-stale">
          <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
          {t("freshness.stale", { minutes: sinceUpdate })}
        </p>
      ) : null}
      {fetchFailed ? (
        <p className="flex items-start gap-1.5 font-medium text-fp-warn-text" role="status">
          <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
          {t("freshness.fetchFailed", { time: formatTime(checkedAt) })}
        </p>
      ) : (
        <p>
          {t("freshness.checked", { time: formatTime(checkedAt) })} · {t("freshness.autoRefresh")}
        </p>
      )}
    </div>
  );
}
