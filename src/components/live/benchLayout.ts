/**
 * Adaptive bench layout (FP-MS2.1-B2, Alternative C; DESIGN.md §5.3).
 *
 * Pure: given each tile's measured content width (in display order), the
 * width available and the row cap, choose rows, side padding and whether the
 * bench becomes a horizontal rail. Tiles are laid out column by column
 * (column-major), so the least-played fill the first column from the top and
 * every column is as wide as its widest tile.
 *
 * Preference (prototype rail.js `layout`):
 *   1. No rail: the fewest rows, then regular → tight → snug padding.
 *      "Snug" exists only to avoid a rail (8 subs at 360 × 640).
 *   2. Otherwise a rail with the most rows allowed, regular padding.
 * Row height never changes here (44px, 50px on tall phones, in CSS), so the
 * bench is never taller than `maxRows` rows and the pitch keeps its height.
 */

export type BenchPad = "regular" | "tight" | "snug";

/** Side padding per tile, px (rail.css: 10 / 7 / 5). */
export const BENCH_PAD_PX: Record<BenchPad, number> = { regular: 10, tight: 7, snug: 5 };
/** Gap between tiles, px. */
export const BENCH_GAP_PX = 4;
/** Minimum tile width, px: the touch-target floor. */
export const BENCH_MIN_TILE_PX = 44;
/** Viewport height from which a third row is allowed (DESIGN.md "tall"). */
export const BENCH_TALL_MIN_HEIGHT_PX = 780;

export interface BenchLayout {
  rows: number;
  pad: BenchPad;
  rail: boolean;
}

/** Rows allowed: two on short and regular phones, three on tall phones. */
export function benchMaxRows(viewportHeight: number): number {
  return viewportHeight >= BENCH_TALL_MIN_HEIGHT_PX ? 3 : 2;
}

/** Total width of the bench laid out column-major in `rows` rows. */
export function benchWidth(contentWidths: readonly number[], rows: number, pad: BenchPad): number {
  if (contentWidths.length === 0) return 0;
  const columns: number[] = [];
  contentWidths.forEach((content, index) => {
    const column = Math.floor(index / rows);
    const tile = Math.max(BENCH_MIN_TILE_PX, Math.ceil(content) + 2 * BENCH_PAD_PX[pad]);
    columns[column] = Math.max(columns[column] ?? 0, tile);
  });
  return columns.reduce((sum, width) => sum + width, 0) + BENCH_GAP_PX * (columns.length - 1);
}

export function chooseBenchLayout(input: {
  contentWidths: readonly number[];
  available: number;
  maxRows: number;
}): BenchLayout {
  const { contentWidths, available, maxRows } = input;
  const count = contentWidths.length;
  const rowCap = Math.max(1, Math.min(maxRows, count));
  if (count === 0) return { rows: 1, pad: "regular", rail: false };

  for (let rows = 1; rows <= rowCap; rows += 1) {
    for (const pad of ["regular", "tight", "snug"] as const) {
      if (benchWidth(contentWidths, rows, pad) <= available + 0.5) return { rows, pad, rail: false };
    }
  }
  return { rows: rowCap, pad: "regular", rail: true };
}
