"use client";

/**
 * Grass and pitch markings shared by the live pitch and the setup pitch
 * (DESIGN.md §5.2, §7), so both draw one pitch facing one way.
 *
 * Orientation (FP-PITCH-01): formation slots are in % with y = 0 at the
 * opponent's goal line and y = 100 at our own, so the keeper is at the bottom
 * and the team attacks upwards. `placeTokens` keeps that direction.
 *
 * Framing (UI-PITCH-04): only our own half is drawn, plus a strip past the
 * halfway line, so the halfway line sits HALFWAY_LINE_Y px below the top edge
 * and the touchlines run off the top. On phone pitches that is about 52–55 %
 * of the pitch. The token box starts below the line (`.tokenBox` top), so
 * every outfield line stands in our own half and the keeper at our goal.
 */

import { useLayoutEffect, useState, type RefObject } from "react";
import styles from "@/components/live/LiveScreen.module.css";

export interface PitchLineInset {
  /** Unused since UI-PITCH-04: the touchlines run off the top edge. */
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Live: the dugout overlaps the grass by 18px, so the bottom line sits higher. */
export const LIVE_LINE_INSET: PitchLineInset = { top: 10, right: 10, bottom: 28, left: 10 };
/** Halfway line, in px from the top edge; `.tokenBox` starts below it (live 56px, setup 50px). */
export const HALFWAY_LINE_Y = 22;
const STRIPES = 14;

/** Rounded size of an element, kept up to date with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const box = element.getBoundingClientRect();
      setSize((previous) =>
        previous.width === Math.round(box.width) && previous.height === Math.round(box.height)
          ? previous
          : { width: Math.round(box.width), height: Math.round(box.height) }
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

export function PitchMarkings({
  width,
  height,
  inset = LIVE_LINE_INSET,
}: {
  width: number;
  height: number;
  inset?: PitchLineInset;
}) {
  if (!width || !height) return null;

  const x0 = inset.left;
  const x1 = width - inset.right;
  const y1 = height - inset.bottom;
  const pw = x1 - x0;
  const cx = x0 + pw / 2;
  const cy = Math.min(HALFWAY_LINE_Y, y1 / 2);
  // The whole pitch would be twice our half; its proportions stay as before.
  const ph = (y1 - cy) * 2;
  const boxW = pw * 0.58;
  const boxH = Math.min(ph * 0.15, pw * 0.3);
  const sixW = pw * 0.28;
  const sixH = boxH * 0.38;
  const cr = Math.min(pw, ph) * 0.14;
  const arc = cr * 0.75;

  return (
    <svg className={styles.pitchLines} viewBox={`0 0 ${width} ${height}`} data-pitch-markings aria-hidden>
      {Array.from({ length: STRIPES / 2 }, (_, i) => (
        <rect
          key={i}
          className={styles.pitchStripe}
          x={0}
          y={(i * 2 * height) / STRIPES}
          width={width}
          height={height / STRIPES}
        />
      ))}
      <path d={`M${x0} 0V${y1}H${x1}V0`} />
      <path d={`M${x0} ${cy}H${x1}`} />
      <circle cx={cx} cy={cy} r={cr} />
      <circle className={styles.pitchSpot} cx={cx} cy={cy} r={2.2} />
      <rect x={cx - boxW / 2} y={y1 - boxH} width={boxW} height={boxH} />
      <rect x={cx - sixW / 2} y={y1 - sixH} width={sixW} height={sixH} />
      <path d={`M${cx - arc * 0.62} ${y1 - boxH} A${arc} ${arc} 0 0 1 ${cx + arc * 0.62} ${y1 - boxH}`} />
    </svg>
  );
}
