"use client";

import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./primitives.module.css";

/**
 * SegmentedChoice (UI-FOUND-01): pick one of two to four short options, for
 * example a match format or the theme. It is a native radio group in a pill
 * track: arrow keys move the choice, Tab enters and leaves the group, and a
 * screen reader hears "radio button, 2 of 3". The selected segment is a lime
 * fill with `on-lime` ink (selection, DESIGN.md §2.2) and a check glyph, so
 * the choice never rests on colour alone; the rest are `ink-2`.
 * Each segment is at least 44px tall and the whole segment is the hit area.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedChoiceProps<T extends string> {
  /** The group's name, shown as a 13px caps kicker unless `hideLabel`. */
  label: ReactNode;
  hideLabel?: boolean;
  options: readonly SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Form field name; generated when omitted. */
  name?: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

export function SegmentedChoice<T extends string>({
  label,
  hideLabel = false,
  options,
  value,
  onValueChange,
  name,
  disabled = false,
  className,
  testId,
}: SegmentedChoiceProps<T>) {
  const generatedName = useId();
  const groupName = name ?? generatedName;

  return (
    <fieldset className={cn(styles.segmented, className)} disabled={disabled} data-testid={testId}>
      <legend className={hideLabel ? styles.srOnly : styles.segmentedLegend}>{label}</legend>
      <div className={styles.segmentedTrack}>
        {options.map((option) => (
          <label key={option.value} className={styles.segment}>
            <input
              type="radio"
              className={styles.segmentInput}
              name={groupName}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => onValueChange(option.value)}
            />
            <span className={styles.segmentLabel}>
              <Check className={styles.segmentCheck} size={16} strokeWidth={2} aria-hidden />
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
