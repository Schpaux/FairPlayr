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
 *                                               ├─ START_POSITION_SWAP  ──────→ positionSwapSource
 *                                               └─ SWAP_COMMITTED        ──────→ pendingUndo
 *
 *   idle / fieldPlayerSelected
 *     └─ START_BENCH_DRAG ─────────────────→ draggingBenchPlayer
 *                                               ├─ CANCEL_DRAG           ──────→ idle
 *                                               └─ SWAP_COMMITTED        ──────→ pendingUndo
 *
 *   positionSwapSource ("Bytt plass": waiting for the other field player)
 *     ├─ SELECT_FIELD_PLAYER (same) / CANCEL ──→ idle
 *     └─ POSITION_SWAP_COMMITTED ──────────→ pendingPositionUndo
 *     (a tap on another field player is turned into the commit by the hook)
 *
 *   idle / fieldPlayerSelected / positionSwapSource
 *     └─ START_FIELD_DRAG ─────────────────→ draggingFieldPlayer
 *                                               ├─ CANCEL_DRAG           ──────→ idle
 *                                               └─ POSITION_SWAP_COMMITTED ───→ pendingPositionUndo
 *
 *   pendingUndo / pendingPositionUndo
 *     ├─ UNDO_TRIGGERED ───────────────────→ idle
 *     └─ UNDO_EXPIRED ─────────────────────→ idle
 *     (all other actions are ignored while an undo window is open)
 *
 * ## Invariants
 *
 *   - At most ONE field player is ever selected at a time.
 *   - SWAP_COMMITTED / POSITION_SWAP_COMMITTED are dispatched by the hook (not
 *     the UI) after it has already applied the change.
 *   - pendingUndo stores only what the substitution changed (the two
 *     players, their minutes and the event id; FP-MS2.1-B1-F1), and
 *     pendingPositionUndo only the swapped pair, so both undos are targeted
 *     and never restore unrelated match state.
 */

import type { PositionSwapRecord } from "@/domain/positionSwap";
import type { SubstitutionRecord } from "@/domain/substitutionUndo";

// ─── States ───────────────────────────────────────────────────────────────────

export type SubInteractionState =
  | { readonly kind: "idle" }
  | { readonly kind: "fieldPlayerSelected"; readonly fieldPlayerId: string }
  | { readonly kind: "draggingBenchPlayer"; readonly benchPlayerId: string }
  | { readonly kind: "positionSwapSource"; readonly fieldPlayerId: string }
  | {
      readonly kind: "draggingFieldPlayer";
      readonly fieldPlayerId: string;
      readonly slotId: string;
    }
  | {
      readonly kind: "pendingUndo";
      readonly substitution: SubstitutionRecord;
      readonly expiresAtMs: number;
    }
  | {
      readonly kind: "pendingPositionUndo";
      readonly swap: PositionSwapRecord;
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
      readonly substitution: SubstitutionRecord;
      readonly expiresAtMs: number;
    }
  | { readonly type: "START_POSITION_SWAP" }
  | {
      readonly type: "START_FIELD_DRAG";
      readonly playerId: string;
      readonly slotId: string;
    }
  | {
      readonly type: "POSITION_SWAP_COMMITTED";
      readonly swap: PositionSwapRecord;
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
      if (hasPendingUndo(state)) return state;

      if (state.kind === "positionSwapSource") {
        // Tapping the source again leaves the swap; any other field player is
        // the swap target, which the hook commits instead of dispatching here.
        return state.fieldPlayerId === action.playerId ? { kind: "idle" } : state;
      }

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
      if (hasPendingUndo(state)) return state;
      if (state.kind === "idle") return state;
      return { kind: "idle" };
    }

    case "START_BENCH_DRAG": {
      if (hasPendingUndo(state)) return state;
      return { kind: "draggingBenchPlayer", benchPlayerId: action.benchPlayerId };
    }

    case "START_POSITION_SWAP": {
      if (state.kind !== "fieldPlayerSelected") return state;
      return { kind: "positionSwapSource", fieldPlayerId: state.fieldPlayerId };
    }

    case "START_FIELD_DRAG": {
      if (hasPendingUndo(state)) return state;
      return {
        kind: "draggingFieldPlayer",
        fieldPlayerId: action.playerId,
        slotId: action.slotId,
      };
    }

    case "CANCEL_DRAG": {
      // CANCEL_DRAG always returns to idle — even during a pending undo.
      // The undo window persists independently via the timer.
      if (
        state.kind !== "draggingBenchPlayer" &&
        state.kind !== "draggingFieldPlayer"
      ) {
        return state;
      }
      return { kind: "idle" };
    }

    case "SWAP_COMMITTED": {
      return {
        kind: "pendingUndo",
        substitution: action.substitution,
        expiresAtMs: action.expiresAtMs,
      };
    }

    case "POSITION_SWAP_COMMITTED": {
      return {
        kind: "pendingPositionUndo",
        swap: action.swap,
        expiresAtMs: action.expiresAtMs,
      };
    }

    case "UNDO_TRIGGERED": {
      if (!hasPendingUndo(state)) return state;
      return { kind: "idle" };
    }

    case "UNDO_EXPIRED": {
      if (!hasPendingUndo(state)) return state;
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

/** Returns true when an undo window (substitution or position swap) is open. */
export function hasPendingUndo(state: SubInteractionState): boolean {
  return state.kind === "pendingUndo" || state.kind === "pendingPositionUndo";
}

/** Returns the substitution inside its undo window, or null. */
export function getPendingSubstitution(
  state: SubInteractionState
): SubstitutionRecord | null {
  return state.kind === "pendingUndo" ? state.substitution : null;
}

/** Returns the position swap inside its undo window, or null. */
export function getPendingPositionSwap(
  state: SubInteractionState
): PositionSwapRecord | null {
  return state.kind === "pendingPositionUndo" ? state.swap : null;
}

/** Returns the field player waiting for a position-swap partner, or null. */
export function getPositionSwapSourceId(
  state: SubInteractionState
): string | null {
  return state.kind === "positionSwapSource" ? state.fieldPlayerId : null;
}

/** Returns the field player being dragged onto another position, or null. */
export function getDraggingFieldPlayerId(
  state: SubInteractionState
): string | null {
  return state.kind === "draggingFieldPlayer" ? state.fieldPlayerId : null;
}
