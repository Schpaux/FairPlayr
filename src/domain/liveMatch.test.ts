import { describe, expect, it } from "vitest";
import {
  createLiveMatchFromSetup,
  endCurrentHalf,
  getCurrentHalfNumber,
  getElapsedSeconds,
  getPhaseElapsedSeconds,
  getPhaseStoppageElapsedSeconds,
  getPlayerAccumulatedSeconds,
  moveBenchPlayerToSlot,
  pauseLiveMatch,
  recoverSecondHalfPhase,
  removePlayerFromField,
  repositionLivePlayers,
  resumeLiveMatch,
  startLiveMatch,
  substitutePlayers,
  type LiveMatchState,
} from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import { createSubstitutionEvent } from "@/domain/matchEvent";

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

function makeLiveMatch(): LiveMatchState {
  return createLiveMatchFromSetup(makeSetup());
}

const NOW = 1000000;

// ─── createLiveMatchFromSetup ─────────────────────────────────────────────────

describe("createLiveMatchFromSetup", () => {
  it("copies format and formationId from setup", () => {
    const state = makeLiveMatch();
    expect(state.format).toBe("5v5");
    expect(state.formationId).toBe("5v5-2-2");
  });

  it("copies slotAssignments as liveSlotAssignments", () => {
    const state = makeLiveMatch();
    expect(state.liveSlotAssignments["5v5-1"]).toBe("p1");
    expect(state.liveSlotAssignments["5v5-2"]).toBe("p2");
    expect(state.liveSlotAssignments["5v5-5"]).toBe("p5");
  });

  it("initialOnFieldPlayerIds is immutable reference to startingPlayerIds", () => {
    const setup = makeSetup();
    const state = createLiveMatchFromSetup(setup);
    expect(state.initialOnFieldPlayerIds).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    // Bench players are the remainder
    expect(state.benchPlayerIds).toEqual(["p6", "p7"]);
  });
});

// ─── repositionLivePlayers ────────────────────────────────────────────────────

describe("repositionLivePlayers", () => {
  it("swaps slot assignments between two field slots", () => {
    const state = makeLiveMatch();
    const next = repositionLivePlayers(state, "5v5-1", "5v5-2");
    expect(next.liveSlotAssignments["5v5-1"]).toBe("p2");
    expect(next.liveSlotAssignments["5v5-2"]).toBe("p1");
  });

  it("does not change onFieldPlayerIds", () => {
    const state = makeLiveMatch();
    const next = repositionLivePlayers(state, "5v5-1", "5v5-2");
    expect(next.onFieldPlayerIds).toEqual(state.onFieldPlayerIds);
  });

  it("does not change benchPlayerIds", () => {
    const state = makeLiveMatch();
    const next = repositionLivePlayers(state, "5v5-1", "5v5-3");
    expect(next.benchPlayerIds).toEqual(state.benchPlayerIds);
  });

  it("is a no-op when slotAId === slotBId", () => {
    const state = makeLiveMatch();
    const next = repositionLivePlayers(state, "5v5-1", "5v5-1");
    expect(next).toBe(state);
  });

  it("works when one slot is empty", () => {
    const state = makeLiveMatch();
    // Clear slot 5v5-1 manually
    const withEmpty: LiveMatchState = {
      ...state,
      liveSlotAssignments: { ...state.liveSlotAssignments, "5v5-1": null },
    };
    const next = repositionLivePlayers(withEmpty, "5v5-1", "5v5-2");
    expect(next.liveSlotAssignments["5v5-1"]).toBe("p2");
    expect(next.liveSlotAssignments["5v5-2"]).toBeNull();
  });
});

// ─── moveBenchPlayerToSlot ────────────────────────────────────────────────────

describe("moveBenchPlayerToSlot", () => {
  it("moves bench player to empty slot, updating field/bench lists and slot assignments", () => {
    const state: LiveMatchState = {
      ...makeLiveMatch(),
      // Clear one slot to simulate a gap
      liveSlotAssignments: { ...makeLiveMatch().liveSlotAssignments, "5v5-5": null },
      onFieldPlayerIds: ["p1", "p2", "p3", "p4"],
      benchPlayerIds: ["p5", "p6", "p7"],
    };

    const next = moveBenchPlayerToSlot(state, "5v5-5", "p6", NOW);

    expect(next.onFieldPlayerIds).toContain("p6");
    expect(next.benchPlayerIds).not.toContain("p6");
    expect(next.liveSlotAssignments["5v5-5"]).toBe("p6");
  });

  it("substitutes when slot is occupied: outgoing goes to bench, incoming to field", () => {
    const state = makeLiveMatch();
    // p6 is bench, p1 is in slot 5v5-1
    const next = moveBenchPlayerToSlot(state, "5v5-1", "p6", NOW);

    expect(next.onFieldPlayerIds).toContain("p6");
    expect(next.onFieldPlayerIds).not.toContain("p1");
    expect(next.benchPlayerIds).toContain("p1");
    expect(next.benchPlayerIds).not.toContain("p6");
    expect(next.liveSlotAssignments["5v5-1"]).toBe("p6");
  });

  it("is a no-op when player is not on bench", () => {
    const state = makeLiveMatch();
    // p1 is on field, not bench
    const next = moveBenchPlayerToSlot(state, "5v5-2", "p1", NOW);
    expect(next).toBe(state);
  });

  it("does not mutate initialOnFieldPlayerIds", () => {
    const state = makeLiveMatch();
    const initial = [...state.initialOnFieldPlayerIds];
    const next = moveBenchPlayerToSlot(state, "5v5-1", "p6", NOW);
    expect(next.initialOnFieldPlayerIds).toEqual(initial);
  });
});

// ─── removePlayerFromField ────────────────────────────────────────────────────

describe("removePlayerFromField", () => {
  it("moves field player to bench and clears their slot", () => {
    const state = makeLiveMatch();
    const next = removePlayerFromField(state, "5v5-1", NOW);

    expect(next.onFieldPlayerIds).not.toContain("p1");
    expect(next.benchPlayerIds).toContain("p1");
    expect(next.liveSlotAssignments["5v5-1"]).toBeNull();
  });

  it("is a no-op for an empty slot", () => {
    const state: LiveMatchState = {
      ...makeLiveMatch(),
      liveSlotAssignments: { ...makeLiveMatch().liveSlotAssignments, "5v5-1": null },
    };
    const next = removePlayerFromField(state, "5v5-1", NOW);
    expect(next).toBe(state);
  });

  it("does not mutate initialOnFieldPlayerIds", () => {
    const state = makeLiveMatch();
    const initial = [...state.initialOnFieldPlayerIds];
    const next = removePlayerFromField(state, "5v5-1", NOW);
    expect(next.initialOnFieldPlayerIds).toEqual(initial);
  });
});

// ─── substitutePlayers — slot sync ───────────────────────────────────────────

describe("substitutePlayers liveSlotAssignments sync", () => {
  it("updates the outgoing player slot to the incoming player", () => {
    const state = makeLiveMatch();
    // p1 is in slot 5v5-1, p6 is on bench
    const next = substitutePlayers(state, "p1", "p6", NOW);

    expect(next.liveSlotAssignments["5v5-1"]).toBe("p6");
  });

  it("does not create a substitution event (caller's responsibility)", () => {
    const state = makeLiveMatch();
    const next = substitutePlayers(state, "p1", "p6", NOW);
    // substitutePlayers itself doesn't create events
    expect(next.events.length).toBe(state.events.length);
  });

  it("does not change other slot assignments", () => {
    const state = makeLiveMatch();
    const next = substitutePlayers(state, "p1", "p6", NOW);
    expect(next.liveSlotAssignments["5v5-2"]).toBe("p2");
    expect(next.liveSlotAssignments["5v5-3"]).toBe("p3");
  });
});

// ─── State serialization round-trip ──────────────────────────────────────────

describe("state serialization", () => {
  it("liveSlotAssignments survives JSON round-trip", () => {
    const state = makeLiveMatch();
    const json = JSON.stringify(state);
    const restored = JSON.parse(json) as LiveMatchState;
    expect(restored.liveSlotAssignments).toEqual(state.liveSlotAssignments);
    expect(restored.format).toBe(state.format);
    expect(restored.formationId).toBe(state.formationId);
  });
});

// ─── Half transitions ────────────────────────────────────────────────────────

const MIN = 60_000;
const KICKOFF = 1_000_000;

/** Kick off at KICKOFF, play `firstHalfMinutes`, end the half. */
function toHalfTime(firstHalfMinutes = 15, state = makeLiveMatch()): LiveMatchState {
  const started = startLiveMatch(state, KICKOFF);
  return endCurrentHalf(started, KICKOFF + firstHalfMinutes * MIN);
}

function makeSinglePeriodMatch(): LiveMatchState {
  return createLiveMatchFromSetup(
    makeSetup({
      duration: { mode: "custom", presetId: null, halves: 1, minutesPerHalf: 20, totalMinutes: 20 },
    })
  );
}

describe("second-half transition", () => {
  it("first half → half-time → second half → full time", () => {
    const halfTime = toHalfTime(15);
    expect(halfTime.phase).toBe("half_time");
    expect(halfTime.status).toBe("paused");

    // Ten-minute break: the clock does not run.
    const secondHalfAt = KICKOFF + 25 * MIN;
    expect(getElapsedSeconds(halfTime, secondHalfAt)).toBe(15 * 60);

    const secondHalf = startLiveMatch(halfTime, secondHalfAt);
    expect(secondHalf.phase).toBe("second_half");
    expect(secondHalf.currentHalf).toBe(2);
    expect(getCurrentHalfNumber(secondHalf)).toBe(2);
    expect(secondHalf.status).toBe("running");
    expect(secondHalf.phaseStartedAtElapsedMs).toBe(15 * MIN);

    // The second-half clock counts from its own kickoff and runs past the
    // half length into stoppage against the half's length, not the match's.
    const late = secondHalfAt + 17 * MIN;
    expect(getElapsedSeconds(secondHalf, late)).toBe(32 * 60);
    expect(getPhaseElapsedSeconds(secondHalf, late)).toBe(17 * 60);
    expect(getPhaseStoppageElapsedSeconds(secondHalf, late)).toBe(2 * 60);
    expect(secondHalf.status).toBe("running");

    const fullTime = endCurrentHalf(secondHalf, late);
    expect(fullTime.status).toBe("ended");
    expect(fullTime.phase).toBe("full_time");
    expect(fullTime.currentHalf).toBe(2);
    expect(fullTime.clock.isRunning).toBe(false);
    expect(fullTime.events.filter((event) => event.type === "match_started")).toHaveLength(1);
    expect(fullTime.events.filter((event) => event.type === "match_ended")).toHaveLength(1);
    expect(getPlayerAccumulatedSeconds(fullTime, "p1", late + 5 * MIN)).toBe(32 * 60);
    expect(getPlayerAccumulatedSeconds(fullTime, "p6", late + 5 * MIN)).toBe(0);
  });

  it("resuming the clock at half-time starts the second half", () => {
    const halfTime = toHalfTime(15);
    const viaResume = resumeLiveMatch(halfTime, KICKOFF + 25 * MIN);
    const viaStart = startLiveMatch(halfTime, KICKOFF + 25 * MIN);

    expect(viaResume.phase).toBe("second_half");
    expect(viaResume.currentHalf).toBe(2);
    expect(viaResume.status).toBe("running");
    expect(viaResume.clock).toEqual(viaStart.clock);
    expect(viaResume.phaseStartedAtElapsedMs).toBe(viaStart.phaseStartedAtElapsedMs);
    expect(viaResume.events).toEqual(viaStart.events);
  });

  it("starts the second half after a half ended while paused", () => {
    const started = startLiveMatch(makeLiveMatch(), KICKOFF);
    const paused = pauseLiveMatch(started, KICKOFF + 14 * MIN);
    const halfTime = endCurrentHalf(paused, KICKOFF + 16 * MIN);
    expect(halfTime.phase).toBe("half_time");
    expect(halfTime.phaseStartedAtElapsedMs).toBe(14 * MIN);

    const secondHalf = resumeLiveMatch(halfTime, KICKOFF + 30 * MIN);
    expect(secondHalf.phase).toBe("second_half");
    expect(getElapsedSeconds(secondHalf, KICKOFF + 31 * MIN)).toBe(15 * 60);
    expect(getPhaseElapsedSeconds(secondHalf, KICKOFF + 31 * MIN)).toBe(60);
  });

  it("pauses and resumes within each half without changing phase or losing time", () => {
    const started = startLiveMatch(makeLiveMatch(), KICKOFF);
    const pausedFirst = pauseLiveMatch(started, KICKOFF + 5 * MIN);
    const resumedFirst = resumeLiveMatch(pausedFirst, KICKOFF + 8 * MIN);
    expect(resumedFirst.phase).toBe("first_half");
    expect(resumedFirst.currentHalf).toBe(1);
    expect(getElapsedSeconds(resumedFirst, KICKOFF + 10 * MIN)).toBe(7 * 60);

    // 15 played minutes after the three-minute pause.
    const halfTime = endCurrentHalf(resumedFirst, KICKOFF + 18 * MIN);
    const secondHalf = startLiveMatch(halfTime, KICKOFF + 30 * MIN);
    const pausedSecond = pauseLiveMatch(secondHalf, KICKOFF + 36 * MIN);
    expect(pausedSecond.phase).toBe("second_half");
    expect(pausedSecond.status).toBe("paused");

    const resumedSecond = resumeLiveMatch(pausedSecond, KICKOFF + 40 * MIN);
    expect(resumedSecond.phase).toBe("second_half");
    expect(resumedSecond.currentHalf).toBe(2);
    expect(resumedSecond.phaseStartedAtElapsedMs).toBe(15 * MIN);
    expect(getElapsedSeconds(resumedSecond, KICKOFF + 42 * MIN)).toBe(23 * 60);
    expect(getPhaseElapsedSeconds(resumedSecond, KICKOFF + 42 * MIN)).toBe(8 * 60);
    expect(getPlayerAccumulatedSeconds(resumedSecond, "p1", KICKOFF + 42 * MIN)).toBe(23 * 60);
  });

  it("keeps accumulated playing time and substitution history across half-time", () => {
    const started = startLiveMatch(makeLiveMatch(), KICKOFF);
    const subAt = KICKOFF + 6 * MIN;
    const substituted = substitutePlayers(started, "p2", "p6", subAt);
    const withEvent: LiveMatchState = {
      ...substituted,
      events: [
        ...substituted.events,
        createSubstitutionEvent({ minute: 6, timestampMs: 6 * MIN, inPlayerId: "p6", outPlayerId: "p2" }),
      ],
    };

    const halfTime = endCurrentHalf(withEvent, KICKOFF + 15 * MIN);
    const secondHalf = startLiveMatch(halfTime, KICKOFF + 25 * MIN);
    const at = KICKOFF + 35 * MIN; // 10 minutes into the second half

    expect(secondHalf.onFieldPlayerIds).toEqual(withEvent.onFieldPlayerIds);
    expect(secondHalf.benchPlayerIds).toEqual(withEvent.benchPlayerIds);
    expect(secondHalf.liveSlotAssignments).toEqual(withEvent.liveSlotAssignments);
    expect(secondHalf.events).toEqual(withEvent.events);
    expect(getPlayerAccumulatedSeconds(secondHalf, "p2", at)).toBe(6 * 60);
    expect(getPlayerAccumulatedSeconds(secondHalf, "p6", at)).toBe(19 * 60);
    expect(getPlayerAccumulatedSeconds(secondHalf, "p1", at)).toBe(25 * 60);
  });

  it("ending the match during the second half finishes it", () => {
    const secondHalf = startLiveMatch(toHalfTime(15), KICKOFF + 25 * MIN);
    const paused = pauseLiveMatch(secondHalf, KICKOFF + 30 * MIN);
    const ended = endCurrentHalf(paused, KICKOFF + 31 * MIN);

    expect(ended.status).toBe("ended");
    expect(ended.phase).toBe("full_time");
    expect(getElapsedSeconds(ended, KICKOFF + 60 * MIN)).toBe(20 * 60);
    expect(resumeLiveMatch(ended, KICKOFF + 61 * MIN)).toBe(ended);
    expect(startLiveMatch(ended, KICKOFF + 61 * MIN)).toBe(ended);
  });

  describe("single-period match", () => {
    it("never enters half-time and ends on the first end-of-period", () => {
      const started = startLiveMatch(makeSinglePeriodMatch(), KICKOFF);
      const paused = pauseLiveMatch(started, KICKOFF + 8 * MIN);
      const resumed = resumeLiveMatch(paused, KICKOFF + 10 * MIN);
      expect(resumed.phase).toBe("first_half");
      expect(resumed.currentHalf).toBe(1);

      const late = KICKOFF + 24 * MIN; // 22 played: 2 minutes of stoppage
      expect(getPhaseStoppageElapsedSeconds(resumed, late)).toBe(2 * 60);

      const ended = endCurrentHalf(resumed, late);
      expect(ended.status).toBe("ended");
      expect(ended.phase).toBe("full_time");
      expect(ended.currentHalf).toBe(1);
      expect(getPlayerAccumulatedSeconds(ended, "p1", late)).toBe(22 * 60);
    });
  });
});

describe("recoverSecondHalfPhase", () => {
  /** What earlier builds stored: the clock restarted, the phase left at half-time. */
  function stuckInHalfTime(): LiveMatchState {
    const halfTime = toHalfTime(15);
    return {
      ...halfTime,
      clock: { ...halfTime.clock, isRunning: true, pausedAtMs: null, accumulatedPausedMs: 10 * MIN },
      status: "running",
    };
  }

  it("moves a running match stuck in half-time into the second half", () => {
    const stuck = stuckInHalfTime();
    const recovered = recoverSecondHalfPhase(stuck);

    expect(recovered.phase).toBe("second_half");
    expect(recovered.currentHalf).toBe(2);
    expect(recovered.phaseStartedAtElapsedMs).toBe(15 * MIN);
    expect(recovered.clock).toEqual(stuck.clock);
    expect(recovered.playerAccumulatedMs).toEqual(stuck.playerAccumulatedMs);
    expect(getPhaseElapsedSeconds(recovered, KICKOFF + 30 * MIN)).toBe(5 * 60);
  });

  it("moves a match paused after second-half play into the second half", () => {
    const paused = pauseLiveMatch(stuckInHalfTime(), KICKOFF + 30 * MIN);
    expect(paused.phase).toBe("half_time");

    const recovered = recoverSecondHalfPhase(paused);
    expect(recovered.phase).toBe("second_half");
    expect(recovered.status).toBe("paused");

    const resumed = resumeLiveMatch(recovered, KICKOFF + 32 * MIN);
    expect(resumed.phase).toBe("second_half");
    expect(resumed.phaseStartedAtElapsedMs).toBe(15 * MIN);
  });

  it("leaves a genuine half-time break untouched", () => {
    const halfTime = toHalfTime(15);
    expect(recoverSecondHalfPhase(halfTime)).toBe(halfTime);

    const pausedThenEnded = endCurrentHalf(
      pauseLiveMatch(startLiveMatch(makeLiveMatch(), KICKOFF), KICKOFF + 14 * MIN),
      KICKOFF + 16 * MIN
    );
    expect(recoverSecondHalfPhase(pausedThenEnded)).toBe(pausedThenEnded);
  });

  it("leaves other phases untouched", () => {
    const firstHalf = startLiveMatch(makeLiveMatch(), KICKOFF);
    const secondHalf = startLiveMatch(toHalfTime(15), KICKOFF + 25 * MIN);
    const ended = endCurrentHalf(secondHalf, KICKOFF + 40 * MIN);
    const single = startLiveMatch(makeSinglePeriodMatch(), KICKOFF);

    for (const state of [makeLiveMatch(), firstHalf, secondHalf, ended, single]) {
      expect(recoverSecondHalfPhase(state)).toBe(state);
    }
  });
});
