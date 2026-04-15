"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Full-screen offline fallback shown when the device has no internet connection.
 *
 * Shown in both native (Capacitor) and web contexts — replaces the browser's
 * raw "no connection" page with a design-consistent FairPlayr screen.
 *
 * The retry button reloads the page; the online event in useOnlineStatus will
 * also automatically dismiss this screen when connectivity is restored.
 */
export function OfflineScreen() {
  const t = useTranslations("native");

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-6 pt-safe pb-safe">
      <div className="flex flex-col items-center gap-6 text-center max-w-xs">
        {/* Icon */}
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-fp-surface">
          <WifiOff className="h-9 w-9 text-muted-foreground" />
        </div>

        {/* Text */}
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold text-foreground">
            {t("offline.title")}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("offline.description")}
          </p>
        </div>

        {/* Retry */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="tap-target inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity active:opacity-80"
        >
          {t("offline.retry")}
        </button>
      </div>
    </div>
  );
}
