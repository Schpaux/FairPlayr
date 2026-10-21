import type { ReactNode } from "react";

/**
 * Live notice band rules (DESIGN.md §5.6), as pure functions.
 *
 * - One message at a time: the most severe wins (error > warning > info);
 *   among equals, the first one given.
 * - The band is shown only when it fits: it may cover grass, but never a
 *   player token (any of them), the scoreboard, the action strip or the
 *   bench, and it stays inside the pitch. Otherwise the message lives in the
 *   scoreboard meta line and the menu only ("moves into the menu").
 */

export type LiveBandTone = "error" | "warning" | "info";

export interface LiveBandItem {
  /** Stable per message, e.g. "storageError". */
  key: string;
  tone: LiveBandTone;
  /** The full notice (a `Notice`), rendered only while the band fits. */
  render: () => ReactNode;
  /** Announced in its place while the band does not fit. */
  announcement: string;
}

const RANK: Record<LiveBandTone, number> = { error: 0, warning: 1, info: 2 };

export function pickLiveBandItem<T extends { tone: LiveBandTone }>(
  items: readonly (T | null | undefined | false)[]
): T | null {
  let best: T | null = null;
  for (const item of items) {
    if (!item) continue;
    if (!best || RANK[item.tone] < RANK[best.tone]) best = item;
  }
  return best;
}

export interface BandRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function rectsOverlap(a: BandRect, b: BandRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function hasArea(rect: BandRect): boolean {
  return rect.right > rect.left && rect.bottom > rect.top;
}

/**
 * Whether the band can be shown: it overlaps none of the obstacles (every
 * player token, the scoreboard, strip and bench) and does not run past the
 * bottom of the pitch.
 */
export function liveBandFits(input: {
  band: BandRect;
  pitch: BandRect | null;
  obstacles: readonly BandRect[];
}): boolean {
  const { band, pitch, obstacles } = input;
  if (pitch && hasArea(pitch) && band.bottom > pitch.bottom) return false;
  return obstacles.every((obstacle) => !hasArea(obstacle) || !rectsOverlap(band, obstacle));
}
