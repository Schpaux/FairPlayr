"use client";

/**
 * Grass and full-pitch markings shared by the live pitch and the setup pitch
 * (DESIGN.md §5.2, §7), so both draw one pitch facing one way.
 *
 * Orientation (FP-PITCH-01): formation slots are in % with y = 0 at the
 * opponent's goal line and y = 100 at our own, so the keeper is at the bottom
 * and the team attacks upwards. `placeTokens` keeps that direction, and the
 * markings are symmetric, so the drawn pitch never contradicts the tokens.
 */

import { useLayoutEffect, useState, type RefObject } from "react";
import styles from "@/components/live/LiveScreen.module.css";

export interface PitchLineInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Live: the dugout overlaps the grass by 18px, so the bottom line sits higher. */
export const LIVE_LINE_INSET: PitchLineInset = { top: 10, right: 10, bottom: 28, left: 10 };
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
  const y0 = inset.top;
  const x1 = width - inset.right;
  const y1 = height - inset.bottom;
  const pw = x1 - x0;
  const ph = y1 - y0;
  const cx = x0 + pw / 2;
  const cy = y0 + ph / 2;
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
      <rect x={x0} y={y0} width={pw} height={ph} rx={2} />
      <path d={`M${x0} ${cy}H${x1}`} />
      <circle cx={cx} cy={cy} r={cr} />
      <circle className={styles.pitchSpot} cx={cx} cy={cy} r={2.2} />
      <rect x={cx - boxW / 2} y={y0} width={boxW} height={boxH} />
      <rect x={cx - sixW / 2} y={y0} width={sixW} height={sixH} />
      <rect x={cx - boxW / 2} y={y1 - boxH} width={boxW} height={boxH} />
      <rect x={cx - sixW / 2} y={y1 - sixH} width={sixW} height={sixH} />
      <path d={`M${cx - arc * 0.62} ${y0 + boxH} A${arc} ${arc} 0 0 0 ${cx + arc * 0.62} ${y0 + boxH}`} />
      <path d={`M${cx - arc * 0.62} ${y1 - boxH} A${arc} ${arc} 0 0 1 ${cx + arc * 0.62} ${y1 - boxH}`} />
    </svg>
  );
}
