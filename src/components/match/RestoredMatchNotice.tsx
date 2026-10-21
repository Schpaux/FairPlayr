"use client";

import { History } from "lucide-react";
import { useTranslations } from "next-intl";
import { Notice } from "@/components/ui/primitives/Notice";

/**
 * B9: after a cold start, when the app was closed for more than a minute
 * while the clock ran. Passive info: it goes away after 8 s (paused while
 * hovered or focused), and the same text stays in the live menu for the rest
 * of the session. The clock is never adjusted: it is wall-clock based and
 * already includes the time the app was closed; the referee decides.
 *
 * Placement is the caller's: on Live it goes through the notice band, which
 * shows it only where it covers no player token (DESIGN.md §5.6).
 */
export function RestoredMatchNotice({ minutes, onDismiss }: { minutes: number; onDismiss: () => void }) {
  const t = useTranslations("restore");

  return (
    <Notice tone="info" icon={History} onDismiss={onDismiss} autoDismissMs={8000} testId="restored-match-notice">
      {t("closedGap", { minutes })}
    </Notice>
  );
}
