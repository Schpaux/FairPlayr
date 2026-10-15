import { describe, expect, it } from "vitest";
import {
  createLiveMatchFromSetup,
  endCurrentHalf,
  getPlayerAccumulatedSeconds,
  moveBenchPlayerToSlot,
  pauseLiveMatch,
  removePlayerFromField,
  resumeLiveMatch,
  startLiveMatch,
  substitutePlayers,
  type LiveMatchState,
} from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import { getPlayerStintSeconds } from "@/domain/playerStint";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSetup(overrides: Partial<MatchSetup> = {}): MatchSetup {
  return {
    id: "setup-1",
    teamId: "team-1",
    format: "5v5",
    reportEnabled: true,
    formationId: "5v5-2-2",
    duration: {
      mode: "preset",
      presetId: "2x15",
      halves: 2,
      minutesPerHalf: 15,
      totalMinutes: 30,
    },
    selectedPlayerIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7"],
    startingPlayerIds: ["p1", "p2", "p3", "p4", "p5"],
    slotAssignments: {
      "5v5-1": "p1",
      "5v5-2": "p2",
      "5v5-3": "p3",
      "5v5-4": "p4",
      "5v5-5": "p5",
    },
    createdAt: "2026-04-15T10:00:00.000Z",
    updatedAt: "2026-04-15T10:00:00.000Z",
    ...overrides,
  };
}

const T0 = 1_000_000;
const MIN = 60_000;

/** Wall-clock time `minutes` after T0. */
const at = (minutes: number) => T0 + minutes * MIN;

function kickedOff(): LiveMatchState {
  return startLiveMatch(createLiveMatchFromSetup(makeSetup()), T0);
}

const stint = (state: LiveMatchState, playerId: string, nowMs: number) =>
  getPlayerStintSeconds(state, playerId, nowMs) / 60;
const total = (state: LiveMatchState, playerId: string, nowMs: number) =>
  getPlayerAccumulatedSeconds(state, playerId, nowMs) / 60;

// ─── getPlayerStintSeconds ────────────────────────────────────────────────────

describe("getPlayerStintSeconds", () => {
  it("is zero before kickoff", () => {
    const state = createLiveMatchFromSetup(makeSetup());
    expect(getPlayerStintSeconds(state, "p1", at(5))).toBe(0);
  });

  it("matches total playing time for a starter who has not rested", () => {
    const state = kickedOff();
    expect(stint(state, "p1", at(7))).toBe(7);
    expect(total(state, "p1", at(7))).toBe(7);
  });

  it("is zero for bench players", () => {
    const state = kickedOff();
    expect(getPlayerStintSeconds(state, "p6", at(7))).toBe(0);
  });

  it("does not count a pause during the half", () => {
    let state = kickedOff();
    state = pauseLiveMatch(state, at(3));
    // Frozen while paused.
    expect(stint(state, "p1", at(4))).toBe(3);
    state = resumeLiveMatch(state, at(5));
    expect(stint(state, "p1", at(6))).toBe(4);
  });

  it("ends the stint when the player is substituted off", () => {
    let state = kickedOff();
    state = substitutePlayers(state, "p2", "p6", at(6));
    expect(getPlayerStintSeconds(state, "p2", at(9))).toBe(0);
    expect(total(state, "p2", at(9))).toBe(6);
  });

  it("starts a substitute's stint when they come on", () => {
    let state = kickedOff();
    state = substitutePlayers(state, "p2", "p6", at(6));
    expect(stint(state, "p6", at(9))).toBe(3);
    expect(total(state, "p6", at(9))).toBe(3);
  });

  it("starts a new stint on each return, while total keeps every stint", () => {
    let state = kickedOff();
    state = substitutePlayers(state, "p2", "p6", at(4)); // p2 played 0–4
    state = substitutePlayers(state, "p6", "p2", at(8)); // p2 rests 4–8
    expect(stint(state, "p2", at(11))).toBe(3);
    expect(total(state, "p2", at(11))).toBe(7);
  });

  it("counts a stint from a bench player placed in an empty slot", () => {
    let state = kickedOff();
    state = removePlayerFromField(state, "5v5-3", at(2));
    state = moveBenchPlayerToSlot(state, "5v5-3", "p3", at(5));
    expect(stint(state, "p3", at(8))).toBe(3);
    expect(total(state, "p3", at(8))).toBe(5);
  });

  it("starts the stint at the moment of a substitution made while paused", () => {
    let state = kickedOff();
    state = pauseLiveMatch(state, at(6));
    state = substitutePlayers(state, "p2", "p6", at(7));
    state = resumeLiveMatch(state, at(9));
    // 6 clock minutes before the pause; 2 more after resuming.
    expect(stint(state, "p6", at(11))).toBe(2);
    expect(total(state, "p2", at(11))).toBe(6);
  });

  it("is zero for everyone during the half-time break", () => {
    let state = kickedOff();
    state = endCurrentHalf(state, at(15));
    expect(state.phase).toBe("half_time");
    expect(getPlayerStintSeconds(state, "p1", at(20))).toBe(0);
    expect(total(state, "p1", at(20))).toBe(15);
  });

  it("restarts at the second-half kickoff, excluding the break", () => {
    let state = kickedOff();
    state = endCurrentHalf(state, at(16)); // one minute of stoppage
    state = startLiveMatch(state, at(26)); // ten-minute break
    expect(state.phase).toBe("second_half");
    expect(stint(state, "p1", at(30))).toBe(4);
    expect(total(state, "p1", at(30))).toBe(20);
  });

  it("restarts at the second-half kickoff when the clock is resumed instead", () => {
    let state = kickedOff();
    state = endCurrentHalf(state, at(15));
    state = resumeLiveMatch(state, at(25));
    expect(stint(state, "p1", at(27))).toBe(2);
  });

  it("counts a half-time substitute from the second-half kickoff", () => {
    let state = kickedOff();
    state = endCurrentHalf(state, at(15));
    state = substitutePlayers(state, "p2", "p6", at(18));
    state = startLiveMatch(state, at(25));
    expect(stint(state, "p6", at(30))).toBe(5);
    expect(total(state, "p6", at(30))).toBe(5);
    expect(getPlayerStintSeconds(state, "p2", at(30))).toBe(0);
  });

  it("tracks substitutions and pauses in the second half", () => {
    let state = kickedOff();
    state = substitutePlayers(state, "p2", "p6", at(10)); // p6 on at 10
    state = endCurrentHalf(state, at(15));
    state = startLiveMatch(state, at(25)); // second half: clock 15
    state = substitutePlayers(state, "p6", "p7", at(29)); // clock 19
    state = pauseLiveMatch(state, at(30)); // clock 20
    state = substitutePlayers(state, "p7", "p6", at(31)); // clock 20, p6 back on
    state = resumeLiveMatch(state, at(33));
    // Clock 23 at at(36).
    expect(stint(state, "p6", at(36))).toBe(3);
    expect(total(state, "p6", at(36))).toBe(5 + 4 + 3);
    expect(getPlayerStintSeconds(state, "p7", at(36))).toBe(0);
    expect(total(state, "p7", at(36))).toBe(1);
  });

  it("freezes at full time", () => {
    let state = kickedOff();
    state = endCurrentHalf(state, at(15));
    state = startLiveMatch(state, at(25));
    state = endCurrentHalf(state, at(40)); // second half ends → full time
    expect(state.phase).toBe("full_time");
    expect(stint(state, "p1", at(50))).toBe(15);
  });

  it("covers the whole match in a single-half format", () => {
    const setup = makeSetup({
      duration: { mode: "custom", presetId: null, halves: 1, minutesPerHalf: 20, totalMinutes: 20 },
    });
    const state = startLiveMatch(createLiveMatchFromSetup(setup), T0);
    expect(stint(state, "p1", at(18))).toBe(18);
  });

  it("never exceeds total playing time", () => {
    let state = kickedOff();
    state = substitutePlayers(state, "p1", "p6", at(5));
    state = substitutePlayers(state, "p6", "p1", at(7));
    state = endCurrentHalf(state, at(15));
    state = startLiveMatch(state, at(20));
    for (const minute of [7, 12, 15, 20, 24]) {
      for (const playerId of ["p1", "p2", "p6"]) {
        expect(getPlayerStintSeconds(state, playerId, at(minute))).toBeLessThanOrEqual(
          getPlayerAccumulatedSeconds(state, playerId, at(minute))
        );
      }
    }
  });
});
