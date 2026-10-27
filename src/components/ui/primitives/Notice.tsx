"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import styles from "./primitives.module.css";

/**
 * Notice (UI-FOUND-01). The one component for messages that the coach should
 * know about: an offline or "needs a connection" note, a storage problem, a
 * restored match ("the app was closed for 7 min", OFF-01a B9), an update.
 *
 * Contract (stable; OFF-01a builds UpdatePrompt, RestoredMatchNotice and
 * StorageErrorNotice on it, see roadmap UI-FOUND-01):
 * - `tone`: info | success | warning | error. Each has a glyph plus words,
 *   never colour alone (DESIGN.md §2.5); for success, warning and error a
 *   hidden tone word ("Advarsel:") prefixes the text for screen readers.
 * - Look (DESIGN.md §5.6): `surface` fill, 1px `rule`, 10px radius, Inter 500
 *   14 in `ink`; the glyph carries the tone colour (`warn-text` for warnings).
 *   No lime, shadow or blur. An `action` may be a lime `Button` only when it
 *   *is* the next action (for example "Oppdater").
 * - `announce`: polite (`role="status"`, default), assertive (`role="alert"`,
 *   default for errors) or off (a static note that should not interrupt).
 *   A live region announces changes, so mount the notice when the condition
 *   starts rather than rendering it with the page.
 * - `onDismiss` adds a 44px dismiss button. `autoDismissMs` (for example
 *   8000 for the live band) calls `onDismiss` after that time, paused while
 *   the notice is hovered or holds focus (WCAG 2.2.1). It is only for passive
 *   info that is also available elsewhere: it is ignored for warnings, errors
 *   and notices with an `action`, which stay until dismissed or resolved.
 *   So a storage failure or any other persistent error is `tone="error"`
 *   (never info), and anything the coach must act on carries an `action`.
 *   Changing `autoDismissMs` restarts the timer. When a notice that holds
 *   focus goes away, the caller moves focus to a sensible place.
 * - Placement is the caller's job. On Live the band sits under the scoreboard
 *   and must never cover the scoreboard, strip or bench (DESIGN.md §5.6).
 * - It enters with a 140ms fade; with reduced motion it simply appears.
 */

export type NoticeTone = "info" | "success" | "warning" | "error";

const GLYPHS: Record<NoticeTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
};

export interface NoticeProps {
  tone?: NoticeTone;
  /** Optional bold first line; the children are then the explanation. */
  title?: ReactNode;
  children?: ReactNode;
  /** A replacement glyph, for example WifiOff for "needs a connection". */
  icon?: LucideIcon;
  /** One action under the text, usually a small `Button`. */
  action?: ReactNode;
  announce?: "polite" | "assertive" | "off";
  onDismiss?: () => void;
  /** Overrides the dismiss button's label ("Lukk meldingen"). */
  dismissLabel?: string;
  /** Calls `onDismiss` after this many ms (needs `onDismiss`; info and success only). */
  autoDismissMs?: number;
  /** For `aria-describedby` or `aria-controls` references from elsewhere. */
  id?: string;
  className?: string;
  testId?: string;
}

export function Notice({
  tone = "info",
  title,
  children,
  icon,
  action,
  announce = tone === "error" ? "assertive" : "polite",
  onDismiss,
  dismissLabel,
  autoDismissMs,
  id,
  className,
  testId,
}: NoticeProps) {
  const t = useTranslations("ui.notice");
  const Glyph = icon ?? GLYPHS[tone];
  const role = announce === "assertive" ? "alert" : announce === "polite" ? "status" : undefined;

  // Keep the latest callback without restarting the timer on every render.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  // Hover or focus inside pauses the timer; leaving restarts the full time.
  const [paused, setPaused] = useState(false);
  const timed = !!autoDismissMs && autoDismissMs > 0 && !action && (tone === "info" || tone === "success");

  useEffect(() => {
    if (!timed || paused) return;
    const timer = window.setTimeout(() => dismissRef.current?.(), autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [timed, paused, autoDismissMs]);

  return (
    <div
      id={id}
      className={cn(styles.notice, className)}
      data-tone={tone}
      role={role}
      data-testid={testId}
      onPointerEnter={timed ? () => setPaused(true) : undefined}
      onPointerLeave={timed ? () => setPaused(false) : undefined}
      onFocus={timed ? () => setPaused(true) : undefined}
      onBlur={
        timed
          ? (event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
            }
          : undefined
      }
    >
      <span className={styles.noticeGlyph} aria-hidden>
        <Glyph size={20} strokeWidth={1.75} />
      </span>
      <div className={styles.noticeText}>
        {tone !== "info" ? <span className={styles.srOnly}>{t(`tone.${tone}`)}: </span> : null}
        {title ? <strong className={styles.noticeTitle}>{title}</strong> : null}
        {title && children ? " " : null}
        {children ? <span className={styles.noticeBody}>{children}</span> : null}
        {action ? <div className={styles.noticeAction}>{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          className={styles.noticeDismiss}
          aria-label={dismissLabel ?? t("dismiss")}
          onClick={onDismiss}
        >
          <X size={20} strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
