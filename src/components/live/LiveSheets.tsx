"use client";

/**
 * Live sheets (DESIGN.md §5.5): menu, confirmation, event history and the
 * scorer/assist prompt. Each sheet is a labelled dialog that takes focus on
 * open; the caller returns focus to the control that opened it.
 */

import { useEffect, useId, useRef } from "react";
import { CircleAlert, Flag, History, House, Minus, Share2, TriangleAlert, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { LiveEventView } from "@/components/live/liveScreenModel";
import { EventTimeline, type TimelineEntry } from "@/components/match/EventTimeline";
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
        onKeyDown={trapFocus}
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

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * UI-A11Y-03: Tab and Shift+Tab stay inside the open sheet. The live screen
 * behind it is not made inert, because the announcer lives there and must keep
 * speaking while a sheet is open.
 */
function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const inside = active instanceof Node && event.currentTarget.contains(active);
  if (event.shiftKey && (active === first || !inside || active === event.currentTarget.querySelector("h2"))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !inside)) {
    event.preventDefault();
    first.focus();
  }
}

/** A passive line at the top of the menu (DESIGN.md §5.6: "moves into the menu"). */
export interface LiveMenuNote {
  key: string;
  tone: "warning" | "info";
  text: string;
}

interface MenuSheetProps {
  isOnline: boolean;
  /** First row: why the match is not being saved (DESIGN.md §5.6). */
  saveFailed?: boolean;
  /** Further passive lines (a restored match, a team that could not load). */
  notes?: readonly LiveMenuNote[];
  canEndHalf: boolean;
  canRemoveGoalUs: boolean;
  canRemoveGoalThem: boolean;
  canEndMatch: boolean;
  onClose: () => void;
  onEvents: () => void;
  /** «Del kampen»; left out where sharing is not possible (a guest's match). */
  onShare?: () => void;
  onEndHalf: () => void;
  onRemoveGoalUs: () => void;
  onRemoveGoalThem: () => void;
  onEndMatch: () => void;
}

export function MenuSheet({
  isOnline,
  saveFailed = false,
  notes = [],
  canEndHalf,
  canRemoveGoalUs,
  canRemoveGoalThem,
  canEndMatch,
  onClose,
  onEvents,
  onShare,
  onEndHalf,
  onRemoveGoalUs,
  onRemoveGoalThem,
  onEndMatch,
}: MenuSheetProps) {
  const t = useTranslations("matchLive.sideline.menu");
  const tStorage = useTranslations("restore.storageError");

  return (
    <Sheet title={t("title")} onClose={onClose} testId="live-menu">
      {saveFailed ? (
        <p className={cn(styles.menuNote, styles.menuNoteDanger)} data-testid="live-menu-save-failed">
          <CircleAlert size={18} {...ICON} />
          <span>
            <strong className={styles.menuNoteTitle}>{tStorage("title")}</strong> {tStorage("body")}
          </span>
        </p>
      ) : null}

      {notes.map((note) => (
        <p
          key={note.key}
          className={cn(styles.menuNote, note.tone === "warning" && styles.menuNoteWarning)}
          data-testid={`live-menu-note-${note.key}`}
        >
          {note.tone === "warning" ? <TriangleAlert size={18} {...ICON} /> : <History size={18} {...ICON} />}
          <span>{note.text}</span>
        </p>
      ))}

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
        {onShare ? (
          <button type="button" className={styles.menuRow} onClick={onShare} data-testid="live-menu-share">
            <Share2 size={20} {...ICON} />
            <span className={styles.menuGrow}>{t("share")}</span>
          </button>
        ) : null}
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

/** «Del kampen»: the share panel in a sheet (the panel itself is the caller's). */
export function ShareSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const t = useTranslations("matchLive.sideline.menu");

  return (
    <Sheet title={t("share")} onClose={onClose} testId="live-share-sheet">
      {children}
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
  const tScore = useTranslations("matchLive.sideline.score");
  const close = useTranslations("matchLive.sideline.menu");

  // The event timeline (DESIGN.md §7.2), newest first: the latest goal is the
  // one most often corrected.
  const entries: TimelineEntry[] = [...events].reverse().map((event) => ({
    id: event.id,
    minute: event.minute,
    side: event.kind === "goalThem" ? "opponent" : "own",
    kind: event.kind === "substitution" ? "substitution" : "goal",
    primary: event.primary,
    secondary: event.secondary,
  }));

  return (
    <Sheet title={t("title")} lede={events.length === 0 ? t("empty") : undefined} onClose={onClose} testId="live-events">
      {entries.length > 0 ? (
        <EventTimeline
          entries={entries}
          opponentName={tScore("them")}
          label={t("title")}
          className={styles.eventTimeline}
          rowTestIdPrefix="live-event-"
        />
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
