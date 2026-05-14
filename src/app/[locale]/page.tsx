import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Bell, Users, History, Sparkles } from "lucide-react";
import {
  getSeasonStats,
  getUpcomingMatch,
  getFirstCloudTeamId,
  getFirstCloudTeamName,
} from "@/lib/server/seasonStats";
import { getFormationSlots } from "@/domain/match";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCountdownParts(startsAt: string): { days: number; hours: number } | null {
  const diffMs = new Date(startsAt).getTime() - Date.now();
  if (diffMs <= 0) return null;
  return {
    days: Math.floor(diffMs / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
  };
}

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

// ─── Decorative formation dots ────────────────────────────────────────────────
// Used in hero card background — purely visual, 5v5 2-2 as default.
const HERO_SLOTS = getFormationSlots("5v5", "5v5-2-2");

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const t = await getTranslations("home");

  // Attempt to load server-side data — gracefully degrade if unavailable.
  let teamId: string | null = null;
  let teamName: string | null = null;

  try {
    teamId = await getFirstCloudTeamId();
    if (teamId) {
      teamName = await getFirstCloudTeamName(teamId);
    }
  } catch {
    // No auth or DB error — show fallback
  }

  const [stats, upcoming] = await Promise.all([
    teamId
      ? getSeasonStats(teamId).catch(() => null)
      : Promise.resolve(null),
    teamId
      ? getUpcomingMatch(teamId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const hasStats = stats !== null && stats.matchesPlayed > 0;

  return (
    <div className="flex flex-col gap-3 px-4 pt-3 pb-8">
      {/* ── Block 1: Pitch-motif hero card ───────────────────────────────── */}
      <div
        className="relative w-full overflow-hidden rounded-[26px]"
        style={{
          height: "320px",
          background: "linear-gradient(180deg, var(--fp-pitch-a) 0%, var(--fp-pitch-b) 100%)",
          boxShadow: "inset 0 0 0 1px var(--fp-border)",
        }}
      >
        {/* Grass stripes */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--fp-pitch-stripe-a) 0, var(--fp-pitch-stripe-a) 12.5%, var(--fp-pitch-stripe-b) 12.5%, var(--fp-pitch-stripe-b) 25%)",
          }}
        />

        {/* Top half of pitch markings */}
        <svg
          aria-hidden
          viewBox="0 0 100 55"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-60"
        >
          <g stroke="var(--fp-pitch-line)" strokeWidth="0.5" fill="none">
            <rect x="1.5" y="1.5" width="97" height="52" rx="1" />
            <line x1="1.5" y1="52" x2="98.5" y2="52" strokeWidth="0.6" />
            <path d="M 40 52 A 10 10 0 0 1 60 52" />
            <rect x="22" y="1.5" width="56" height="20" />
            <rect x="34" y="1.5" width="32" height="8" />
            <path d="M 42 21.5 A 8 8 0 0 0 58 21.5" />
          </g>
        </svg>

        {/* Dark gradient overlay for text legibility */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.35) 100%)",
          }}
        />

        {/* Top row */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between px-5 pt-5">
          <div>
            {teamName && (
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-white/75">
                {teamName}
              </p>
            )}
            <p className="font-mono text-[11px] text-white/50">{t("hero.seasonLabel")}</p>
          </div>
          <button
            type="button"
            aria-label="Notifications"
            className="tap-target flex h-9 w-9 items-center justify-center rounded-full text-white backdrop-blur-md"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <Bell size={16} />
          </button>
        </div>

        {/* Center-left headline */}
        <div className="absolute bottom-14 left-5 right-16">
          <h1
            className="heading-display text-[52px] text-white"
            style={{ textShadow: "0 2px 10px rgba(0,0,0,0.2)", whiteSpace: "pre-line" }}
          >
            {t("hero.headline")}
          </h1>
        </div>

        {/* Decorative formation dots */}
        {HERO_SLOTS.map((slot) => (
          <div
            key={slot.id}
            aria-hidden
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20"
            style={{ left: `${slot.x}%`, bottom: `${(slot.y / 100) * 56}px` }}
          />
        ))}
      </div>

      {/* ── Block 2: Dark "Next Match" CTA ───────────────────────────────── */}
      <Link
        href="/match/setup"
        className="flex w-full items-center gap-3.5 rounded-[24px] bg-foreground p-4 text-background shadow-[0_12px_28px_-12px_rgba(0,0,0,0.3)] transition-all hover:scale-[1.01] active:scale-[0.98]"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="rounded-full bg-fp-cta px-2 py-0.5 text-[10px] font-bold text-fp-cta-foreground">
              {t("nextMatch.badge")}
            </span>
            {upcoming && (() => {
              const cd = getCountdownParts(upcoming.startsAt);
              return cd ? (
                <span className="font-mono text-[10px] opacity-55">
                  {t("nextMatch.countdown", { days: cd.days, hours: cd.hours })}
                </span>
              ) : null;
            })()}
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
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fp-cta text-fp-cta-foreground">
          <ArrowRight size={20} />
        </div>
      </Link>

      {/* ── Blocks 3–4: Only shown when season data is available ──────────── */}
      {hasStats && stats && (
        <>
          {/* ── Block 3: Season balance + last match ─────────────────────── */}
          <div className="grid grid-cols-[1.4fr_1fr] gap-2">
            {/* Left: Balance card */}
            <div className="flex flex-col justify-between rounded-[20px] bg-fp-surface p-4 shadow-[inset_0_0_0_1px_var(--fp-border)]">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-fp-cta shrink-0" />
                <p className="text-[11px] font-semibold text-fp-text-secondary">
                  {t("balance.title")}
                </p>
              </div>
              <div>
                <p className="font-mono text-[44px] font-bold leading-none text-foreground tabular-nums">
                  {stats.balance}
                  <span className="text-[22px] text-fp-text-secondary">%</span>
                </p>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-fp-surface-3">
                  <div
                    className="h-full rounded-full bg-fp-cta transition-all"
                    style={{ width: `${stats.balance}%` }}
                  />
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
                <div className="flex flex-col justify-between rounded-[20px] bg-fp-cta/10 p-3 shadow-[inset_0_0_0_1px_var(--fp-border)]">
                  <p className="font-mono text-[10px] text-fp-text-secondary">
                    {t("lastMatch.title", {
                      when: formatLastMatchDay(stats.lastMatch.when),
                    })}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[11px] font-bold text-fp-cta">
                      {t(`lastMatch.${stats.lastMatch.result}`)}
                    </span>
                    <span className="font-mono text-base font-bold text-foreground tabular-nums">
                      {stats.lastMatch.scoreFor}–{stats.lastMatch.scoreAgainst}
                    </span>
                  </div>
                </div>
              )}

              {/* Played */}
              <div className="flex flex-1 flex-col justify-between rounded-[20px] bg-fp-surface p-3 shadow-[inset_0_0_0_1px_var(--fp-border)]">
                <p className="font-mono text-[10px] text-fp-text-secondary">{t("played")}</p>
                <p className="font-mono text-xl font-bold tabular-nums text-foreground">
                  {stats.matchesPlayed}
                </p>
              </div>
            </div>
          </div>

          {/* ── Block 4: Needs minutes ──────────────────────────────────── */}
          {stats.needsMinutes.length > 0 && (
            <div className="rounded-[20px] bg-fp-surface p-4 shadow-[inset_0_0_0_1px_var(--fp-border)]">
              <div className="mb-3 flex items-center gap-2">
                <p className="text-[13px] font-semibold text-foreground">
                  {t("needsMinutes.title")}
                </p>
                <span className="rounded-full bg-fp-surface-2 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-fp-text-secondary">
                  {t("needsMinutes.subtitle")}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {stats.needsMinutes.map((player) => (
                  <div key={player.playerId} className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fp-cta text-[11px] font-black text-fp-cta-foreground">
                      {getInitials(player.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-foreground">
                        {player.name}
                      </p>
                      <p className="text-[11px] text-fp-text-secondary">
                        {player.position ?? "–"} · {player.totalMinutes}min
                      </p>
                    </div>
                    <span className="rounded-full bg-fp-cta/15 px-2 py-0.5 text-[11px] font-bold text-fp-cta">
                      {t("needsMinutes.deficit", {
                        hours: (player.deficitMinutes / 60).toFixed(1),
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Block 5: Quick action tiles ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/team"
          className="flex flex-col gap-3 rounded-[20px] bg-fp-surface p-4 shadow-[inset_0_0_0_1px_var(--fp-border)] transition-all hover:scale-[1.02] active:scale-[0.97]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-fp-surface-2">
            <Users size={20} className="text-foreground" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-foreground">{t("actions.editSquad")}</p>
            <p className="text-[11px] text-fp-text-secondary">{t("actions.editSquadHint")}</p>
          </div>
        </Link>

        <Link
          href="/historikk"
          className="flex flex-col gap-3 rounded-[20px] bg-fp-surface p-4 shadow-[inset_0_0_0_1px_var(--fp-border)] transition-all hover:scale-[1.02] active:scale-[0.97]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-fp-surface-2">
            <History size={20} className="text-foreground" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-foreground">{t("actions.history")}</p>
            <p className="text-[11px] text-fp-text-secondary">
              {hasStats && stats
                ? t("actions.historyHint", { count: stats.matchesPlayed })
                : t("actions.historyHintEmpty")}
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
