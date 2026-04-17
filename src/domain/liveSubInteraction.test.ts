import { describe, it, expect } from "vitest";
import {
  subInteractionReducer,
  INITIAL_SUB_STATE,
  getSelectedFieldPlayerId,
  isDragging,
  getDraggingBenchPlayerId,
  hasPendingUndo,
  getUndoSnapshot,
  type SubInteractionState,
} from "@/domain/liveSubInteraction";
import type { LiveMatchState } from "@/domain/liveMatch";

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

function pendingUndo(snapshot: LiveMatchState, expiresAtMs = Date.now() + 5000): SubInteractionState {
  return { kind: "pendingUndo", snapshot, expiresAtMs };
}

// Minimal snapshot stub — enough for type correctness.
function makeSnapshot(id = "snap-1"): LiveMatchState {
  return { id } as unknown as LiveMatchState;
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
    const snapshot = makeSnapshot();
    const expiresAtMs = Date.now() + 5000;
    const next = dispatch(selected("p1"), { type: "SWAP_COMMITTED", snapshot, expiresAtMs });
    expect(next).toEqual({ kind: "pendingUndo", snapshot, expiresAtMs });
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
    const snapshot = makeSnapshot();
    const expiresAtMs = Date.now() + 5000;
    const next = dispatch(dragging("b1"), { type: "SWAP_COMMITTED", snapshot, expiresAtMs });
    expect(next).toEqual({ kind: "pendingUndo", snapshot, expiresAtMs });
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
    const snap = makeSnapshot();
    const next = dispatch(pendingUndo(snap), { type: "UNDO_TRIGGERED" });
    expect(next).toEqual(idle());
  });

  it("UNDO_EXPIRED → idle", () => {
    const snap = makeSnapshot();
    const next = dispatch(pendingUndo(snap), { type: "UNDO_EXPIRED" });
    expect(next).toEqual(idle());
  });

  it("SELECT_FIELD_PLAYER is ignored — undo window takes priority", () => {
    const state = pendingUndo(makeSnapshot());
    const next = dispatch(state, { type: "SELECT_FIELD_PLAYER", playerId: "p1" });
    expect(next).toBe(state); // exact same reference
  });

  it("CANCEL is ignored — undo window takes priority", () => {
    const state = pendingUndo(makeSnapshot());
    const next = dispatch(state, { type: "CANCEL" });
    expect(next).toBe(state);
  });

  it("START_BENCH_DRAG is ignored — undo window takes priority", () => {
    const state = pendingUndo(makeSnapshot());
    const next = dispatch(state, { type: "START_BENCH_DRAG", benchPlayerId: "b1" });
    expect(next).toBe(state);
  });

  it("CANCEL_DRAG returns to idle (drag-cancel is always allowed)", () => {
    // CANCEL_DRAG is only handled when state is draggingBenchPlayer.
    // From pendingUndo it is a no-op.
    const state = pendingUndo(makeSnapshot());
    const next = dispatch(state, { type: "CANCEL_DRAG" });
    expect(next).toBe(state);
  });

  it("stores the snapshot verbatim", () => {
    const snapshot = makeSnapshot("unique-id");
    const state = pendingUndo(snapshot);
    expect(getUndoSnapshot(state)).toBe(snapshot);
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
    expect(getSelectedFieldPlayerId(pendingUndo(makeSnapshot()))).toBeNull();
  });

  it("isDragging returns true only when draggingBenchPlayer", () => {
    expect(isDragging(idle())).toBe(false);
    expect(isDragging(selected("p1"))).toBe(false);
    expect(isDragging(dragging("b1"))).toBe(true);
    expect(isDragging(pendingUndo(makeSnapshot()))).toBe(false);
  });

  it("getDraggingBenchPlayerId returns the bench player id", () => {
    expect(getDraggingBenchPlayerId(dragging("b2"))).toBe("b2");
    expect(getDraggingBenchPlayerId(idle())).toBeNull();
  });

  it("hasPendingUndo returns true only when pendingUndo", () => {
    expect(hasPendingUndo(idle())).toBe(false);
    expect(hasPendingUndo(selected("p1"))).toBe(false);
    expect(hasPendingUndo(dragging("b1"))).toBe(false);
    expect(hasPendingUndo(pendingUndo(makeSnapshot()))).toBe(true);
  });

  it("getUndoSnapshot returns null when not pendingUndo", () => {
    expect(getUndoSnapshot(idle())).toBeNull();
    expect(getUndoSnapshot(selected("p1"))).toBeNull();
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
