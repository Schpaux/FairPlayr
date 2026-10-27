"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Compact offline pill rendered inside the sticky header's action cluster.
 *
 * It takes its own slot in the header row instead of floating over the page,
 * so it can never cover the scoreboard, match timer or back navigation, and it
 * appearing/disappearing does not shift page content. It owns its online state,
 * so connectivity changes re-render only this pill — the page tree (including
 * the live match view) is never swapped out or remounted.
 *
 * On narrow screens the pill is the amber glyph alone (DESIGN.md §9), and the
 * label and detail are kept for screen readers only: next to the 150px logo
 * there is no room for the word beside a long team name (BRAND-01).
 */
export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const t = useTranslations("native.offline");

  // The live region stays mounted (visually hidden while online, and
  // absolutely positioned so it takes no slot in the header row) — screen
  // readers only reliably announce changes inside an existing live region.
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        isOnline
          ? "sr-only"
          : "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-fp-warn-text/40 bg-fp-surface-2 px-2 py-1 sm:px-2.5"
      }
    >
      {isOnline ? null : (
        <>
          <WifiOff className="h-3.5 w-3.5 shrink-0 text-fp-warn-text" aria-hidden />
          <span className="sr-only text-xs font-semibold text-fp-warn-text sm:not-sr-only">{t("label")}</span>
          <span className="sr-only text-xs text-muted-foreground sm:not-sr-only">{t("detail")}</span>
        </>
      )}
    </div>
  );
}
