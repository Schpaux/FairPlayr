import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Bell, Users, History } from "lucide-react";
import { getFormationSlots } from "@/domain/match";
import {
  HomeHistoryHint,
  HomeNextMatch,
  HomeSeasonSummary,
  HomeSummaryProvider,
  HomeTeamName,
} from "@/components/home/HomeSeasonSummary";

// Home is a user-agnostic shell (FP-OFF-01 B6, §S.5): the server renders only
// translations and static blocks, so the HTML is the same for every user and a
// service worker may cache it. The team name, the next fixture and the season
// stats are client islands (`HomeSeasonSummary.tsx`). Do not read cookies,
// headers, Supabase or `@/lib/server/*` here; `shellRouteSafety.test.ts`
// enforces that.

// ─── Decorative formation dots ────────────────────────────────────────────────
// Used in hero card background — purely visual, 5v5 2-2 as default.
const HERO_SLOTS = getFormationSlots("5v5", "5v5-2-2");

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <HomeSummaryProvider>
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

          {/* Top row */}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between px-5 pt-5">
            <div>
              <HomeTeamName />
              <p className="font-mono text-[11px] text-fp-on-club">{t("hero.seasonLabel")}</p>
            </div>
            <button
              type="button"
              aria-label={t("hero.notificationsLabel")}
              className="tap-target flex h-9 w-9 items-center justify-center rounded-full bg-fp-on-club/15 text-fp-on-club"
            >
              <Bell size={16} />
            </button>
          </div>

          {/* Center-left headline */}
          <div className="absolute bottom-14 left-5 right-16">
            <h1
              className="heading-display text-[52px] text-fp-on-club"
              style={{ whiteSpace: "pre-line" }}
            >
              {t("hero.headline")}
            </h1>
          </div>

          {/* Decorative formation dots */}
          {HERO_SLOTS.map((slot) => (
            <div
              key={slot.id}
              aria-hidden
              className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fp-on-club/20"
              style={{ left: `${slot.x}%`, bottom: `${(slot.y / 100) * 56}px` }}
            />
          ))}
        </div>

        {/* ── Block 2: Dark "Next Match" CTA ───────────────────────────────── */}
        <Link
          href="/match/setup"
          className="flex w-full items-center gap-3.5 rounded-[24px] bg-foreground p-4 text-background transition active:scale-[0.98]"
        >
          <HomeNextMatch />
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fp-lime text-fp-on-lime">
            <ArrowRight size={20} />
          </div>
        </Link>

        {/* ── Blocks 3–4: online and signed in, when season data exists ────── */}
        <HomeSeasonSummary />

        {/* ── Block 5: Quick action tiles ──────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/team"
            className="flex flex-col gap-3 rounded-[20px] bg-fp-surface p-4 shadow-[inset_0_0_0_1px_var(--fp-border)] transition active:scale-[0.97]"
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
            className="flex flex-col gap-3 rounded-[20px] bg-fp-surface p-4 shadow-[inset_0_0_0_1px_var(--fp-border)] transition active:scale-[0.97]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-fp-surface-2">
              <History size={20} className="text-foreground" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-foreground">{t("actions.history")}</p>
              <HomeHistoryHint />
            </div>
          </Link>
        </div>
      </div>
    </HomeSummaryProvider>
  );
}
