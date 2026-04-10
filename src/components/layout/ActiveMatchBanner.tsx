"use client";

import { PlayCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";

export function ActiveMatchBanner() {
  const t = useTranslations("activeMatchBanner");
  const { activeMatch } = useActiveMatch();

  if (!activeMatch || activeMatch.status !== "live") {
    return null;
  }

  return (
    <Link
      href={`/match/live?matchId=${encodeURIComponent(activeMatch.id)}`}
      className="sticky top-14 z-40 mx-auto mt-2 flex min-h-12 w-[calc(100%-1rem)] max-w-screen-lg items-center justify-between gap-2 rounded-xl border border-danger/45 bg-danger/15 px-3 py-2 shadow-sm"
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-danger">{t("label")}</p>
        <p className="truncate text-sm font-medium text-foreground">{activeMatch.title}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger">
        <PlayCircle size={14} />
        {t("open")}
      </span>
    </Link>
  );
}
