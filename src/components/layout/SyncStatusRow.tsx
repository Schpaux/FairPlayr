"use client";

import { useTranslations } from "next-intl";

export function SyncStatusRow({
  mode,
  hasError,
}: {
  mode: "guest-local" | "cloud";
  hasError: boolean;
}) {
  const t = useTranslations("profileMenu.sync");

  const status = hasError ? "attention" : mode === "cloud" ? "cloud" : "local";

  return (
    <div className="flex items-center justify-between rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-2">
      <span className="text-xs font-medium text-foreground">{t("title")}</span>
      <span
        className={
          status === "cloud"
            ? "inline-flex items-center gap-1 text-xs font-medium text-fp-ok-text"
            : status === "attention"
              ? "inline-flex items-center gap-1 text-xs font-medium text-fp-warn-text"
              : "inline-flex items-center gap-1 text-xs font-medium text-fp-warn-text"
        }
      >
        <span
          className={
            status === "cloud"
              ? "h-1.5 w-1.5 rounded-full bg-fp-ok-text"
              : status === "attention"
                ? "h-1.5 w-1.5 rounded-full bg-fp-warn-text"
                : "h-1.5 w-1.5 rounded-full bg-fp-warn-text"
          }
        />
        {status === "cloud" ? t("cloud") : status === "attention" ? t("attention") : t("local")}
      </span>
    </div>
  );
}
