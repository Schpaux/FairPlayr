"use client";

import { PlayCircle } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";

export function ActiveMatchBanner() {
  const t = useTranslations("activeMatchBanner");
  const { activeMatch } = useActiveMatch();
  const pathname = usePathname();

  const isOnLiveMatchPage = pathname.includes("/match/live");

  if (!activeMatch || activeMatch.status !== "live" || isOnLiveMatchPage) {
    return null;
  }

  return (
    <Link
      href={`/match/live?matchId=${encodeURIComponent(activeMatch.id)}`}
      className="sticky top-14 z-40 mx-auto mt-2 flex min-h-12 w-[calc(100%-1rem)] max-w-screen-lg items-center justify-between gap-2 rounded-xl border border-red-500/55 bg-red-500/15 px-3 py-2 shadow-[0_0_0_1px_rgba(239,68,68,0.15),0_8px_24px_rgba(239,68,68,0.15)]"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1 truncate text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-300">
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
          {t("label")}
        </p>
        <p className="truncate text-sm font-medium text-foreground">{activeMatch.title}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-300">
        <PlayCircle size={14} />
        {t("open")}
      </span>
    </Link>
  );
}
