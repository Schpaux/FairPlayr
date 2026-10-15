import { describe, expect, it } from "vitest";
import {
  createLiveMatchFromSetup,
  endCurrentHalf,
  endLiveMatch,
  getElapsedMs,
  getPlayerAccumulatedSeconds,
  pauseLiveMatch,
  resumeLiveMatch,
  startLiveMatch,
  updateScore,
  type LiveMatchState,
} from "@/domain/liveMatch";
import { getPlayerStintSeconds } from "@/domain/playerStint";
import { getFormationPresets } from "@/domain/match";
import { createGoalEvent, createSubstitutionEvent, type SubstitutionMatchEvent } from "@/domain/matchEvent";
import { swapLivePositions } from "@/domain/positionSwap";
import {
  applySubstitution,
  canUndoSubstitution,
  undoSubstitution,
  type SubstitutionRecord,
} from "@/domain/substitutionUndo";

const T0 = 1_000_000;
const SEC = 1_000;
const MIN = 60_000;

/** A 7v7 match (2×20) with p1–p7 starting and p8, p9 on the bench, not kicked off. */
function newMatch(): LiveMatchState {
  const formation = getFormationPresets("7v7")[0];
  const ids = Array.from({ length: 9 }, (_, index) => `p${index + 1}`);
  const starters = ids.slice(0, 7);
  return createLiveMatchFromSetup({
    id: "setup-1",
    teamId: "team-1",
    format: "7v7",
    reportEnabled: false,
    formationId: formation.id,
    duration: { mode: "preset", presetId: "2x20", halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
    selectedPlayerIds: ids,
    startingPlayerIds: starters,
    slotAssignments: Object.fromEntries(formation.slots.map((slot, index) => [slot.id, starters[index]])),
    createdAt: "2026-10-15T10:00:00.000Z",
    updatedAt: "2026-10-15T10:00:00.000Z",
  });
}

function subEvent(outPlayerId: string, inPlayerId: string): SubstitutionMatchEvent {
  return createSubstitutionEvent({ minute: 7, timestampMs: 7 * MIN, inPlayerId, outPlayerId });
}

/** Apply a substitution that must be valid. */
function sub(state: LiveMatchState, outId: string, inId: string, nowMs: number) {
  const applied = applySubstitution(state, outId, inId, nowMs, subEvent(outId, inId));
  if (!applied) throw new Error("expected a valid substitution");
  return applied;
}

function minutesOf(state: LiveMatchState, playerId: string, nowMs: number): number {
  return getPlayerAccumulatedSeconds(state, playerId, nowMs) / 60;
}

/** The lineup and playing-time fields a substitution and its undo touch. */
function lineup(state: LiveMatchState) {
  return {
    onFieldPlayerIds: state.onFieldPlayerIds,
    benchPlayerIds: state.benchPlayerIds,
    liveSlotAssignments: state.liveSlotAssignments,
    playerAccumulatedMs: state.playerAccumulatedMs,
    onFieldStartedAtElapsedMs: state.onFieldStartedAtElapsedMs,
  };
}

const KICKOFF = T0;
const SUB_AT = T0 + 7 * MIN;

function runningAtSeven(): LiveMatchState {
  return startLiveMatch(newMatch(), KICKOFF);
}

describe("applySubstitution", () => {
  it("substitutes, appends the event and records both players before and after", () => {
    const before = runningAtSeven();
    const { state, record } = sub(before, "p2", "p8", SUB_AT);

    expect(state.onFieldPlayerIds).toContain("p8");
    expect(state.benchPlayerIds).toContain("p2");
    expect(state.events.at(-1)?.id).toBe(record.eventId);
    expect(record).toMatchObject({
      outPlayerId: "p2",
      inPlayerId: "p8",
      before: { out: { accumulatedMs: 0, startedAtElapsedMs: 0 }, in: { accumulatedMs: 0, startedAtElapsedMs: null } },
      after: { out: { accumulatedMs: 7 * MIN, startedAtElapsedMs: null }, in: { accumulatedMs: 0, startedAtElapsedMs: 7 * MIN } },
    });
    expect(record.slotId).not.toBeNull();
    expect(state.liveSlotAssignments[record.slotId!]).toBe("p8");
  });

  it("returns null and changes nothing for an invalid pair or an ended match", () => {
    const state = runningAtSeven();
    expect(applySubstitution(state, "p8", "p9", SUB_AT, subEvent("p8", "p9"))).toBeNull();
    expect(applySubstitution(state, "p1", "p2", SUB_AT, subEvent("p1", "p2"))).toBeNull();
    expect(applySubstitution(state, "p2", "p2", SUB_AT, subEvent("p2", "p2"))).toBeNull();
    const ended = endLiveMatch(state, SUB_AT);
    expect(applySubstitution(ended, "p2", "p8", SUB_AT, subEvent("p2", "p8"))).toBeNull();
  });
});

describe("undoSubstitution", () => {
  it("1. undo with nothing in between restores the lineup, minutes and events", () => {
    const before = runningAtSeven();
    const { state, record } = sub(before, "p2", "p8", SUB_AT);
    const undone = undoSubstitution(state, record);

    expect(lineup(undone)).toEqual(lineup(before));
    expect(undone.events).toEqual(before.events);
    expect(undone.clock).toEqual(before.clock);
    expect(minutesOf(undone, "p2", SUB_AT)).toBe(7);
    expect(minutesOf(undone, "p8", SUB_AT)).toBe(0);
  });

  it("2. a goal recorded inside the window survives with its score and attribution", () => {
    const { state, record } = sub(runningAtSeven(), "p2", "p8", SUB_AT);
    const goal = createGoalEvent({ minute: 7, timestampMs: 7 * MIN, teamSide: "own", scorerPlayerId: "p3" });
    const withGoal = { ...updateScore(state, "team", 1), events: [...state.events, goal] };

    const undone = undoSubstitution(withGoal, record);

    expect(undone.teamScore).toBe(1);
    expect(undone.opponentScore).toBe(0);
    expect(undone.events).toEqual(withGoal.events.filter((event) => event.id !== record.eventId));
    expect(undone.events).toContainEqual(goal);
    expect(undone.events.some((event) => event.type === "substitution")).toBe(false);
  });

  it("3. time that runs inside the window counts for the outgoing player only", () => {
    const { state, record } = sub(runningAtSeven(), "p2", "p8", SUB_AT);
    const undoAt = SUB_AT + 4 * SEC;
    const undone = undoSubstitution(state, record);

    // As if the substitution never happened: p2 played on, p8 never came on.
    expect(getPlayerAccumulatedSeconds(undone, "p2", undoAt)).toBe(7 * 60 + 4);
    expect(getPlayerAccumulatedSeconds(undone, "p8", undoAt)).toBe(0);
    expect(getPlayerStintSeconds(undone, "p2", undoAt)).toBe(7 * 60 + 4);
    expect(getPlayerStintSeconds(undone, "p8", undoAt)).toBe(0);

    // Total minutes on the pitch are neither lost nor doubled.
    const total = undone.onFieldPlayerIds
      .concat(undone.benchPlayerIds)
      .reduce((sum, id) => sum + getPlayerAccumulatedSeconds(undone, id, undoAt), 0);
    expect(total).toBe(7 * (7 * 60 + 4));

    // And the clock keeps counting for p2 afterwards.
    expect(minutesOf(undone, "p2", T0 + 10 * MIN)).toBe(10);
  });

  it("4. a pause inside the window stays paused and adds no time", () => {
    const { state, record } = sub(runningAtSeven(), "p2", "p8", SUB_AT);
    const paused = pauseLiveMatch(state, SUB_AT + 2 * SEC);

    const undone = undoSubstitution(paused, record);

    expect(undone.status).toBe("paused");
    expect(undone.clock).toEqual(paused.clock);
    expect(getPlayerAccumulatedSeconds(undone, "p2", SUB_AT + 10 * MIN)).toBe(7 * 60 + 2);
    expect(getPlayerAccumulatedSeconds(undone, "p8", SUB_AT + 10 * MIN)).toBe(0);

    // Resuming later counts only running time.
    const resumed = resumeLiveMatch(undone, SUB_AT + 10 * MIN);
    expect(getPlayerAccumulatedSeconds(resumed, "p2", SUB_AT + 11 * MIN)).toBe(8 * 60 + 2);
  });

  it("5. half-time inside the window survives, and the ring still resets for the second half", () => {
    const halfAt = T0 + 20 * MIN;
    const { state, record } = sub(startLiveMatch(newMatch(), T0), "p2", "p8", halfAt - 2 * SEC);
    const halfTime = endCurrentHalf(state, halfAt);

    const undone = undoSubstitution(halfTime, record);

    expect(undone.phase).toBe("half_time");
    expect(undone.status).toBe("paused");
    expect(undone.phaseStartedAtElapsedMs).toBe(halfTime.phaseStartedAtElapsedMs);
    expect(undone.clock).toEqual(halfTime.clock);
    expect(minutesOf(undone, "p2", halfAt + 5 * MIN)).toBe(20);
    expect(getPlayerStintSeconds(undone, "p2", halfAt + 5 * MIN)).toBe(0);

    const secondHalf = startLiveMatch(undone, halfAt + 10 * MIN);
    expect(secondHalf.phase).toBe("second_half");
    expect(getPlayerStintSeconds(secondHalf, "p2", halfAt + 13 * MIN)).toBe(3 * 60);
    expect(minutesOf(secondHalf, "p2", halfAt + 13 * MIN)).toBe(23);
  });

  it("5b. second-half kickoff inside the window keeps the phase and the ring reset", () => {
    const halfAt = T0 + 20 * MIN;
    const halfTime = endCurrentHalf(startLiveMatch(newMatch(), T0), halfAt);
    const { state, record } = sub(halfTime, "p2", "p8", halfAt + 5 * MIN);
    const kickoff = startLiveMatch(state, halfAt + 5 * MIN + 2 * SEC);

    const undone = undoSubstitution(kickoff, record);

    expect(undone.phase).toBe("second_half");
    expect(undone.status).toBe("running");
    const later = halfAt + 5 * MIN + 2 * SEC + MIN;
    expect(minutesOf(undone, "p2", later)).toBe(21);
    expect(getPlayerStintSeconds(undone, "p2", later)).toBe(60);
    expect(minutesOf(undone, "p8", later)).toBe(0);
  });

  it("6. a position swap made after the substitution is kept", () => {
    const before = runningAtSeven();
    const { state, record } = sub(before, "p2", "p8", SUB_AT);
    const p3Slot = Object.keys(state.liveSlotAssignments).find((slotId) => state.liveSlotAssignments[slotId] === "p3")!;
    const swapped = swapLivePositions(state, record.slotId!, p3Slot);
    expect(swapped.liveSlotAssignments[p3Slot]).toBe("p8");

    const undone = undoSubstitution(swapped, record);

    // p2 takes the place p8 holds now; p3 stays where the coach moved them.
    expect(undone.liveSlotAssignments[record.slotId!]).toBe("p3");
    expect(undone.liveSlotAssignments[p3Slot]).toBe("p2");
    expect(undone.onFieldPlayerIds).toEqual(before.onFieldPlayerIds);
    expect(undone.benchPlayerIds).toEqual(before.benchPlayerIds);
  });

  it("7. removes only its own substitution event, never an earlier one or a goal", () => {
    const first = sub(runningAtSeven(), "p2", "p8", SUB_AT);
    const goal = createGoalEvent({ minute: 8, timestampMs: 8 * MIN, teamSide: "opponent" });
    const withGoal = { ...first.state, events: [...first.state.events, goal] };
    const second = sub(withGoal, "p3", "p9", SUB_AT + 2 * MIN);

    const undone = undoSubstitution(second.state, second.record);

    expect(undone.events.map((event) => event.id)).toEqual(
      second.state.events.filter((event) => event.id !== second.record.eventId).map((event) => event.id)
    );
    expect(undone.events.map((event) => event.id)).toContain(first.record.eventId);
    expect(undone.events).toContainEqual(goal);
    // The earlier substitution itself still stands.
    expect(undone.onFieldPlayerIds).toContain("p8");
    expect(undone.benchPlayerIds).toContain("p2");
  });

  it("works before kickoff and while paused", () => {
    const notStarted = newMatch();
    const a = sub(notStarted, "p2", "p8", T0);
    expect(lineup(undoSubstitution(a.state, a.record))).toEqual(lineup(notStarted));

    const paused = pauseLiveMatch(runningAtSeven(), SUB_AT);
    const b = sub(paused, "p2", "p8", SUB_AT + MIN);
    const undone = undoSubstitution(b.state, b.record);
    expect(lineup(undone)).toEqual(lineup(paused));
    expect(minutesOf(undone, "p2", SUB_AT + 5 * MIN)).toBe(7);
  });

  it("12. a normal substitution after an undo works and can itself be undone", () => {
    const before = runningAtSeven();
    const first = sub(before, "p2", "p8", SUB_AT);
    const undone = undoSubstitution(first.state, first.record);

    const again = sub(undone, "p2", "p9", SUB_AT + MIN);
    expect(again.state.onFieldPlayerIds).toContain("p9");
    expect(minutesOf(again.state, "p2", SUB_AT + 3 * MIN)).toBe(8);

    expect(lineup(undoSubstitution(again.state, again.record))).toEqual(lineup(undone));
  });

  describe("14. rejects conflicting state (same reference, nothing changed)", () => {
    it("after the undo has already been applied", () => {
      const { state, record } = sub(runningAtSeven(), "p2", "p8", SUB_AT);
      const undone = undoSubstitution(state, record);
      expect(undoSubstitution(undone, record)).toBe(undone);
    });

    it("when the incoming player has been substituted off again", () => {
      const first = sub(runningAtSeven(), "p2", "p8", SUB_AT);
      const second = sub(first.state, "p8", "p9", SUB_AT + 2 * SEC);
      expect(canUndoSubstitution(second.state, first.record)).toBe(false);
      expect(undoSubstitution(second.state, first.record)).toBe(second.state);
    });

    it("when the outgoing player has come back on", () => {
      const first = sub(runningAtSeven(), "p2", "p8", SUB_AT);
      const second = sub(first.state, "p3", "p2", SUB_AT + 2 * SEC);
      expect(undoSubstitution(second.state, first.record)).toBe(second.state);
    });

    it("after the match has ended", () => {
      const { state, record } = sub(runningAtSeven(), "p2", "p8", SUB_AT);
      const ended = endLiveMatch(state, SUB_AT + 2 * SEC);
      expect(undoSubstitution(ended, record)).toBe(ended);
    });

    it("when either player's minutes no longer match the record", () => {
      const { state, record } = sub(runningAtSeven(), "p2", "p8", SUB_AT);
      const tampered: SubstitutionRecord = { ...record, after: { ...record.after, in: { accumulatedMs: 0, startedAtElapsedMs: 0 } } };
      expect(undoSubstitution(state, tampered)).toBe(state);
    });
  });

  it("never produces negative or duplicated minutes at any undo moment", () => {
    for (const offsetMs of [0, 1, 999, 2_500, 4_999]) {
      const { state, record } = sub(runningAtSeven(), "p2", "p8", SUB_AT);
      const undone = undoSubstitution(state, record);
      const at = SUB_AT + offsetMs;
      const elapsed = getElapsedMs(undone, at);
      for (const id of [...undone.onFieldPlayerIds, ...undone.benchPlayerIds]) {
        expect(getPlayerAccumulatedSeconds(undone, id, at)).toBeGreaterThanOrEqual(0);
        expect(getPlayerAccumulatedSeconds(undone, id, at)).toBeLessThanOrEqual(Math.floor(elapsed / 1000));
      }
    }
  });
});
