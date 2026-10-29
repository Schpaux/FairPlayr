"use client";

/**
 * FEAT-SHARE-01: the public match page. One link goes from a countdown to a
 * live view and then a summary; what it shows comes from the server's
 * filtered answer only (src/domain/matchShare.ts).
 *
 * - Before the match: teams, kick-off and a countdown. Without a kick-off
 *   time, or once it has passed, it is «Venter på avspark» (no countdown)
 *   until the coach starts the match.
 * - The match starts with the coach's first ▶, not with «Start kampen»
 *   (the server answers "upcoming" until the clock has started).
 * - During it: a LIVE badge with a quiet red pulse (solid with reduced
 *   motion), the score between the two teams when the level shares it, and
 *   the match clock, worked out here between updates (half, pause, stoppage).
 *   With only «Del oppsummering» it just says the match is in progress.
 * - After it: the public summary first when it is shared (a calm waiting
 *   state until it is written), and the final status per level.
 * - Updates: a Realtime «oppdatert» hint (no data) makes the page read the
 *   filtered public answer at once; a calm poll stays as the fallback, and
 *   the page reads again when (re)connected, back online or shown again
 *   (publicRefresh.ts: one read at a time, bursts become one). The card says
 *   when the match data last changed; old data or no contact is said in one
 *   short line, never shown as fresh.
 * - Lineup (FEAT-SHARE-04, «Vis lagoppstilling og benk»): the planned start
 *   before kick-off, who is on the pitch and bench while live, the starting
 *   lineup after the match (with «Del oppsummering»). Last on the page, so a
 *   missing lineup never holds up the rest.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { EventTimeline, type TimelineEntry } from "@/components/match/EventTimeline";
import { PublicMatchHero } from "@/components/share/PublicMatchHero";
import { PublicLineup } from "@/components/share/PublicLineup";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Skeleton } from "@/components/ui/primitives";
import { createRefreshCoordinator, type RefreshCoordinator } from "@/lib/share/publicRefresh";
import {
  buildFactualSummary,
  publicRefreshIntervalMs,
  sanitizePublicMatchShare,
  type PublicMatchShare,
} from "@/domain/matchShare";

interface PublicMatchViewProps {
  token: string;
  locale: "no" | "en";
  initialShare: PublicMatchShare | null;
  initialFetchedAt: string;
  /** The share's Realtime topic (no token in it); without one the page only polls. */
  signalTopic?: string | null;
}

export function PublicMatchView({ token, locale, initialShare, initialFetchedAt, signalTopic = null }: PublicMatchViewProps) {
  const t = useTranslations("publicMatch");
  const [share, setShare] = useState<PublicMatchShare | null>(initialShare);
  const [fetchedAt, setFetchedAt] = useState(initialFetchedAt);
  const [fetchFailed, setFetchFailed] = useState(false);
  // Starts at the server's time, so the first client render matches the HTML.
  const [nowMs, setNowMs] = useState(() => Date.parse(initialFetchedAt));
  const [realtime, setRealtime] = useState(false);
  const coordinator = useRef<RefreshCoordinator | null>(null);

  const refresh = useCallback(async () => {
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
    }
  }, [token]);

  useEffect(() => {
    const next = createRefreshCoordinator(refresh, { coalesceMs: 250, minIntervalMs: 2_000 });
    coordinator.current = next;
    return () => {
      next.dispose();
      if (coordinator.current === next) coordinator.current = null;
    };
  }, [refresh]);

  const requestRefresh = useCallback(() => coordinator.current?.request(), []);

  // The Realtime hint, while the link works. Loaded only here, so the page
  // renders (and polls) without it.
  const hasShare = share !== null;
  useEffect(() => {
    if (!hasShare || !signalTopic) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void import("@/lib/share/shareSignal")
      .then(({ subscribeToShareSignal }) => {
        if (cancelled) return;
        unsubscribe = subscribeToShareSignal(signalTopic, {
          onSignal: requestRefresh,
          onConnected: () => {
            setRealtime(true);
            requestRefresh();
          },
          onDisconnected: () => setRealtime(false),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe?.();
      setRealtime(false);
    };
  }, [hasShare, signalTopic, requestRefresh]);

  // Clock for the countdown, the match clock and the data line.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // The fallback poll while the share is on (calm with Realtime connected,
  // and once the match is over, so a revoked link, a lower level or a
  // correction still arrives); paused while hidden, and read at once when
  // the page is shown again or back online.
  const intervalMs = publicRefreshIntervalMs(share, { realtime });
  useEffect(() => {
    if (intervalMs === null) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") requestRefresh();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") requestRefresh();
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
  }, [intervalMs, requestRefresh]);

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
      <PublicMatchHero share={share} locale={locale} nowMs={nowMs} fetchedAt={fetchedAt} fetchFailed={fetchFailed} />

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

      {share.lineup ? <PublicLineup lineup={share.lineup} /> : null}
    </PublicShell>
  );
}

function PublicShell({ children, footer, brand }: { children: React.ReactNode; footer: string; brand: string }) {
  return (
    <div className="min-h-dvh bg-fp-canvas text-fp-ink">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] sm:gap-5 sm:px-6 sm:pt-10">
        {/* BRAND-01: the same main logo as the app and the website (BRAND.md §5).
            -ml-[7px] cancels the master's left clear space, as in the header. */}
        <BrandLogo label={brand} className="-ml-[7px]" />
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
