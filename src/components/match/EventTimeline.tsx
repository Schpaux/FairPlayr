"use client";

/**
 * Event timeline (DESIGN.md §7.2, UI-EVENTS-01): one presentation for the live
 * event history and the match-details timeline.
 *
 * The minute leads every row; our events follow it on the left and the
 * opponent's sit at the right edge. A type glyph sits before the words (goal net,
 * two-way arrow); goals are bold, substitutions regular (in and out on two
 * lines); the scorer and the assist share a line and wrap rather than truncate. Each row has one text
 * alternative in reading order; the visual columns are hidden from assistive
 * tech. Pure presentation: the caller decides the order and which rows can be
 * edited.
 */

import { ArrowLeftRight, Goal, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { ListGroup } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const ICON = { size: 20, strokeWidth: 1.75, "aria-hidden": true } as const;

export interface TimelineEntry {
  id: string;
  minute: number | null;
  side: "own" | "opponent";
  kind: "goal" | "substitution";
  /** Goal: the scorer (null when not registered). Substitution: the player on. */
  primary: string | null;
  /** Goal: the assist. Substitution: the player off. */
  secondary: string | null;
}

interface EventTimelineProps {
  entries: TimelineEntry[];
  /** Names the opponent in their goals ("Mål · Lyn"). */
  opponentName: string;
  /** Accessible name of the list. */
  label: string;
  /** Rows for which this returns true are buttons that call `onEdit`. */
  canEdit?: (entry: TimelineEntry) => boolean;
  onEdit?: (entry: TimelineEntry) => void;
  /** Appended to an editable row's name; defaults to «Rediger». */
  editLabel?: string;
  /** `data-testid` of each row is `${rowTestIdPrefix}${entry.id}`. */
  rowTestIdPrefix?: string;
  className?: string;
  testId?: string;
}

export function EventTimeline({
  entries,
  opponentName,
  label,
  canEdit,
  onEdit,
  editLabel,
  rowTestIdPrefix,
  className,
  testId,
}: EventTimelineProps) {
  const t = useTranslations("eventTimeline");

  const spoken = (entry: TimelineEntry) => {
    const minute = entry.minute !== null ? t("a11y.minute", { minute: entry.minute }) : "";
    if (entry.kind === "substitution") {
      return minute + t("a11y.substitution", {
        in: entry.primary ?? t("unknownPlayer"),
        out: entry.secondary ?? t("unknownPlayer"),
      });
    }
    if (entry.side === "opponent") return minute + t("a11y.opponentGoal", { opponent: opponentName });
    if (!entry.primary) return minute + t("a11y.ownGoalUnknown");
    return (
      minute +
      (entry.secondary
        ? t("a11y.ownGoalAssist", { scorer: entry.primary, assist: entry.secondary })
        : t("a11y.ownGoal", { scorer: entry.primary }))
    );
  };

  const words = (entry: TimelineEntry) => {
    if (entry.kind === "substitution") {
      return (
        // In and out on their own lines, so a long name wraps inside its line.
        <span className="block text-[14px] leading-5 font-normal text-fp-ink-2">
          <span className="block">{t("subIn", { name: entry.primary ?? t("unknownPlayer") })}</span>
          <span className="block">{t("subOut", { name: entry.secondary ?? t("unknownPlayer") })}</span>
        </span>
      );
    }
    const strong = entry.side === "own" ? entry.primary ?? t("goal") : t("goal");
    const rest =
      entry.side === "own"
        ? entry.primary && entry.secondary
          ? t("assist", { name: entry.secondary })
          : null
        : opponentName;
    return (
      <span className="text-[14px] leading-5 text-fp-ink-2">
        <strong className="text-[15px] font-bold text-fp-ink">{strong}</strong>
        {rest ? (
          <>
            <span> · </span>
            {rest}
          </>
        ) : null}
      </span>
    );
  };

  return (
    <ListGroup aria-label={label} className={className} testId={testId}>
      {entries.map((entry) => {
        const editable = Boolean(onEdit && canEdit?.(entry));
        const own = entry.side === "own";
        const glyph = entry.kind === "goal" ? <Goal {...ICON} /> : <ArrowLeftRight {...ICON} />;
        // The minute leads every row; our events follow it on the left, the
        // opponent's sit at the right edge. Names get almost the full width.
        const content = (
          <span aria-hidden className="grid w-full grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2">
            <span className="pt-0.5 text-[14px] leading-5 font-semibold tabular-nums text-fp-ink">
              {entry.minute !== null ? t("minute", { minute: entry.minute }) : "–"}
            </span>
            {own ? (
              <span className="flex min-w-0 items-start gap-2 text-left [overflow-wrap:break-word]">
                <span className="mt-0.5 shrink-0 text-fp-ink">{glyph}</span>
                <span className="min-w-0 flex-1">{words(entry)}</span>
                {editable ? (
                  <span className="mt-0.5 shrink-0 text-fp-ink-2">
                    <Pencil size={18} strokeWidth={1.75} aria-hidden />
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="flex min-w-0 items-start justify-end gap-2 pl-8 text-right [overflow-wrap:break-word]">
                <span className="min-w-0">{words(entry)}</span>
                <span className="mt-0.5 shrink-0 text-fp-ink">{glyph}</span>
              </span>
            )}
          </span>
        );
        const rowClass = "flex min-h-[54px] w-full items-center px-3 py-3";
        const testIdValue = rowTestIdPrefix ? `${rowTestIdPrefix}${entry.id}` : undefined;

        return (
          <li key={entry.id} className="border-t border-fp-rule first:border-t-0" data-side={entry.side} data-kind={entry.kind}>
            {editable ? (
              <button
                type="button"
                className={cn(
                  rowClass,
                  "text-left transition-colors duration-(--fp-d-quick) focus-visible:ring-inset focus-visible:ring-offset-0 active:bg-fp-surface-2"
                )}
                aria-label={`${spoken(entry)}. ${editLabel ?? t("edit")}`}
                onClick={() => onEdit?.(entry)}
                data-testid={testIdValue}
              >
                {content}
              </button>
            ) : (
              <div className={rowClass} data-testid={testIdValue}>
                <span className="sr-only">{spoken(entry)}</span>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ListGroup>
  );
}
