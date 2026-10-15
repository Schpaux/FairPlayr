/**
 * Token placement for the live pitch (DESIGN.md §5.2, ported from the
 * prototype's `place()`). Pure layout: it reads formation coordinates only.
 *
 * Slots are clustered into lines (forwards → keeper). The lines are spread
 * evenly over the token-safe box and each slot keeps a damped version of its
 * offset within its line, so the shape still reads and rows never collide.
 * `room` is the horizontal distance (in %) to the nearest player in the same
 * line, which caps the width of that player's name tag.
 */

import type { FieldSlot, MatchFormat } from "@/domain/match";

export interface TokenPlacement {
  /** Horizontal centre, 0–100 % of the token box. */
  x: number;
  /** Vertical anchor, 0–100 % of the token box. */
  y: number;
  /** Width available to the token, in % of the token box. */
  room: number;
}

const ROW_TOLERANCE = 8;
const ROW_OFFSET_DAMPING = 0.5;
const MAX_LONE_ROOM = 70;

export function placeTokens(slots: FieldSlot[]): Record<string, TokenPlacement> {
  const ys = [...new Set(slots.map((slot) => slot.y))].sort((a, b) => a - b);
  const rows: number[][] = [];

  for (const y of ys) {
    const row = rows[rows.length - 1];
    if (row && y - row[row.length - 1] <= ROW_TOLERANCE) {
      row.push(y);
    } else {
      rows.push([y]);
    }
  }

  const placements: Record<string, TokenPlacement> = {};

  for (const slot of slots) {
    const rowIndex = rows.findIndex((row) => row.includes(slot.y));
    const row = rows[rowIndex];
    const mean = row.reduce((sum, y) => sum + y, 0) / row.length;
    const mates = slots
      .filter((other) => other.id !== slot.id && row.includes(other.y))
      .map((other) => Math.abs(other.x - slot.x));
    const room = mates.length
      ? Math.min(...mates)
      : Math.min(2 * Math.min(slot.x, 100 - slot.x), MAX_LONE_ROOM);
    const lineY = (rowIndex / Math.max(1, rows.length - 1)) * 100;

    placements[slot.id] = {
      x: slot.x,
      y: Math.max(0, Math.min(100, lineY + (slot.y - mean) * ROW_OFFSET_DAMPING)),
      room,
    };
  }

  return placements;
}

/** Token density: compact from 9 on the field, roomy up to 5. */
export function tokenDensity(fieldCount: number): "compact" | "roomy" | "regular" {
  if (fieldCount > 7) return "compact";
  if (fieldCount <= 5) return "roomy";
  return "regular";
}

/**
 * Display-only keeper marker: the first slot of every formation preset is the
 * keeper, except 3v3, which has none (IMPLEMENTATION-PLAN.md). The domain has
 * no keeper concept yet, so nothing else reads this.
 */
export function isKeeperSlot(format: MatchFormat, slots: FieldSlot[], slotId: string): boolean {
  return format !== "3v3" && slots[0]?.id === slotId;
}
