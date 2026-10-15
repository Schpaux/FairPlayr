"use client";

/**
 * Notices shown over the pitch after the match ends: a failed end, a pending
 * or unsaved completion, a completed sync and a local-only end. Same copy and
 * same handlers as the existing live screen; only the presentation differs.
 */

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import styles from "@/components/live/LiveScreen.module.css";

export interface LiveNoticesProps {
  error: string | null;
  pendingCompletion: { persisted: boolean } | null;
  isOnline: boolean;
  isSyncingCompletion: boolean;
  onRetryCompletion: () => void;
  syncedMatchId: string | null;
  onOpenReport: () => void;
  endedLocally: { unsaved: boolean } | null;
}

export function LiveNotices({
  error,
  pendingCompletion,
  isOnline,
  isSyncingCompletion,
  onRetryCompletion,
  syncedMatchId,
  onOpenReport,
  endedLocally,
}: LiveNoticesProps) {
  const t = useTranslations("matchLive");

  if (!error && !pendingCompletion && !syncedMatchId && !endedLocally) {
    return null;
  }

  return (
    <div className={styles.notices} onClick={(event) => event.stopPropagation()}>
      {error ? (
        <div className={styles.notice} role="alert">
          <p className={cn(styles.noticeTitle, styles.noticeTitleDanger)}>{error}</p>
        </div>
      ) : null}

      {pendingCompletion ? (
        <div className={styles.notice}>
          {pendingCompletion.persisted ? (
            <div role="status">
              <p className={styles.noticeTitle}>{t("pendingSync.title")}</p>
              <p className={styles.noticeBody}>
                {isOnline ? t("pendingSync.descriptionOnline") : t("pendingSync.descriptionOffline")}
              </p>
            </div>
          ) : (
            <div role="alert">
              <p className={cn(styles.noticeTitle, styles.noticeTitleDanger)}>{t("pendingSync.notSavedTitle")}</p>
              <p className={styles.noticeBody}>
                {isOnline
                  ? t("pendingSync.notSavedDescriptionOnline")
                  : t("pendingSync.notSavedDescriptionOffline")}
              </p>
            </div>
          )}
          <button
            type="button"
            className={cn(styles.btn, styles.btnSm, styles.btnSecondary)}
            disabled={!isOnline || isSyncingCompletion}
            onClick={onRetryCompletion}
          >
            {isSyncingCompletion ? t("pendingSync.syncing") : t("pendingSync.retry")}
          </button>
        </div>
      ) : null}

      {syncedMatchId ? (
        <div className={styles.notice}>
          <div role="status">
            <p className={styles.noticeTitle}>{t("pendingSync.syncedTitle")}</p>
            <p className={styles.noticeBody}>{t("pendingSync.syncedDescription")}</p>
          </div>
          <button type="button" className={cn(styles.btn, styles.btnSm, styles.btnPrimary)} onClick={onOpenReport}>
            {t("endingSequence.goToReport")}
          </button>
        </div>
      ) : null}

      {endedLocally ? (
        <div className={styles.notice}>
          {endedLocally.unsaved ? (
            <div role="alert">
              <p className={cn(styles.noticeTitle, styles.noticeTitleDanger)}>{t("endedLocally.title")}</p>
              <p className={styles.noticeBody}>{t("endedLocally.notSaved")}</p>
            </div>
          ) : (
            <div role="status">
              <p className={styles.noticeTitle}>{t("endedLocally.title")}</p>
              <p className={styles.noticeBody}>{t("endedLocally.saved")}</p>
            </div>
          )}
          {isOnline ? (
            <Link href="/historikk" className={cn(styles.btn, styles.btnSm, styles.btnSecondary)}>
              {t("endedLocally.historyCta")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
