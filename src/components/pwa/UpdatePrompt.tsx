"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/primitives/Button";
import { Notice } from "@/components/ui/primitives/Notice";

/**
 * «Oppdatering klar» (FP-OFF-01 §2.2). Shown by PwaRoot only when a new build
 * is waiting and no match is active. Fixed under the header, inside the 16px
 * gutter: it never appears on a running Live screen, so it cannot cover the
 * scoreboard, strip or bench. "Senere" hides it for this page; the update
 * then activates on the next cold start.
 */
export function UpdatePrompt({
  updating,
  onUpdate,
  onLater,
}: {
  updating: boolean;
  onUpdate: () => void;
  onLater: () => void;
}) {
  const t = useTranslations("pwa.update");

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 64px)" }}
      data-testid="update-prompt-band"
    >
      <Notice
        tone="info"
        icon={RefreshCw}
        title={t("title")}
        className="pointer-events-auto w-full max-w-md"
        testId="update-prompt"
        onDismiss={updating ? undefined : onLater}
        dismissLabel={t("later")}
        action={
          <Button variant="primary" size="sm" onClick={onUpdate} disabled={updating} aria-busy={updating}>
            {updating ? t("updating") : t("action")}
          </Button>
        }
      >
        {t("body")}
      </Notice>
    </div>
  );
}
