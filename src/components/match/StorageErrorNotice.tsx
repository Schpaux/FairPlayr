"use client";

import { useTranslations } from "next-intl";
import { Notice } from "@/components/ui/primitives/Notice";

/**
 * Shown while the live match cannot be written to the device (a full device,
 * blocked storage). The match keeps running in memory. It is an error: it
 * never goes away on its own (DESIGN.md §5.6). The coach may hide the band;
 * the scoreboard meta line («Ikke lagret») and the menu's first row keep
 * saying it until a later save works again.
 */
export function StorageErrorNotice({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations("restore.storageError");

  return (
    <Notice
      tone="error"
      title={t("title")}
      onDismiss={onDismiss}
      dismissLabel={t("hide")}
      testId="storage-error-notice"
    >
      {t("body")}
    </Notice>
  );
}

/**
 * The team list could not be loaded while a match is shown (a warning: the
 * match continues with the names saved on the device). Never auto-dismissed;
 * the menu keeps the line after the coach hides it.
 */
export function WorkspaceErrorNotice({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations("restore.workspaceError");

  return (
    <Notice
      tone="warning"
      title={t("title")}
      onDismiss={onDismiss}
      dismissLabel={t("hide")}
      testId="workspace-error-notice"
    >
      {t("body")}
    </Notice>
  );
}
