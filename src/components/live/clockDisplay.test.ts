import { describe, expect, it } from "vitest";
import {
  createLiveMatchFromSetup,
  endCurrentHalf,
  endLiveMatch,
  getPlayerAccumulatedSeconds,
  pauseLiveMatch,
  startLiveMatch,
  type LiveMatchState,
} from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import { formatStoppage, getClockDisplay } from "@/components/live/clockDisplay";

const T0 = 1_000_000;
const MIN = 60_000;

function makeSetup(halves: 1 | 2, minutesPerHalf: number): MatchSetup {
  return {
    id: "setup",
    teamId: "team",
    format: "5v5",
    reportEnabled: false,
    formationId: "5v5-2-2",
    duration: {
      mode: "custom",
      presetId: null,
      halves,
      minutesPerHalf: halves === 2 ? minutesPerHalf : minutesPerHalf,
      totalMinutes: halves === 2 ? minutesPerHalf * 2 : minutesPerHalf,
    },
    selectedPlayerIds: ["a", "b", "c", "d", "e", "f"],
    startingPlayerIds: ["a", "b", "c", "d", "e"],
    slotAssignments: { "5v5-1": "a", "5v5-2": "b", "5v5-3": "c", "5v5-4": "d", "5v5-5": "e" },
    createdAt: "2026-10-25T10:00:00.000Z",
    updatedAt: "2026-10-25T10:00:00.000Z",
  } as MatchSetup;
}

/** A 2 × 15 match kicked off at T0. */
function kickedOff(halves: 1 | 2 = 2, minutes = 15): LiveMatchState {
  return startLiveMatch(createLiveMatchFromSetup(makeSetup(halves, minutes)), T0);
}

describe("getClockDisplay (UI-LIVE-04)", () => {
  it("shows 00:00 before kick-off", () => {
    const match = createLiveMatchFromSetup(makeSetup(2, 15));
    expect(getClockDisplay(match, T0 + 5 * MIN)).toEqual({ text: "00:00", regularSeconds: 0, stoppageSeconds: 0 });
  });

  it("counts the first half up to its length as ordinary time", () => {
    const match = kickedOff();
    expect(getClockDisplay(match, T0 + 7 * MIN + 5_000).text).toBe("07:05");
    expect(getClockDisplay(match, T0 + 15 * MIN).text).toBe("15:00");
  });

  it("shows the half's end plus stoppage after it: 15+2:13", () => {
    const display = getClockDisplay(kickedOff(), T0 + 17 * MIN + 13_000);
    expect(display).toEqual({ text: "15+2:13", regularSeconds: 900, stoppageSeconds: 133 });
  });

  it("freezes the first half (with its stoppage) at half-time", () => {
    const halfTime = endCurrentHalf(kickedOff(), T0 + 17 * MIN);
    expect(getClockDisplay(halfTime, T0 + 25 * MIN).text).toBe("15+2:00");

    const onTime = endCurrentHalf(kickedOff(), T0 + 15 * MIN);
    expect(getClockDisplay(onTime, T0 + 20 * MIN).text).toBe("15:00");
  });

  it("starts the second half at the half length, whatever the first half's stoppage", () => {
    const halfTime = endCurrentHalf(kickedOff(), T0 + 17 * MIN);
    const second = startLiveMatch(halfTime, T0 + 30 * MIN);
    expect(getClockDisplay(second, T0 + 30 * MIN).text).toBe("15:00");
    expect(getClockDisplay(second, T0 + 34 * MIN + 30_000).text).toBe("19:30");
    expect(getClockDisplay(second, T0 + 45 * MIN).text).toBe("30:00");
  });

  it("shows full length plus stoppage in the second half: 30+10:00", () => {
    const halfTime = endCurrentHalf(kickedOff(), T0 + 15 * MIN);
    const second = startLiveMatch(halfTime, T0 + 20 * MIN);
    // Second half started 20′ in real time; 25 minutes later it is 10 over.
    expect(getClockDisplay(second, T0 + 45 * MIN).text).toBe("30+10:00");
  });

  it("does not count pauses", () => {
    const paused = pauseLiveMatch(kickedOff(), T0 + 16 * MIN);
    expect(getClockDisplay(paused, T0 + 40 * MIN).text).toBe("15+1:00");
  });

  it("freezes at full time where the second half ended", () => {
    const halfTime = endCurrentHalf(kickedOff(), T0 + 15 * MIN);
    const second = startLiveMatch(halfTime, T0 + 20 * MIN);
    const ended = endCurrentHalf(second, T0 + 36 * MIN + 5_000);
    expect(ended.phase).toBe("full_time");
    expect(getClockDisplay(ended, T0 + 60 * MIN).text).toBe("30+1:05");
  });

  it("keeps a match ended during the first half on the first-half clock", () => {
    const ended = endLiveMatch(kickedOff(), T0 + 9 * MIN);
    expect(getClockDisplay(ended, T0 + 30 * MIN).text).toBe("09:00");
  });

  it("keeps the first-half clock when the match is ended at half-time", () => {
    const halfTime = endCurrentHalf(kickedOff(), T0 + 17 * MIN);
    const ended = endLiveMatch(halfTime, T0 + 20 * MIN);
    expect(ended.phase).toBe("full_time");
    expect(getClockDisplay(ended, T0 + 30 * MIN).text).toBe("15+2:00");
  });

  it("uses the whole length for a one-period match", () => {
    const match = kickedOff(1, 25);
    expect(getClockDisplay(match, T0 + 24 * MIN).text).toBe("24:00");
    expect(getClockDisplay(match, T0 + 27 * MIN + 1_000).text).toBe("25+2:01");
  });

  it("is presentation only: playing time is the same as before", () => {
    const match = kickedOff();
    const now = T0 + 17 * MIN;
    const before = getPlayerAccumulatedSeconds(match, "a", now);
    getClockDisplay(match, now);
    expect(getPlayerAccumulatedSeconds(match, "a", now)).toBe(before);
    expect(before).toBe(17 * 60);
  });
});

describe("formatStoppage", () => {
  it("formats minutes without padding and seconds with", () => {
    expect(formatStoppage(0)).toBe("0:00");
    expect(formatStoppage(65)).toBe("1:05");
    expect(formatStoppage(600)).toBe("10:00");
  });
});
