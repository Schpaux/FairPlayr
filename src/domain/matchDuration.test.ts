import { describe, expect, it } from "vitest";
import {
  createCustomDuration,
  createCustomPeriodDuration,
  getCustomPeriodBounds,
  setMatchCustomPeriodDuration,
  setMatchHalves,
  type MatchConfig,
} from "@/domain/match";

const base = {
  id: "s",
  teamId: "t",
  format: "7v7",
  reportEnabled: false,
  formationId: "7v7-2-3-1",
  duration: { mode: "preset", presetId: "2x20", halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
  selectedPlayerIds: [],
  startingPlayerIds: [],
  slotAssignments: {},
  createdAt: "2026-10-25T10:00:00.000Z",
  updatedAt: "2026-10-25T10:00:00.000Z",
} as unknown as MatchConfig;

describe("custom duration per period (UI-DURATION-01)", () => {
  it("2 × 18 is 18 minutes per half and 36 in total", () => {
    expect(createCustomPeriodDuration(2, 18)).toEqual({
      mode: "custom",
      presetId: null,
      halves: 2,
      minutesPerHalf: 18,
      totalMinutes: 36,
    });
  });

  it("one period keeps its length as both the period and the total", () => {
    expect(createCustomPeriodDuration(1, 50)).toMatchObject({ halves: 1, minutesPerHalf: 50, totalMinutes: 50 });
  });

  it("keeps the match within the existing 5–240 minute limits", () => {
    expect(getCustomPeriodBounds(2)).toEqual({ min: 3, max: 120 });
    expect(getCustomPeriodBounds(1)).toEqual({ min: 5, max: 240 });
    expect(createCustomPeriodDuration(2, 1).totalMinutes).toBe(6);
    expect(createCustomPeriodDuration(2, 500).totalMinutes).toBe(240);
    expect(createCustomPeriodDuration(1, 2).totalMinutes).toBe(5);
  });

  it("keeps the chosen halves (the total-minutes setter always made two)", () => {
    const onePeriod = setMatchHalves(base, 1);
    const next = setMatchCustomPeriodDuration(onePeriod, 1, 35);
    expect(next.duration).toMatchObject({ mode: "custom", halves: 1, minutesPerHalf: 35, totalMinutes: 35 });
  });

  it("leaves the existing total-minutes behaviour unchanged", () => {
    expect(createCustomDuration(36)).toMatchObject({ halves: 2, minutesPerHalf: 18, totalMinutes: 36 });
    expect(createCustomDuration(3)).toMatchObject({ totalMinutes: 5 });
  });
});
