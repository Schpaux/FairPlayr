"use client";

/**
 * Live sheets (DESIGN.md §5.5): menu, confirmation, event history and the
 * scorer/assist prompt. Each sheet is a labelled dialog that takes focus on
 * open; the caller returns focus to the control that opened it.
 */

import { useEffect, useId, useRef } from "react";
import { Flag, History, House, Minus, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { LiveEventView } from "@/components/live/liveScreenModel";
import styles from "@/components/live/LiveScreen.module.css";

const ICON = { strokeWidth: 1.75, "aria-hidden": true } as const;

interface SheetProps {
  title: string;
  lede?: string;
  /** Scrim tap and Escape close the sheet unless this is false. */
  dismissible?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  testId?: string;
}

function Sheet({ title, lede, dismissible = true, onClose, children, testId }: SheetProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!dismissible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissible, onClose]);

  return (
    <div
      className={styles.scrim}
      onClick={dismissible ? onClose : undefined}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.grab} aria-hidden />
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className={styles.sheetTitle}>
          {title}
        </h2>
        {lede ? <p className={styles.sheetLede}>{lede}</p> : <div style={{ height: 12 }} />}
        {children}
      </div>
    </div>
  );
}

interface MenuSheetProps {
  isOnline: boolean;
  canEndHalf: boolean;
  canRemoveGoalUs: boolean;
  canRemoveGoalThem: boolean;
  canEndMatch: boolean;
  onClose: () => void;
  onEvents: () => void;
  onEndHalf: () => void;
  onRemoveGoalUs: () => void;
  onRemoveGoalThem: () => void;
  onEndMatch: () => void;
}

export function MenuSheet({
  isOnline,
  canEndHalf,
  canRemoveGoalUs,
  canRemoveGoalThem,
  canEndMatch,
  onClose,
  onEvents,
  onEndHalf,
  onRemoveGoalUs,
  onRemoveGoalThem,
  onEndMatch,
}: MenuSheetProps) {
  const t = useTranslations("matchLive.sideline.menu");

  return (
    <Sheet title={t("title")} onClose={onClose} testId="live-menu">
      {!isOnline ? (
        <p className={styles.menuNote}>
          <WifiOff size={18} {...ICON} />
          {t("offline")}
        </p>
      ) : null}

      <div className={styles.menuGroup}>
        <button type="button" className={styles.menuRow} onClick={onEvents}>
          <History size={20} {...ICON} />
          <span className={styles.menuGrow}>{t("events")}</span>
        </button>
        {canEndHalf ? (
          <button type="button" className={styles.menuRow} onClick={onEndHalf}>
            <Flag size={20} {...ICON} />
            <span className={styles.menuGrow}>{t("endHalf")}</span>
          </button>
        ) : null}
        <button type="button" className={styles.menuRow} disabled={!canRemoveGoalUs} onClick={onRemoveGoalUs}>
          <Minus size={20} {...ICON} />
          <span className={styles.menuGrow}>{t("removeGoalUs")}</span>
        </button>
        <button type="button" className={styles.menuRow} disabled={!canRemoveGoalThem} onClick={onRemoveGoalThem}>
          <Minus size={20} {...ICON} />
          <span className={styles.menuGrow}>{t("removeGoalThem")}</span>
        </button>
      </div>

      <div className={styles.menuGroup}>
        {/* Leaves Live without touching the match; Home's banner leads back. */}
        <Link href="/" className={styles.menuRow}>
          <House size={20} {...ICON} />
          <span className={styles.menuGrow}>{t("leaveToHome")}</span>
        </Link>
      </div>

      {canEndMatch ? (
        <div className={styles.menuGroup}>
          <button type="button" className={cn(styles.menuRow, styles.menuRowDanger)} onClick={onEndMatch}>
            <span className={styles.menuGrow}>{t("endMatch")}</span>
          </button>
        </div>
      ) : null}

      <button type="button" className={cn(styles.btn, styles.btnSecondary, styles.btnBlock)} onClick={onClose}>
        {t("close")}
      </button>
    </Sheet>
  );
}

interface ConfirmSheetProps {
  title: string;
  lede: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmSheet({ title, lede, confirmLabel, destructive, onConfirm, onClose }: ConfirmSheetProps) {
  const t = useTranslations("matchLive.sideline.confirm");

  return (
    <Sheet title={title} lede={lede} onClose={onClose} testId="live-confirm">
      <div className={styles.buttonStack}>
        <button
          type="button"
          className={cn(styles.btn, styles.btnBlock, destructive ? styles.btnDanger : styles.btnPrimary)}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button type="button" className={cn(styles.btn, styles.btnBlock, styles.btnSecondary)} onClick={onClose}>
          {t("keepPlaying")}
        </button>
      </div>
    </Sheet>
  );
}

export function EventsSheet({ events, onClose }: { events: LiveEventView[]; onClose: () => void }) {
  const t = useTranslations("matchLive.sideline.events");
  const close = useTranslations("matchLive.sideline.menu");

  return (
    <Sheet title={t("title")} lede={events.length === 0 ? t("empty") : undefined} onClose={onClose} testId="live-events">
      {events.length > 0 ? (
        <ul className={cn(styles.menuGroup, styles.eventList)}>
          {[...events].reverse().map((event) => (
            <li key={event.id} className={styles.eventRow}>
              <span className={styles.eventMinute}>
                {event.minute !== null ? t("minute", { minute: event.minute }) : ""}
              </span>
              <span>
                {event.kind === "substitution"
                  ? t("substitution")
                  : event.kind === "goalUs"
                    ? t("goalUs")
                    : t("goalThem")}
                {event.kind === "substitution" && (event.primary || event.secondary) ? (
                  <span className={styles.eventDetail}>
                    {t("swap", { in: event.primary ?? "–", out: event.secondary ?? "–" })}
                  </span>
                ) : null}
                {event.kind !== "substitution" && event.primary ? (
                  <span className={styles.eventDetail}>
                    {event.primary}
                    {event.secondary ? ` · ${t("assist", { name: event.secondary })}` : ""}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className={cn(styles.btn, styles.btnSecondary, styles.btnBlock)} onClick={onClose}>
        {close("close")}
      </button>
    </Sheet>
  );
}

export interface GoalPromptView {
  /** Changes for every new prompt step, restarting the 10 s drain bar. */
  key: string;
  step: "scorer" | "assist";
  options: { id: string; name: string; discLabel: string; hasNumber: boolean }[];
}

export function GoalContributorSheet({
  prompt,
  onPick,
}: {
  prompt: GoalPromptView;
  onPick: (playerId: string | null) => void;
}) {
  const t = useTranslations("matchLive.prompt");

  return (
    <Sheet
      key={prompt.key}
      title={prompt.step === "scorer" ? t("scorerTitle") : t("assistTitle")}
      dismissible={false}
      onClose={() => undefined}
      testId="live-scorer"
    >
      <div className={styles.sheetDrain} aria-hidden />
      <div className={styles.scorerGrid}>
        {prompt.options.map((option) => (
          <button key={option.id} type="button" className={styles.scorerOption} onClick={() => onPick(option.id)}>
            <span className={cn(styles.scorerDisc, !option.hasNumber && styles.scorerDiscInitials)} aria-hidden>
              {option.discLabel}
            </span>
            <span className={styles.scorerName}>{option.name}</span>
          </button>
        ))}
      </div>
      <button type="button" className={cn(styles.btn, styles.btnSecondary, styles.btnBlock)} onClick={() => onPick(null)}>
        {prompt.step === "scorer" ? t("skip") : t("noAssist")}
      </button>
    </Sheet>
  );
}
