import { describe, it, expect } from "vitest";
import {
  subInteractionReducer,
  INITIAL_SUB_STATE,
  getSelectedFieldPlayerId,
  isDragging,
  getDraggingBenchPlayerId,
  hasPendingUndo,
  getPendingSubstitution,
  getPendingPositionSwap,
  getPositionSwapSourceId,
  getDraggingFieldPlayerId,
  type SubInteractionState,
} from "@/domain/liveSubInteraction";
import type { SubstitutionRecord } from "@/domain/substitutionUndo";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function idle(): SubInteractionState {
  return { kind: "idle" };
}

function selected(playerId: string): SubInteractionState {
  return { kind: "fieldPlayerSelected", fieldPlayerId: playerId };
}

function dragging(benchPlayerId: string): SubInteractionState {
  return { kind: "draggingBenchPlayer", benchPlayerId };
}

function pendingUndo(substitution: SubstitutionRecord, expiresAtMs = Date.now() + 5000): SubInteractionState {
  return { kind: "pendingUndo", substitution, expiresAtMs };
}

// Minimal substitution record stub — enough for type correctness.
function makeRecord(eventId = "sub-1"): SubstitutionRecord {
  return { eventId } as unknown as SubstitutionRecord;
}

const dispatch = subInteractionReducer;

// ─── idle ─────────────────────────────────────────────────────────────────────

describe("from idle", () => {
  it("SELECT_FIELD_PLAYER → fieldPlayerSelected", () => {
    const next = dispatch(idle(), { type: "SELECT_FIELD_PLAYER", playerId: "p1" });
    expect(next).toEqual(selected("p1"));
  });

  it("CANCEL → idle (no-op)", () => {
    const next = dispatch(idle(), { type: "CANCEL" });
    expect(next).toEqual(idle());
  });

  it("START_BENCH_DRAG → draggingBenchPlayer", () => {
    const next = dispatch(idle(), { type: "START_BENCH_DRAG", benchPlayerId: "b1" });
    expect(next).toEqual(dragging("b1"));
  });

  it("CANCEL_DRAG → idle (no-op — already idle)", () => {
    const next = dispatch(idle(), { type: "CANCEL_DRAG" });
    expect(next).toEqual(idle());
  });

  it("UNDO_TRIGGERED → idle (no-op when no pending undo)", () => {
    const next = dispatch(idle(), { type: "UNDO_TRIGGERED" });
    expect(next).toEqual(idle());
  });

  it("UNDO_EXPIRED → idle (no-op when no pending undo)", () => {
    const next = dispatch(idle(), { type: "UNDO_EXPIRED" });
    expect(next).toEqual(idle());
  });
});

// ─── fieldPlayerSelected ──────────────────────────────────────────────────────

describe("from fieldPlayerSelected", () => {
  it("SELECT_FIELD_PLAYER same player → idle (deselect)", () => {
    const next = dispatch(selected("p1"), { type: "SELECT_FIELD_PLAYER", playerId: "p1" });
    expect(next).toEqual(idle());
  });

  it("SELECT_FIELD_PLAYER different player → fieldPlayerSelected (new)", () => {
    const next = dispatch(selected("p1"), { type: "SELECT_FIELD_PLAYER", playerId: "p2" });
    expect(next).toEqual(selected("p2"));
  });

  it("CANCEL → idle", () => {
    const next = dispatch(selected("p1"), { type: "CANCEL" });
    expect(next).toEqual(idle());
  });

  it("START_BENCH_DRAG → draggingBenchPlayer (drag takes over)", () => {
    const next = dispatch(selected("p1"), { type: "START_BENCH_DRAG", benchPlayerId: "b1" });
    expect(next).toEqual(dragging("b1"));
  });

  it("SWAP_COMMITTED → pendingUndo", () => {
    const substitution = makeRecord();
    const expiresAtMs = Date.now() + 5000;
    const next = dispatch(selected("p1"), { type: "SWAP_COMMITTED", substitution, expiresAtMs });
    expect(next).toEqual({ kind: "pendingUndo", substitution, expiresAtMs });
  });

  it("CANCEL_DRAG → no state change (not dragging)", () => {
    const state = selected("p1");
    const next = dispatch(state, { type: "CANCEL_DRAG" });
    expect(next).toBe(state); // referential equality — no new object
  });
});

// ─── draggingBenchPlayer ──────────────────────────────────────────────────────

describe("from draggingBenchPlayer", () => {
  it("CANCEL_DRAG → idle", () => {
    const next = dispatch(dragging("b1"), { type: "CANCEL_DRAG" });
    expect(next).toEqual(idle());
  });

  it("SWAP_COMMITTED → pendingUndo", () => {
    const substitution = makeRecord();
    const expiresAtMs = Date.now() + 5000;
    const next = dispatch(dragging("b1"), { type: "SWAP_COMMITTED", substitution, expiresAtMs });
    expect(next).toEqual({ kind: "pendingUndo", substitution, expiresAtMs });
  });

  it("CANCEL → idle", () => {
    const next = dispatch(dragging("b1"), { type: "CANCEL" });
    expect(next).toEqual(idle());
  });

  it("SELECT_FIELD_PLAYER → fieldPlayerSelected (replaces drag)", () => {
    const next = dispatch(dragging("b1"), { type: "SELECT_FIELD_PLAYER", playerId: "p1" });
    expect(next).toEqual(selected("p1"));
  });
});

// ─── pendingUndo ──────────────────────────────────────────────────────────────

describe("from pendingUndo", () => {
  it("UNDO_TRIGGERED → idle", () => {
    const record = makeRecord();
    const next = dispatch(pendingUndo(record), { type: "UNDO_TRIGGERED" });
    expect(next).toEqual(idle());
  });

  it("UNDO_EXPIRED → idle", () => {
    const record = makeRecord();
    const next = dispatch(pendingUndo(record), { type: "UNDO_EXPIRED" });
    expect(next).toEqual(idle());
  });

  it("SELECT_FIELD_PLAYER is ignored — undo window takes priority", () => {
    const state = pendingUndo(makeRecord());
    const next = dispatch(state, { type: "SELECT_FIELD_PLAYER", playerId: "p1" });
    expect(next).toBe(state); // exact same reference
  });

  it("CANCEL is ignored — undo window takes priority", () => {
    const state = pendingUndo(makeRecord());
    const next = dispatch(state, { type: "CANCEL" });
    expect(next).toBe(state);
  });

  it("START_BENCH_DRAG is ignored — undo window takes priority", () => {
    const state = pendingUndo(makeRecord());
    const next = dispatch(state, { type: "START_BENCH_DRAG", benchPlayerId: "b1" });
    expect(next).toBe(state);
  });

  it("CANCEL_DRAG returns to idle (drag-cancel is always allowed)", () => {
    // CANCEL_DRAG is only handled when state is draggingBenchPlayer.
    // From pendingUndo it is a no-op.
    const state = pendingUndo(makeRecord());
    const next = dispatch(state, { type: "CANCEL_DRAG" });
    expect(next).toBe(state);
  });

  it("stores the substitution record verbatim", () => {
    const substitution = makeRecord("unique-id");
    const state = pendingUndo(substitution);
    expect(getPendingSubstitution(state)).toBe(substitution);
  });
});

// ─── Selectors ────────────────────────────────────────────────────────────────

describe("selectors", () => {
  it("getSelectedFieldPlayerId returns playerId when selected", () => {
    expect(getSelectedFieldPlayerId(selected("p1"))).toBe("p1");
  });

  it("getSelectedFieldPlayerId returns null when idle", () => {
    expect(getSelectedFieldPlayerId(idle())).toBeNull();
  });

  it("getSelectedFieldPlayerId returns null when dragging", () => {
    expect(getSelectedFieldPlayerId(dragging("b1"))).toBeNull();
  });

  it("getSelectedFieldPlayerId returns null when pendingUndo", () => {
    expect(getSelectedFieldPlayerId(pendingUndo(makeRecord()))).toBeNull();
  });

  it("isDragging returns true only when draggingBenchPlayer", () => {
    expect(isDragging(idle())).toBe(false);
    expect(isDragging(selected("p1"))).toBe(false);
    expect(isDragging(dragging("b1"))).toBe(true);
    expect(isDragging(pendingUndo(makeRecord()))).toBe(false);
  });

  it("getDraggingBenchPlayerId returns the bench player id", () => {
    expect(getDraggingBenchPlayerId(dragging("b2"))).toBe("b2");
    expect(getDraggingBenchPlayerId(idle())).toBeNull();
  });

  it("hasPendingUndo returns true only when pendingUndo", () => {
    expect(hasPendingUndo(idle())).toBe(false);
    expect(hasPendingUndo(selected("p1"))).toBe(false);
    expect(hasPendingUndo(dragging("b1"))).toBe(false);
    expect(hasPendingUndo(pendingUndo(makeRecord()))).toBe(true);
  });

  it("getPendingSubstitution returns null when not pendingUndo", () => {
    expect(getPendingSubstitution(idle())).toBeNull();
    expect(getPendingSubstitution(selected("p1"))).toBeNull();
  });
});

// ─── Transition completeness ──────────────────────────────────────────────────

describe("INITIAL_SUB_STATE", () => {
  it("starts as idle", () => {
    expect(INITIAL_SUB_STATE).toEqual(idle());
  });
});

describe("state immutability", () => {
  it("returns the same reference when no transition occurs", () => {
    const state = idle();
    expect(dispatch(state, { type: "CANCEL" })).toBe(state);
  });

  it("returns a new object on every real transition", () => {
    const state = idle();
    const next = dispatch(state, { type: "SELECT_FIELD_PLAYER", playerId: "p1" });
    expect(next).not.toBe(state);
  });
});

// ─── Position swap (FP-MS2.1-B1) ──────────────────────────────────────────────

describe("position swap", () => {
  const swap = { fromSlotId: "7v7-2", toSlotId: "7v7-5", fromPlayerId: "p2", toPlayerId: "p5" };
  const swapSource = (playerId: string): SubInteractionState => ({ kind: "positionSwapSource", fieldPlayerId: playerId });
  const draggingField = (playerId: string, slotId: string): SubInteractionState => ({
    kind: "draggingFieldPlayer",
    fieldPlayerId: playerId,
    slotId,
  });
  const pendingPosition = (expiresAtMs = Date.now() + 5000): SubInteractionState => ({
    kind: "pendingPositionUndo",
    swap,
    expiresAtMs,
  });

  it("START_POSITION_SWAP turns the selection into a swap source", () => {
    expect(dispatch(selected("p2"), { type: "START_POSITION_SWAP" })).toEqual(swapSource("p2"));
  });

  it("START_POSITION_SWAP needs a selected field player", () => {
    for (const state of [idle(), dragging("b1"), pendingUndo(makeRecord()), pendingPosition()]) {
      expect(dispatch(state, { type: "START_POSITION_SWAP" })).toBe(state);
    }
  });

  it("tapping the source again or cancelling leaves the lineup mode without a swap", () => {
    expect(dispatch(swapSource("p2"), { type: "SELECT_FIELD_PLAYER", playerId: "p2" })).toEqual(idle());
    expect(dispatch(swapSource("p2"), { type: "CANCEL" })).toEqual(idle());
  });

  it("a tap on another field player is left to the hook, which commits the swap", () => {
    const state = swapSource("p2");
    expect(dispatch(state, { type: "SELECT_FIELD_PLAYER", playerId: "p5" })).toBe(state);
  });

  it("START_FIELD_DRAG starts a field drag from idle, a selection or a swap source", () => {
    const action = { type: "START_FIELD_DRAG", playerId: "p2", slotId: "7v7-2" } as const;
    expect(dispatch(idle(), action)).toEqual(draggingField("p2", "7v7-2"));
    expect(dispatch(selected("p4"), action)).toEqual(draggingField("p2", "7v7-2"));
    expect(dispatch(swapSource("p2"), action)).toEqual(draggingField("p2", "7v7-2"));
  });

  it("no drag starts while an undo window is open", () => {
    for (const state of [pendingUndo(makeRecord()), pendingPosition()]) {
      expect(dispatch(state, { type: "START_FIELD_DRAG", playerId: "p2", slotId: "7v7-2" })).toBe(state);
      expect(dispatch(state, { type: "START_BENCH_DRAG", benchPlayerId: "b1" })).toBe(state);
    }
  });

  it("CANCEL_DRAG ends a field drag without a swap", () => {
    expect(dispatch(draggingField("p2", "7v7-2"), { type: "CANCEL_DRAG" })).toEqual(idle());
  });

  it("POSITION_SWAP_COMMITTED opens the position undo window from a swap source or a field drag", () => {
    const expiresAtMs = Date.now() + 5000;
    const action = { type: "POSITION_SWAP_COMMITTED", swap, expiresAtMs } as const;
    expect(dispatch(swapSource("p2"), action)).toEqual(pendingPosition(expiresAtMs));
    expect(dispatch(draggingField("p2", "7v7-2"), action)).toEqual(pendingPosition(expiresAtMs));
  });

  it("the position undo window ignores taps and cancel, and closes on undo or expiry", () => {
    const state = pendingPosition();
    expect(dispatch(state, { type: "SELECT_FIELD_PLAYER", playerId: "p3" })).toBe(state);
    expect(dispatch(state, { type: "CANCEL" })).toBe(state);
    expect(dispatch(state, { type: "UNDO_TRIGGERED" })).toEqual(idle());
    expect(dispatch(state, { type: "UNDO_EXPIRED" })).toEqual(idle());
  });

  it("selectors", () => {
    expect(hasPendingUndo(pendingPosition())).toBe(true);
    expect(getPendingSubstitution(pendingPosition())).toBeNull();
    expect(getPendingPositionSwap(pendingPosition())).toEqual(swap);
    expect(getPendingPositionSwap(pendingUndo(makeRecord()))).toBeNull();
    expect(getPositionSwapSourceId(swapSource("p2"))).toBe("p2");
    expect(getPositionSwapSourceId(selected("p2"))).toBeNull();
    expect(getDraggingFieldPlayerId(draggingField("p2", "7v7-2"))).toBe("p2");
    expect(getDraggingFieldPlayerId(dragging("b1"))).toBeNull();
    // A field drag is not a bench drag, and a swap source is not a selection.
    expect(isDragging(draggingField("p2", "7v7-2"))).toBe(false);
    expect(getSelectedFieldPlayerId(swapSource("p2"))).toBeNull();
  });
});
