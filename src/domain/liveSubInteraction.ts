/**
 * Live substitution interaction state machine — pure domain module.
 *
 * Owns exactly one concern: "what is the coach currently doing with their
 * finger during a live match?" No React, no timers, no side effects.
 *
 * ## States
 *
 *   idle
 *     └─ SELECT_FIELD_PLAYER ──────────────→ fieldPlayerSelected
 *                                               ├─ SELECT_FIELD_PLAYER (same) → idle
 *                                               ├─ SELECT_FIELD_PLAYER (diff) → fieldPlayerSelected (new)
 *                                               ├─ CANCEL               ──────→ idle
 *                                               └─ SWAP_COMMITTED        ──────→ pendingUndo
 *
 *   idle / fieldPlayerSelected
 *     └─ START_BENCH_DRAG ─────────────────→ draggingBenchPlayer
 *                                               ├─ CANCEL_DRAG           ──────→ idle
 *                                               └─ SWAP_COMMITTED        ──────→ pendingUndo
 *
 *   pendingUndo
 *     ├─ UNDO_TRIGGERED ───────────────────→ idle
 *     └─ UNDO_EXPIRED ─────────────────────→ idle
 *     (all other actions are ignored while an undo window is open)
 *
 * ## Invariants
 *
 *   - At most ONE field player is ever selected at a time.
 *   - SWAP_COMMITTED is dispatched by the hook (not the UI) after it has
 *     already applied the substitution and captured a snapshot for undo.
 *   - The snapshot stored in pendingUndo is the complete LiveMatchState
 *     captured *before* the swap was applied.
 */

import type { LiveMatchState } from "@/domain/liveMatch";

// ─── States ───────────────────────────────────────────────────────────────────

export type SubInteractionState =
  | { readonly kind: "idle" }
  | { readonly kind: "fieldPlayerSelected"; readonly fieldPlayerId: string }
  | { readonly kind: "draggingBenchPlayer"; readonly benchPlayerId: string }
  | {
      readonly kind: "pendingUndo";
      readonly snapshot: LiveMatchState;
      readonly expiresAtMs: number;
    };

// ─── Actions ──────────────────────────────────────────────────────────────────

export type SubInteractionAction =
  | { readonly type: "SELECT_FIELD_PLAYER"; readonly playerId: string }
  | { readonly type: "CANCEL" }
  | { readonly type: "START_BENCH_DRAG"; readonly benchPlayerId: string }
  | { readonly type: "CANCEL_DRAG" }
  | {
      readonly type: "SWAP_COMMITTED";
      readonly snapshot: LiveMatchState;
      readonly expiresAtMs: number;
    }
  | { readonly type: "UNDO_TRIGGERED" }
  | { readonly type: "UNDO_EXPIRED" };

// ─── Initial state ────────────────────────────────────────────────────────────

export const INITIAL_SUB_STATE: SubInteractionState = { kind: "idle" };

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function subInteractionReducer(
  state: SubInteractionState,
  action: SubInteractionAction
): SubInteractionState {
  switch (action.type) {
    case "SELECT_FIELD_PLAYER": {
      // An active undo window is not interrupted by incidental taps.
      if (state.kind === "pendingUndo") return state;

      // Tapping the already-selected player deselects.
      if (
        state.kind === "fieldPlayerSelected" &&
        state.fieldPlayerId === action.playerId
      ) {
        return { kind: "idle" };
      }

      return { kind: "fieldPlayerSelected", fieldPlayerId: action.playerId };
    }

    case "CANCEL": {
      if (state.kind === "pendingUndo") return state;
      if (state.kind === "idle") return state;
      return { kind: "idle" };
    }

    case "START_BENCH_DRAG": {
      if (state.kind === "pendingUndo") return state;
      return { kind: "draggingBenchPlayer", benchPlayerId: action.benchPlayerId };
    }

    case "CANCEL_DRAG": {
      // CANCEL_DRAG always returns to idle — even during a pending undo.
      // The undo window persists independently via the timer.
      if (state.kind !== "draggingBenchPlayer") return state;
      return { kind: "idle" };
    }

    case "SWAP_COMMITTED": {
      return {
        kind: "pendingUndo",
        snapshot: action.snapshot,
        expiresAtMs: action.expiresAtMs,
      };
    }

    case "UNDO_TRIGGERED": {
      if (state.kind !== "pendingUndo") return state;
      return { kind: "idle" };
    }

    case "UNDO_EXPIRED": {
      if (state.kind !== "pendingUndo") return state;
      return { kind: "idle" };
    }

    default: {
      // TypeScript exhaustiveness guard — should never reach here.
      return state;
    }
  }
}

// ─── Selectors ────────────────────────────────────────────────────────────────

/** Returns the selected field player ID, or null if nothing is selected. */
export function getSelectedFieldPlayerId(
  state: SubInteractionState
): string | null {
  return state.kind === "fieldPlayerSelected" ? state.fieldPlayerId : null;
}

/** Returns true when the coach is actively dragging a bench player. */
export function isDragging(state: SubInteractionState): boolean {
  return state.kind === "draggingBenchPlayer";
}

/** Returns the bench player being dragged, or null. */
export function getDraggingBenchPlayerId(
  state: SubInteractionState
): string | null {
  return state.kind === "draggingBenchPlayer" ? state.benchPlayerId : null;
}

/** Returns true when the undo window is open. */
export function hasPendingUndo(state: SubInteractionState): boolean {
  return state.kind === "pendingUndo";
}

/** Returns the undo snapshot, or null. */
export function getUndoSnapshot(
  state: SubInteractionState
): LiveMatchState | null {
  return state.kind === "pendingUndo" ? state.snapshot : null;
}
