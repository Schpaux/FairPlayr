"use client";

/** Shared, network-free presentation of the public match. No session or polling. */
import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import { publicMatchClock, type PublicMatchClock } from "./publicMatchClock";
import { publicDataStatus, type PublicDataStatus, type PublicMatchShare } from "@/domain/matchShare";

const TIME_ZONE = "Europe/Oslo";

function intlLocale(locale: "no" | "en"): string {
  return locale === "no" ? "nb-NO" : "en-GB";
}

interface PublicMatchHeroProps {
  share: PublicMatchShare;
  locale: "no" | "en";
  nowMs: number;
  fetchedAt: string;
  fetchFailed?: boolean;
  /** Embedded product previews keep the public page's own h1 as the default. */
  headingLevel?: "h1" | "h3";
}

export function PublicMatchHero({ share, locale, nowMs, fetchedAt, fetchFailed = false, headingLevel: Heading = "h1" }: PublicMatchHeroProps) {
  const t = useTranslations("publicMatch");
  const timeFormat = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
  const formatTime = (iso: string | null) => {
    const at = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(at) ? "" : timeFormat.format(at);
  };

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
  const clock = publicMatchClock(liveData, nowMs);
  const dataStatus = publicDataStatus({ live: liveData, fetchFailed, nowMs });

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

  return (
      <section className="rounded-[20px] bg-fp-club p-5 text-fp-on-club sm:p-7" data-testid="public-match-hero">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold uppercase leading-tight tracking-[0.06em] text-fp-on-club-2">
            {kickoffLabel ? t("kickoff", { time: kickoffLabel }) : null}
          </p>
          <StatusBadge label={statusLabel} live={share.phase === "live" && share.shareLive} />
        </div>

        <Heading className="sr-only">
          {share.teamName} – {opponent}
        </Heading>
        <div
          aria-hidden
          className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 sm:gap-x-6"
          data-testid="public-match-scoreline"
        >
          <p className="text-center text-[17px] font-semibold leading-tight tracking-[-0.01em] [overflow-wrap:anywhere] sm:text-[22px]">
            {share.teamName}
          </p>
          {share.phase !== "upcoming" && share.score ? (
            <p className="whitespace-nowrap text-center font-num text-[64px] leading-none sm:text-[88px]" data-testid="public-match-score">
              {share.score.for}
              <span className="px-1.5 text-fp-on-club-2 sm:px-2.5">–</span>
              {share.score.against}
            </p>
          ) : (
            <p className="text-center text-[28px] leading-none text-fp-on-club-2">–</p>
          )}
          <p className="text-center text-[17px] font-semibold leading-tight tracking-[-0.01em] [overflow-wrap:anywhere] sm:text-[22px]">
            {opponent}
          </p>
        </div>
        {share.phase !== "upcoming" && share.score ? (
          <p className="sr-only" aria-live="polite">
            {t("scoreA11y", { team: share.teamName, scoreFor: share.score.for, opponent, scoreAgainst: share.score.against })}
          </p>
        ) : null}
        {resultWord ? <p className="mt-2 text-center text-base font-semibold">{resultWord}</p> : null}

        {share.phase === "upcoming" ? <Countdown kickoffMs={kickoffMs} nowMs={nowMs} /> : null}

        {liveData ? <ClockBlock clock={clock} halves={liveData.halves} /> : null}

        {share.phase === "live" && !share.shareLive ? (
          <div className="mt-4 text-center" data-testid="public-match-in-progress">
            <p className="text-[20px] font-semibold">{t("inProgress")}</p>
            <p className="mt-1 text-[15px] text-fp-on-club-2">{t("inProgressSummaryOnly")}</p>
          </div>
        ) : null}

        {share.phase === "live" && share.shareLive && !share.score ? (
          <p className="mt-2 text-center text-[15px] text-fp-on-club-2">{t("inProgressStatusOnly")}</p>
        ) : null}

        {share.phase === "completed" && !share.score ? (
          <p className="mt-4 text-center text-[20px] font-semibold">{t("completed")}</p>
        ) : null}

        <DataLine
          status={dataStatus}
          // The time of the match data itself; without live data, of the last answer.
          time={formatTime(liveData?.updatedAt ?? (dataStatus === "noContact" ? fetchedAt : null))}
        />
      </section>
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
      <div className="mt-5 text-center" data-testid="public-match-waiting">
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
    <div className="mt-5 text-center" data-testid="public-match-countdown">
      <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-on-club-2">{t("countdownLabel")}</p>
      <p className="mt-1 font-num text-[40px] leading-[0.95] sm:text-[52px]">{text}</p>
    </div>
  );
}

/** The match clock under the score: what part of the match, and the time. */
function ClockBlock({ clock, halves }: { clock: PublicMatchClock | null; halves: 1 | 2 | null }) {
  const t = useTranslations("publicMatch");

  if (!clock) {
    return <p className="mt-4 text-center text-base font-semibold" data-testid="public-match-phase">{t("inProgress")}</p>;
  }

  const label =
    clock.state === "fullTime"
      ? t("phase.full_time")
      : clock.state === "halfTime"
        ? t("phase.half_time")
        : clock.state === "stopped"
          ? t("clockStopped")
          : clock.half !== null && halves === 2
            ? t(clock.half === 1 ? "phase.first_half" : "phase.second_half")
            : t("inPlay");

  return (
    <div className="mt-4 flex flex-col items-center" data-testid="public-match-phase">
      <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-on-club-2">
        {label}
        {clock.stoppage ? ` · ${t("stoppage")}` : null}
        {clock.state === "stopped" && clock.half !== null
          ? ` · ${t(clock.half === 1 ? "phase.first_half" : "phase.second_half")}`
          : null}
      </p>
      <p
        className={`mt-1 font-num text-[32px] leading-none tabular-nums sm:text-[40px] ${clock.state === "running" ? "" : "text-fp-on-club-2"}`}
        data-testid="public-match-clock"
      >
        {clock.text}
      </p>
    </div>
  );
}

/** One quiet line in the card: when the match data last changed, or a short warning. */
function DataLine({ status, time }: { status: PublicDataStatus; time: string }) {
  const t = useTranslations("publicMatch");
  if (!time) return null;

  if (status === "current") {
    return (
      <p className="mt-3 text-center text-[13px] text-fp-on-club-2" data-testid="public-match-updated">
        {t("updatedAt", { time })}
      </p>
    );
  }

  return (
    <p
      className="mx-auto mt-3 flex w-fit items-center gap-1.5 rounded-full bg-fp-surface px-3 py-1 text-[13px] font-semibold text-fp-warn-text"
      role="status"
      data-testid={status === "noContact" ? "public-match-no-contact" : "public-match-stale"}
    >
      <CircleAlert aria-hidden size={14} className="shrink-0" />
      {status === "noContact" ? t("noContact", { time }) : t("dataStale", { time })}
    </p>
  );
}
