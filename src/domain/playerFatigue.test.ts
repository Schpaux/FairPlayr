import { describe, it, expect } from "vitest";
import {
  getPlayerFatigue,
  shouldPulse,
  FATIGUE_THRESHOLDS,
} from "@/domain/playerFatigue";

const HALF = 900; // 15 minutes in seconds

describe("getPlayerFatigue", () => {
  it("returns fresh for 0 seconds", () => {
    expect(getPlayerFatigue(0, HALF)).toBe("fresh");
  });

  it("returns fresh just below the watch threshold", () => {
    const justBelow = Math.floor(HALF * FATIGUE_THRESHOLDS.watch) - 1;
    expect(getPlayerFatigue(justBelow, HALF)).toBe("fresh");
  });

  it("returns watch at exactly the watch threshold", () => {
    const atThreshold = Math.ceil(HALF * FATIGUE_THRESHOLDS.watch);
    expect(getPlayerFatigue(atThreshold, HALF)).toBe("watch");
  });

  it("returns watch between watch and act thresholds", () => {
    const mid = Math.floor(HALF * ((FATIGUE_THRESHOLDS.watch + FATIGUE_THRESHOLDS.act) / 2));
    expect(getPlayerFatigue(mid, HALF)).toBe("watch");
  });

  it("returns act at exactly the act threshold", () => {
    const atThreshold = Math.ceil(HALF * FATIGUE_THRESHOLDS.act);
    expect(getPlayerFatigue(atThreshold, HALF)).toBe("act");
  });

  it("returns act between act and critical thresholds", () => {
    const mid = Math.floor(HALF * ((FATIGUE_THRESHOLDS.act + FATIGUE_THRESHOLDS.critical) / 2));
    expect(getPlayerFatigue(mid, HALF)).toBe("act");
  });

  it("returns critical at exactly the critical threshold", () => {
    const atThreshold = Math.ceil(HALF * FATIGUE_THRESHOLDS.critical);
    expect(getPlayerFatigue(atThreshold, HALF)).toBe("critical");
  });

  it("returns critical when played more than the full half", () => {
    expect(getPlayerFatigue(HALF + 60, HALF)).toBe("critical");
  });

  it("returns fresh when halfDurationSeconds is 0 (guard)", () => {
    expect(getPlayerFatigue(999, 0)).toBe("fresh");
  });

  it("works correctly for a 10-minute half (youth format)", () => {
    const half10 = 600;
    expect(getPlayerFatigue(0, half10)).toBe("fresh");
    expect(getPlayerFatigue(359, half10)).toBe("fresh"); // 59.8% — just under watch
    expect(getPlayerFatigue(360, half10)).toBe("watch"); // exactly 60%
    expect(getPlayerFatigue(449, half10)).toBe("watch"); // 74.8% — just under act
    expect(getPlayerFatigue(450, half10)).toBe("act");   // exactly 75% — at act threshold
    expect(getPlayerFatigue(510, half10)).toBe("critical"); // 85%
  });

  it("works correctly for a 30-minute half (adult format)", () => {
    const half30 = 1800;
    expect(getPlayerFatigue(1079, half30)).toBe("fresh"); // 59.9%
    expect(getPlayerFatigue(1080, half30)).toBe("watch"); // 60%
    expect(getPlayerFatigue(1530, half30)).toBe("critical"); // 85%
  });
});

describe("shouldPulse", () => {
  it("returns true only for critical", () => {
    expect(shouldPulse("critical")).toBe(true);
  });

  it("returns false for fresh", () => {
    expect(shouldPulse("fresh")).toBe(false);
  });

  it("returns false for watch", () => {
    expect(shouldPulse("watch")).toBe(false);
  });

  it("returns false for act", () => {
    expect(shouldPulse("act")).toBe(false);
  });
});
