import { describe, expect, it } from "vitest";
import { benchMaxRows, benchWidth, chooseBenchLayout } from "@/components/live/benchLayout";

// Content widths as measured in the prototype renders for Inter 600 14px
// names ("Henriette S" ≈ 68, "Ida R" ≈ 28). The dugout at 375 wide leaves
// 351px, at 390 wide 366.
const NAMES = [68, 28, 32, 34, 41, 60, 56, 66, 62, 44, 50, 70, 40, 52, 48];

describe("benchMaxRows", () => {
  it("allows two rows under 780px tall and three from 780px", () => {
    expect(benchMaxRows(640)).toBe(2);
    expect(benchMaxRows(750)).toBe(2);
    expect(benchMaxRows(779)).toBe(2);
    expect(benchMaxRows(780)).toBe(3);
    expect(benchMaxRows(844)).toBe(3);
  });
});

describe("benchWidth", () => {
  it("sums column widths column-major, with gaps and the 44px floor", () => {
    // Two rows: columns [80, 38] → 100, [52, 54] → 74, [10] → 44.
    expect(benchWidth([80, 38, 52, 54, 10], 2, "regular")).toBe(100 + 74 + 44 + 2 * 4);
    expect(benchWidth([80, 38, 52, 54, 10], 2, "snug")).toBe(90 + 64 + 44 + 2 * 4);
    expect(benchWidth([], 2, "regular")).toBe(0);
  });
});

describe("chooseBenchLayout", () => {
  it("uses one row when every substitute fits", () => {
    expect(chooseBenchLayout({ contentWidths: NAMES.slice(0, 5), available: 351, maxRows: 2 })).toEqual({
      rows: 1,
      pad: "regular",
      rail: false,
    });
  });

  it("uses two rows, without a rail, for 8 substitutes on a short phone", () => {
    const layout = chooseBenchLayout({ contentWidths: NAMES.slice(0, 8), available: 351, maxRows: 2 });
    expect(layout.rows).toBe(2);
    expect(layout.rail).toBe(false);
  });

  it("tightens the padding step by step before it gives up and makes a rail", () => {
    const widths = NAMES.slice(0, 8);
    const regular = benchWidth(widths, 2, "regular");
    const tight = benchWidth(widths, 2, "tight");
    const snug = benchWidth(widths, 2, "snug");
    expect(regular).toBeGreaterThan(tight);
    expect(tight).toBeGreaterThan(snug);
    expect(chooseBenchLayout({ contentWidths: widths, available: tight, maxRows: 2 })).toEqual({
      rows: 2,
      pad: "tight",
      rail: false,
    });
    expect(chooseBenchLayout({ contentWidths: widths, available: snug, maxRows: 2 })).toEqual({
      rows: 2,
      pad: "snug",
      rail: false,
    });
    expect(chooseBenchLayout({ contentWidths: widths, available: snug - 1, maxRows: 2 })).toEqual({
      rows: 2,
      pad: "regular",
      rail: true,
    });
  });

  it("makes a rail with the most rows allowed when not everyone fits", () => {
    for (const count of [9, 11, 15]) {
      expect(chooseBenchLayout({ contentWidths: NAMES.slice(0, count), available: 351, maxRows: 2 })).toEqual({
        rows: 2,
        pad: "regular",
        rail: true,
      });
    }
  });

  it("uses a third row on tall phones instead of a rail when that fits", () => {
    const layout = chooseBenchLayout({ contentWidths: NAMES.slice(0, 11), available: 366, maxRows: 3 });
    expect(layout).toEqual({ rows: 3, pad: expect.any(String), rail: false });
    expect(chooseBenchLayout({ contentWidths: NAMES, available: 366, maxRows: 3 }).rail).toBe(true);
  });

  it("never uses more rows than there are substitutes", () => {
    expect(chooseBenchLayout({ contentWidths: [400], available: 351, maxRows: 3 })).toEqual({
      rows: 1,
      pad: "regular",
      rail: true,
    });
    expect(chooseBenchLayout({ contentWidths: [], available: 351, maxRows: 2 })).toEqual({
      rows: 1,
      pad: "regular",
      rail: false,
    });
  });
});
