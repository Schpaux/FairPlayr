// FEAT-SHARE-01: the visitor's match clock runs locally from the coach's last
// clock basis, with the live screen's digits (half, pause, stoppage).
import { describe, expect, it } from "vitest";
import { publicMatchClock } from "@/components/share/publicMatchClock";
import type { PublicLiveState } from "@/domain/matchShare";

const MIN = 60_000;

function live(overrides: Partial<PublicLiveState> = {}): PublicLiveState {
  return {
    updatedAt: null,
    phase: "first_half",
    status: "running",
    halves: 2,
    regularSecondsPerHalf: 25 * 60,
    phaseStartedAtElapsedMs: 0,
    clock: { startedAtMs: 0, pausedAtMs: null, accumulatedPausedMs: 0, isRunning: true },
    ...overrides,
  };
}

describe("publicMatchClock", () => {
  it("has no clock before the first ▶", () => {
    expect(publicMatchClock(live({ status: "not_started", clock: { startedAtMs: null, pausedAtMs: null, accumulatedPausedMs: 0, isRunning: false } }), MIN)).toBeNull();
    expect(publicMatchClock(null, MIN)).toBeNull();
  });

  it("runs between updates, and the second half continues from the half length", () => {
    expect(publicMatchClock(live(), 10 * MIN + 5_000)).toMatchObject({ text: "10:05", state: "running", half: 1, stoppage: false });
    const second = live({ phase: "second_half", phaseStartedAtElapsedMs: 25 * MIN });
    expect(publicMatchClock(second, 27 * MIN)).toMatchObject({ text: "27:00", half: 2 });
  });

  it("a paused clock stands still and says so; half-time is its own state", () => {
    const paused = live({ status: "paused", clock: { startedAtMs: 0, pausedAtMs: 12 * MIN, accumulatedPausedMs: 0, isRunning: false } });
    expect(publicMatchClock(paused, 20 * MIN)).toMatchObject({ text: "12:00", state: "stopped", half: 1 });
    const halfTime = live({
      phase: "half_time",
      status: "paused",
      phaseStartedAtElapsedMs: 26 * MIN,
      clock: { startedAtMs: 0, pausedAtMs: 26 * MIN, accumulatedPausedMs: 0, isRunning: false },
    });
    expect(publicMatchClock(halfTime, 30 * MIN)).toMatchObject({ state: "halfTime", half: null });
  });

  it("past the half's ordinary end it shows stoppage time", () => {
    expect(publicMatchClock(live(), 27 * MIN + 13_000)).toMatchObject({ text: "25+2:13", stoppage: true });
  });

  it("a one-half match has no half number", () => {
    expect(publicMatchClock(live({ halves: 1, regularSecondsPerHalf: 40 * 60 }), 5 * MIN)).toMatchObject({ text: "05:00", half: null });
  });
});
