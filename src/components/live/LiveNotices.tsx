"use client";

/**
 * Notices shown over the pitch after the match ends: a failed end, a pending
 * or unsaved completion, a completed sync and a local-only end. Same copy and
 * same handlers as the existing live screen; only the presentation differs.
 *
 * During the match, the notice band (DESIGN.md §5.6): restore and storage
 * messages, one at a time by severity, and only where the band fits.
 */

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  liveBandFits,
  pickLiveBandItem,
  type BandRect,
  type LiveBandItem,
} from "@/components/live/liveBand";
import styles from "@/components/live/LiveScreen.module.css";

function toRect(element: Element): BandRect {
  const { left, right, top, bottom } = element.getBoundingClientRect();
  return { left, right, top, bottom };
}

/**
 * The live notice band. Rendered inside the pitch (as `Pitch` children), at
 * its top edge directly under the scoreboard. The notice is laid out at all
 * times but shown only while it covers no player token (every token, not
 * just the top-most), nor the scoreboard, strip or bench; this is re-checked
 * after every render and whenever the pitch or the live screen resizes (for
 * example the bench growing from one row to two). Hidden, it takes no
 * pointer events and its message is announced from a visually hidden live
 * region instead; the scoreboard meta line and the menu carry it then.
 * Starts hidden, so it never flashes over a token before the first check.
 */
export function LiveBand({ item }: { item: LiveBandItem }) {
  const bandRef = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(false);

  const check = useEffectEvent(() => {
    const band = bandRef.current;
    const pitch = band?.parentElement ?? null;
    const notice = band?.firstElementChild ?? null;
    if (!band || !pitch || !notice) return;
    const root = pitch.parentElement;
    const board = root?.querySelector("header") ?? null;
    const obstacles = [
      ...pitch.querySelectorAll("[data-player-id]"),
      ...(board ? [board] : []),
      ...(root ? root.querySelectorAll('[data-testid="live-strip"], [data-bench-player-id]') : []),
    ].map(toRect);
    const next = liveBandFits({ band: toRect(notice), pitch: toRect(pitch), obstacles });
    setFits((previous) => (previous === next ? previous : next));
  });

  // Before paint, after every render: tokens move (substitution, swap) and
  // the band's own height changes with its text.
  useLayoutEffect(() => {
    check();
  });

  useEffect(() => {
    const pitch = bandRef.current?.parentElement ?? null;
    const root = pitch?.parentElement ?? null;
    const run = () => check();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(run);
    if (observer) {
      if (pitch) observer.observe(pitch);
      if (root) observer.observe(root);
    }
    window.addEventListener("resize", run);
    // Tokens may still be placed after this commit (pitch measurement).
    const frame = window.requestAnimationFrame(run);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", run);
      window.cancelAnimationFrame(frame);
    };
  }, [item.key]);

  return (
    <>
      <div
        ref={bandRef}
        className={styles.band}
        data-testid="live-notice-band"
        data-band-key={item.key}
        data-fits={fits ? "true" : "false"}
        aria-hidden={fits ? undefined : true}
        onClick={(event) => event.stopPropagation()}
      >
        {item.render()}
      </div>
      {fits ? null : (
        <span className="sr-only" role={item.tone === "error" ? "alert" : "status"}>
          {item.announcement}
        </span>
      )}
    </>
  );
}

export interface LiveNoticesProps {
  error: string | null;
  pendingCompletion: { persisted: boolean } | null;
  isOnline: boolean;
  isSyncingCompletion: boolean;
  onRetryCompletion: () => void;
  syncedMatchId: string | null;
  onOpenReport: () => void;
  endedLocally: { unsaved: boolean } | null;
  /**
   * Band candidates during the match (restore info, storage error, team
   * load warning). Only the most severe one is shown, and only while it fits.
   */
  band?: readonly LiveBandItem[];
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
  band = [],
}: LiveNoticesProps) {
  const t = useTranslations("matchLive");

  if (!error && !pendingCompletion && !syncedMatchId && !endedLocally) {
    const item = pickLiveBandItem(band);
    return item ? <LiveBand key={item.key} item={item} /> : null;
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
