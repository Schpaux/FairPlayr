"use client";

import { PlayCircle } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";

export function ActiveMatchBanner() {
  const t = useTranslations("activeMatchBanner");
  const { activeMatch, activeMatchHref } = useActiveMatch();
  const pathname = usePathname();

  const isOnLiveMatchPage = pathname.includes("/match/live");

  if (!activeMatch || activeMatch.status !== "live" || isOnLiveMatchPage) {
    return null;
  }

  return (
    <Link
      href={activeMatchHref}
      className="sticky top-14 z-40 mx-auto mt-2 flex min-h-12 w-[calc(100%-2rem)] max-w-screen-lg items-center justify-between gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 transition-opacity active:opacity-75"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-[11px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
          {t("label")}
        </p>
        <p className="truncate text-sm font-semibold text-foreground">{activeMatch.title}</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
        <PlayCircle size={14} />
        {t("open")}
      </span>
    </Link>
  );
}
