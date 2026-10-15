import { describe, expect, it } from "vitest";
import {
  createLiveMatchFromSetup,
  getPlayerAccumulatedSeconds,
  startLiveMatch,
  substitutePlayers,
  type LiveMatchState,
} from "@/domain/liveMatch";
import { getPlayerStintSeconds } from "@/domain/playerStint";
import { ALL_FORMATS, FORMAT_FIELD_COUNT, getFormationPresets, type MatchFormat } from "@/domain/match";
import { createGoalEvent } from "@/domain/matchEvent";
import {
  canSwapLivePositions,
  describeLivePositionSwap,
  findLiveSlotOf,
  swapLivePositions,
  undoLivePositionSwap,
} from "@/domain/positionSwap";

const T0 = 1_000_000;
const MIN = 60_000;

/** A running match in `format` with two bench players, 7 minutes in. */
function runningMatch(format: MatchFormat = "7v7"): { state: LiveMatchState; now: number } {
  const formation = getFormationPresets(format)[0];
  const field = FORMAT_FIELD_COUNT[format];
  const ids = Array.from({ length: field + 2 }, (_, index) => `p${index + 1}`);
  const starters = ids.slice(0, field);
  const state = createLiveMatchFromSetup({
    id: `setup-${format}`,
    teamId: "team-1",
    format,
    reportEnabled: false,
    formationId: formation.id,
    duration: { mode: "preset", presetId: "2x20", halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
    selectedPlayerIds: ids,
    startingPlayerIds: starters,
    slotAssignments: Object.fromEntries(formation.slots.map((slot, index) => [slot.id, starters[index]])),
    createdAt: "2026-10-15T10:00:00.000Z",
    updatedAt: "2026-10-15T10:00:00.000Z",
  });
  return { state: startLiveMatch(state, T0), now: T0 + 7 * MIN };
}

function slotIds(state: LiveMatchState): string[] {
  return getFormationPresets(state.format).find((preset) => preset.id === state.formationId)!.slots.map((slot) => slot.id);
}

/** Everything a position swap must leave alone. */
function invariants(state: LiveMatchState, now: number) {
  return {
    onFieldPlayerIds: state.onFieldPlayerIds,
    benchPlayerIds: state.benchPlayerIds,
    playerAccumulatedMs: state.playerAccumulatedMs,
    onFieldStartedAtElapsedMs: state.onFieldStartedAtElapsedMs,
    events: state.events,
    teamScore: state.teamScore,
    opponentScore: state.opponentScore,
    status: state.status,
    phase: state.phase,
    clock: state.clock,
    seconds: state.onFieldPlayerIds.map((id) => getPlayerAccumulatedSeconds(state, id, now)),
    stint: state.onFieldPlayerIds.map((id) => getPlayerStintSeconds(state, id, now)),
  };
}

describe("swapLivePositions", () => {
  it("exchanges two field players' slots", () => {
    const { state } = runningMatch();
    const [, a, b] = slotIds(state);
    const next = swapLivePositions(state, a, b);
    expect(next.liveSlotAssignments[a]).toBe(state.liveSlotAssignments[b]);
    expect(next.liveSlotAssignments[b]).toBe(state.liveSlotAssignments[a]);
  });

  it("keeps players, minutes, the current stint, events, score and clock unchanged", () => {
    const { state, now } = runningMatch();
    const withGoal = { ...state, teamScore: 1, events: [createGoalEvent({ teamSide: "own", minute: 3 })] };
    const [, a, , , b] = slotIds(withGoal);
    const next = swapLivePositions(withGoal, a, b);
    expect(invariants(next, now)).toEqual(invariants(withGoal, now));
    // A position swap is never a substitution.
    expect(next.events.some((event) => event.type === "substitution")).toBe(false);
  });

  it.each(ALL_FORMATS)("works in %s, including the first (keeper) slot", (format) => {
    const { state, now } = runningMatch(format);
    const slots = slotIds(state);
    const keeperSlot = slots[0];
    const last = slots[slots.length - 1];
    const keeper = state.liveSlotAssignments[keeperSlot];
    const outfield = state.liveSlotAssignments[last];

    const next = swapLivePositions(state, last, keeperSlot);
    expect(next.liveSlotAssignments[keeperSlot]).toBe(outfield);
    expect(next.liveSlotAssignments[last]).toBe(keeper);
    expect(invariants(next, now)).toEqual(invariants(state, now));
  });

  it("is a no-op (same reference) for the same slot, unknown slots, empty slots and bench players", () => {
    const { state } = runningMatch("7v7");
    const [a, b] = slotIds(state);
    expect(swapLivePositions(state, a, a)).toBe(state);
    // A slot id from another format is not part of this formation.
    expect(swapLivePositions(state, a, "9v9-9")).toBe(state);
    expect(swapLivePositions(state, "nope", b)).toBe(state);

    const withEmpty = { ...state, liveSlotAssignments: { ...state.liveSlotAssignments, [b]: null } };
    expect(swapLivePositions(withEmpty, a, b)).toBe(withEmpty);

    // A slot that still names a player who is no longer on the field.
    const stale = { ...state, liveSlotAssignments: { ...state.liveSlotAssignments, [b]: "p8" } };
    expect(swapLivePositions(stale, a, b)).toBe(stale);
  });

  it("follows a substitution: the incoming player can swap from the slot they took", () => {
    const { state, now } = runningMatch("7v7");
    const slots = slotIds(state);
    const subbed = substitutePlayers(state, state.liveSlotAssignments[slots[3]]!, "p8", now);
    const next = swapLivePositions(subbed, slots[3], slots[1]);
    expect(next.liveSlotAssignments[slots[1]]).toBe("p8");
    expect(invariants(next, now + MIN)).toEqual(invariants(subbed, now + MIN));
  });
});

describe("describeLivePositionSwap / canSwapLivePositions", () => {
  it("names both players in their original slots", () => {
    const { state } = runningMatch();
    const [a, b] = slotIds(state);
    expect(describeLivePositionSwap(state, a, b)).toEqual({
      fromSlotId: a,
      toSlotId: b,
      fromPlayerId: state.liveSlotAssignments[a],
      toPlayerId: state.liveSlotAssignments[b],
    });
    expect(canSwapLivePositions(state, a, b)).toBe(true);
    expect(canSwapLivePositions(state, a, a)).toBe(false);
    expect(describeLivePositionSwap(state, a, "9v9-9")).toBeNull();
  });
});

describe("undoLivePositionSwap", () => {
  it("restores the two slots and nothing else", () => {
    const { state, now } = runningMatch();
    const [, a, b] = slotIds(state);
    const swap = describeLivePositionSwap(state, a, b)!;
    const swapped = swapLivePositions(state, a, b);

    // Unrelated changes made after the swap (a goal) survive the undo.
    const later = {
      ...swapped,
      teamScore: 1,
      events: [...swapped.events, createGoalEvent({ teamSide: "own", minute: 7 })],
    };
    const undone = undoLivePositionSwap(later, swap);
    expect(undone.liveSlotAssignments).toEqual(state.liveSlotAssignments);
    expect(undone.teamScore).toBe(1);
    expect(undone.events).toEqual(later.events);
    expect(invariants(undone, now)).toEqual(invariants(later, now));
  });

  it("does nothing once the slots no longer hold the swapped pair", () => {
    const { state, now } = runningMatch();
    const [, a, b] = slotIds(state);
    const swap = describeLivePositionSwap(state, a, b)!;
    // Undoing without the swap having happened.
    expect(undoLivePositionSwap(state, swap)).toBe(state);
    // The player now in slot a was substituted off since.
    const swapped = swapLivePositions(state, a, b);
    const subbed = substitutePlayers(swapped, swapped.liveSlotAssignments[a]!, "p8", now);
    expect(undoLivePositionSwap(subbed, swap)).toBe(subbed);
  });
});

describe("findLiveSlotOf", () => {
  it("finds an on-field player's formation slot and nothing for bench or unknown players", () => {
    const { state } = runningMatch("7v7");
    const [, second] = slotIds(state);
    expect(findLiveSlotOf(state, state.liveSlotAssignments[second]!)).toBe(second);
    expect(findLiveSlotOf(state, "p8")).toBeNull();
    expect(findLiveSlotOf(state, "nobody")).toBeNull();
    const swapped = swapLivePositions(state, slotIds(state)[0], second);
    expect(findLiveSlotOf(swapped, state.liveSlotAssignments[second]!)).toBe(slotIds(state)[0]);
  });
});
