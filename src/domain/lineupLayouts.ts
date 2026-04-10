import type { MatchFormat } from "@/domain/match";

export interface LineupSlot {
  id: string;
  label: string;
  x: number;
  y: number;
}

const layouts: Record<MatchFormat, LineupSlot[]> = {
  "3v3": [
    { id: "3v3-1", label: "1", x: 50, y: 82 },
    { id: "3v3-2", label: "2", x: 28, y: 46 },
    { id: "3v3-3", label: "3", x: 72, y: 46 },
  ],
  "5v5": [
    { id: "5v5-1", label: "1", x: 50, y: 84 },
    { id: "5v5-2", label: "2", x: 24, y: 62 },
    { id: "5v5-3", label: "3", x: 76, y: 62 },
    { id: "5v5-4", label: "4", x: 34, y: 34 },
    { id: "5v5-5", label: "5", x: 66, y: 34 },
  ],
  "7v7": [
    { id: "7v7-1", label: "1", x: 50, y: 85 },
    { id: "7v7-2", label: "2", x: 20, y: 67 },
    { id: "7v7-3", label: "3", x: 50, y: 67 },
    { id: "7v7-4", label: "4", x: 80, y: 67 },
    { id: "7v7-5", label: "5", x: 24, y: 39 },
    { id: "7v7-6", label: "6", x: 50, y: 32 },
    { id: "7v7-7", label: "7", x: 76, y: 39 },
  ],
  "9v9": [
    { id: "9v9-1", label: "1", x: 50, y: 86 },
    { id: "9v9-2", label: "2", x: 18, y: 70 },
    { id: "9v9-3", label: "3", x: 38, y: 70 },
    { id: "9v9-4", label: "4", x: 62, y: 70 },
    { id: "9v9-5", label: "5", x: 82, y: 70 },
    { id: "9v9-6", label: "6", x: 24, y: 44 },
    { id: "9v9-7", label: "7", x: 50, y: 42 },
    { id: "9v9-8", label: "8", x: 76, y: 44 },
    { id: "9v9-9", label: "9", x: 50, y: 22 },
  ],
  "11v11": [
    { id: "11v11-1", label: "1", x: 50, y: 88 },
    { id: "11v11-2", label: "2", x: 15, y: 72 },
    { id: "11v11-3", label: "3", x: 36, y: 72 },
    { id: "11v11-4", label: "4", x: 64, y: 72 },
    { id: "11v11-5", label: "5", x: 85, y: 72 },
    { id: "11v11-6", label: "6", x: 22, y: 50 },
    { id: "11v11-7", label: "7", x: 50, y: 48 },
    { id: "11v11-8", label: "8", x: 78, y: 50 },
    { id: "11v11-9", label: "9", x: 24, y: 28 },
    { id: "11v11-10", label: "10", x: 50, y: 23 },
    { id: "11v11-11", label: "11", x: 76, y: 28 },
  ],
};

export function getLineupSlots(format: MatchFormat): LineupSlot[] {
  return layouts[format];
}
