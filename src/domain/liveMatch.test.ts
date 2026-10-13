import { describe, expect, it } from "vitest";
import {
  createLiveMatchFromSetup,
  moveBenchPlayerToSlot,
  removePlayerFromField,
  repositionLivePlayers,
  substitutePlayers,
  type LiveMatchState,
} from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";

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
