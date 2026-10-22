"use client";

import { Cloud, CloudOff, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { ListRow } from "@/components/ui/primitives";
import { StatusValue } from "@/components/layout/StatusValue";

export type SyncStatus = "cloud" | "local" | "attention";

export function resolveSyncStatus(mode: "guest-local" | "cloud", hasError: boolean): SyncStatus {
  if (hasError) return "attention";
  return mode === "cloud" ? "cloud" : "local";
}

/**
 * The one sync-status row (C5, UI-SETTINGS-01), used by the profile sheet and
 * Settings. A `ListRow`, so it sits inside a `ListGroup`. The status is a
 * glyph plus a word, never colour alone; working locally and errors use
 * `warn-text`, synced is quiet `ink-2` (normal states are silent).
 */
export function SyncStatusRow({
  mode,
  hasError,
  testId = "sync-status-row",
}: {
  mode: "guest-local" | "cloud";
  hasError: boolean;
  testId?: string;
}) {
  const t = useTranslations("profileMenu.sync");
  const status = resolveSyncStatus(mode, hasError);

  return (
    <ListRow
      testId={testId}
      label={t("title")}
      trailing={
        <StatusValue
          tone={status === "cloud" ? "quiet" : "warn"}
          icon={status === "cloud" ? Cloud : status === "attention" ? TriangleAlert : CloudOff}
          testId={`${testId}-value`}
          status={status}
        >
          {t(status)}
        </StatusValue>
      }
    />
  );
}
