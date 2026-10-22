"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";

export function ActiveMatchBanner() {
  const t = useTranslations("activeMatchBanner");
  const { activeMatch, activeMatchHref, recoveryMatch, recoveryMatchHref } = useActiveMatch();
  const pathname = usePathname();

  if (pathname.includes("/match/live")) {
    return null;
  }

  // "Kamp pågår" only for the match running on this device, linking to it.
  // Club green and static (DESIGN.md §7, C2). Home leaves it out: its fixture
  // panel shows the same match with the screen's one lime action.
  if (activeMatch?.status === "live") {
    if (pathname === "/") {
      return null;
    }

    return (
      <Link
        href={activeMatchHref}
        className="sticky top-[calc(3.5rem+1px+env(safe-area-inset-top))] z-40 mx-auto mt-2 flex min-h-12 w-[calc(100%-2rem)] max-w-screen-lg items-center justify-between gap-2 rounded-2xl bg-fp-club px-4 py-2.5 text-fp-on-club transition-opacity focus-visible:ring-fp-on-club active:opacity-75"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-on-club-2">
            {/* A steady dot: no ambient motion (DESIGN.md §4, UI-A11Y-03). */}
            <span className="inline-flex h-2 w-2 rounded-full bg-fp-on-club" aria-hidden />
            {t("label")}
          </p>
          <p className="truncate text-sm font-semibold text-fp-on-club">{activeMatch.title || t("deviceMatch")}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-fp-on-club">
          {t("open")}
          <ChevronRight size={16} aria-hidden />
        </span>
      </Link>
    );
  }

  // A server match left open that this device is not running: never shown as
  // a running match, and it opens that match's own page, never another one.
  if (!activeMatch && recoveryMatch && recoveryMatchHref && pathname !== recoveryMatchHref) {
    return (
      <Link
        href={recoveryMatchHref}
        className="sticky top-[calc(3.5rem+1px+env(safe-area-inset-top))] z-40 mx-auto mt-2 flex min-h-12 w-[calc(100%-2rem)] max-w-screen-lg items-center justify-between gap-2 rounded-2xl border border-fp-border bg-fp-surface px-4 py-2.5 transition-opacity active:opacity-75"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[11px] font-bold uppercase tracking-widest text-fp-warn-text">
            <AlertTriangle size={12} aria-hidden />
            {t("recoveryLabel")}
          </p>
          <p className="truncate text-sm font-semibold text-foreground">{recoveryMatch.title}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-fp-warn-text">
          {t("recoveryOpen")}
          <ChevronRight size={14} aria-hidden />
        </span>
      </Link>
    );
  }

  return null;
}
