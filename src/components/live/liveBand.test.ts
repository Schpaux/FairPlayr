import { describe, expect, it } from "vitest";
import { liveBandFits, pickLiveBandItem, rectsOverlap, type BandRect } from "@/components/live/liveBand";

const rect = (left: number, top: number, width: number, height: number): BandRect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe("pickLiveBandItem (one band at a time)", () => {
  it("error > warning > info, first among equals, ignoring empty slots", () => {
    const info = { tone: "info" as const, key: "restoredMatch" };
    const warning = { tone: "warning" as const, key: "workspaceError" };
    const error = { tone: "error" as const, key: "storageError" };

    expect(pickLiveBandItem([info, warning, error])).toBe(error);
    expect(pickLiveBandItem([info, null, warning])).toBe(warning);
    expect(pickLiveBandItem([false, info, undefined])).toBe(info);
    expect(pickLiveBandItem([{ ...info, key: "a" }, { ...info, key: "b" }])?.key).toBe("a");
    expect(pickLiveBandItem([])).toBeNull();
  });
});

describe("liveBandFits", () => {
  const pitch = rect(0, 140, 375, 360);
  const band = rect(12, 152, 351, 64);

  it("fits over grass", () => {
    expect(liveBandFits({ band, pitch, obstacles: [rect(160, 260, 56, 70)] })).toBe(true);
  });

  it("never covers any token, not only the top-most one", () => {
    const topMost = rect(160, 230, 56, 70);
    // A lower token that the band still reaches (a tall, wrapped notice).
    const tallBand = rect(12, 152, 351, 200);
    const lower = rect(40, 330, 56, 70);
    expect(liveBandFits({ band: tallBand, pitch, obstacles: [topMost] })).toBe(false);
    expect(liveBandFits({ band: rect(12, 152, 351, 70), pitch, obstacles: [topMost, lower] })).toBe(true);
    expect(liveBandFits({ band: rect(12, 152, 351, 190), pitch, obstacles: [rect(300, 150, 56, 70), lower] })).toBe(
      false
    );
  });

  it("never runs past the pitch (strip and bench below it)", () => {
    expect(liveBandFits({ band: rect(12, 152, 351, 400), pitch, obstacles: [] })).toBe(false);
  });

  it("ignores elements without a box (not laid out)", () => {
    expect(liveBandFits({ band, pitch: rect(0, 0, 0, 0), obstacles: [rect(0, 0, 0, 0)] })).toBe(true);
  });

  it("edges that only touch do not overlap", () => {
    expect(rectsOverlap(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(false);
    expect(rectsOverlap(rect(0, 0, 10, 10), rect(9, 9, 10, 10))).toBe(true);
  });
});
