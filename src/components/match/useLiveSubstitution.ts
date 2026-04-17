"use client";

/**
 * useLiveSubstitution
 *
 * React hook that wraps the pure subInteractionReducer and exposes:
 *   - Current interaction state (selected player, dragging, undo window)
 *   - Ghost chip position for drag visualisation (separate from reducer state
 *     to avoid dispatching on every pointermove)
 *   - Undo countdown for the toast
 *   - Event handlers for pitch slots and bench chips
 *   - Pointer-surface handlers to attach to the drag container
 *
 * Substitution side effects (calling onSwap / onUndo) live here, NOT in the
 * reducer. The reducer is a pure function tested independently.
 *
 * ## Tap-to-swap flow
 *   1. Coach taps a field player chip  → selectFieldPlayer dispatched
 *   2. Coach taps a bench chip         → tapBenchPlayer() detects that a field
 *      player is already selected → calls commitSwap()
 *
 * ## Drag-to-swap flow
 *   1. Coach long-presses a bench chip → onPointerDown records drag origin
 *   2. Pointer moves past DRAG_THRESHOLD_PX → START_BENCH_DRAG dispatched,
 *      ghostPos updated on every subsequent move
 *   3. Pointer released over a [data-slot-id] element that contains a field
 *      player → commitSwap() called, ghost cleared
 *   4. Pointer released elsewhere → CANCEL_DRAG dispatched, ghost cleared
 *
 * ## Undo flow
 *   commitSwap() captures a snapshot of liveMatch BEFORE calling onSwap, then
 *   dispatches SWAP_COMMITTED. A 5-second timer dispatches UNDO_EXPIRED.
 *   triggerUndo() dispatches UNDO_TRIGGERED and calls onUndo(snapshot).
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { LiveMatchState } from "@/domain/liveMatch";
import {
  INITIAL_SUB_STATE,
  subInteractionReducer,
  getSelectedFieldPlayerId,
  hasPendingUndo,
  type SubInteractionState,
} from "@/domain/liveSubInteraction";

// ─── Constants ────────────────────────────────────────────────────────────────

const DRAG_THRESHOLD_PX = 8;
const UNDO_WINDOW_MS = 5000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GhostChip {
  benchPlayerId: string;
  x: number;
  y: number;
}

interface DragOrigin {
  benchPlayerId: string;
  startX: number;
  startY: number;
}

export interface UseLiveSubstitutionOptions {
  /** Current live match state — snapshotted on each swap for undo. */
  liveMatch: LiveMatchState;
  /** Called immediately when a swap is executed. Parent updates match state. */
  onSwap: (outgoingPlayerId: string, incomingPlayerId: string) => void;
  /** Called when undo is triggered. Parent should restore this snapshot. */
  onUndo: (snapshot: LiveMatchState) => void;
  /** When true, all interaction is blocked (e.g. match ended). */
  disabled?: boolean;
}

export interface UseLiveSubstitutionReturn {
  /** Current interaction state from the pure reducer. */
  state: SubInteractionState;
  /** Drag ghost position, or null when not dragging. */
  ghostChip: GhostChip | null;
  /** Seconds remaining in the undo window, or null. */
  undoSecondsRemaining: number | null;
  /** Tap a field player slot. Selects, deselects, or no-ops. */
  tapFieldPlayer: (playerId: string) => void;
  /**
   * Tap a bench player.
   * If a field player is already selected → executes swap immediately.
   * Otherwise no-op (field player must be selected first in this model).
   */
  tapBenchPlayer: (benchPlayerId: string) => void;
  /** Tap pitch background to cancel selection. */
  cancel: () => void;
  /** Trigger undo (only valid during pendingUndo window). */
  triggerUndo: () => void;
  /**
   * Attach onPointerDown to each bench chip.
   * Tracks drag origin; does NOT prevent tap from firing.
   */
  getBenchPointerDownHandler: (
    benchPlayerId: string
  ) => (e: React.PointerEvent) => void;
  /** Attach to the container that wraps pitch + bench. */
  pointerSurfaceHandlers: {
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: () => void;
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLiveSubstitution({
  liveMatch,
  onSwap,
  onUndo,
  disabled = false,
}: UseLiveSubstitutionOptions): UseLiveSubstitutionReturn {
  const [state, dispatch] = useReducer(
    subInteractionReducer,
    INITIAL_SUB_STATE
  );
  const [ghostChip, setGhostChip] = useState<GhostChip | null>(null);
  const [undoSecondsRemaining, setUndoSecondsRemaining] = useState<
    number | null
  >(null);

  // Refs for drag tracking (mutable, no re-renders).
  const dragOriginRef = useRef<DragOrigin | null>(null);
  const isDragActiveRef = useRef(false);

  // Refs for undo timers.
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use a ref to access current liveMatch inside callbacks without stale
  // closures (liveMatch changes on every frame the clock ticks).
  const liveMatchRef = useRef(liveMatch);
  liveMatchRef.current = liveMatch;

  // Clean up timers on unmount.
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
    };
  }, []);

  // ── Undo timer management ──────────────────────────────────────────────────

  const clearUndoTimers = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (undoIntervalRef.current) {
      clearInterval(undoIntervalRef.current);
      undoIntervalRef.current = null;
    }
    setUndoSecondsRemaining(null);
  }, []);

  // ── Core swap commit ───────────────────────────────────────────────────────

  const commitSwap = useCallback(
    (outgoingPlayerId: string, incomingPlayerId: string) => {
      // Capture snapshot BEFORE mutation so undo can restore it.
      const snapshot = liveMatchRef.current;

      onSwap(outgoingPlayerId, incomingPlayerId);

      const expiresAtMs = Date.now() + UNDO_WINDOW_MS;
      dispatch({ type: "SWAP_COMMITTED", snapshot, expiresAtMs });

      clearUndoTimers();
      setUndoSecondsRemaining(Math.ceil(UNDO_WINDOW_MS / 1000));

      undoIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((expiresAtMs - Date.now()) / 1000);
        setUndoSecondsRemaining(Math.max(0, remaining));
      }, 200);

      undoTimerRef.current = setTimeout(() => {
        dispatch({ type: "UNDO_EXPIRED" });
        clearUndoTimers();
      }, UNDO_WINDOW_MS);
    },
    [onSwap, clearUndoTimers]
  );

  // ── Tap interactions ───────────────────────────────────────────────────────

  const tapFieldPlayer = useCallback(
    (playerId: string) => {
      if (disabled) return;
      dispatch({ type: "SELECT_FIELD_PLAYER", playerId });
    },
    [disabled]
  );

  const tapBenchPlayer = useCallback(
    (benchPlayerId: string) => {
      if (disabled) return;

      // Read state synchronously — safe because this is called from onClick
      // which fires after the render cycle that produced `state`.
      const selectedId = getSelectedFieldPlayerId(state);
      if (selectedId !== null) {
        commitSwap(selectedId, benchPlayerId);
      }
      // If no field player is selected: no-op.
      // The interaction model requires selecting a field player first.
    },
    [disabled, state, commitSwap]
  );

  const cancel = useCallback(() => {
    if (disabled) return;
    dispatch({ type: "CANCEL" });
  }, [disabled]);

  // ── Undo ──────────────────────────────────────────────────────────────────

  const triggerUndo = useCallback(() => {
    if (!hasPendingUndo(state)) return;
    if (state.kind !== "pendingUndo") return;

    const snapshot = state.snapshot;
    dispatch({ type: "UNDO_TRIGGERED" });
    clearUndoTimers();
    onUndo(snapshot);
  }, [state, clearUndoTimers, onUndo]);

  // ── Drag handling ─────────────────────────────────────────────────────────

  const getBenchPointerDownHandler = useCallback(
    (benchPlayerId: string) =>
      (e: React.PointerEvent) => {
        if (disabled) return;
        if (hasPendingUndo(state)) return;

        // Capture the element before preventDefault changes things.
        (e.currentTarget as Element).setPointerCapture(e.pointerId);

        dragOriginRef.current = {
          benchPlayerId,
          startX: e.clientX,
          startY: e.clientY,
        };
        isDragActiveRef.current = false;
      },
    [disabled, state]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const origin = dragOriginRef.current;
      if (!origin) return;

      const dx = e.clientX - origin.startX;
      const dy = e.clientY - origin.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > DRAG_THRESHOLD_PX) {
        if (!isDragActiveRef.current) {
          isDragActiveRef.current = true;
          dispatch({
            type: "START_BENCH_DRAG",
            benchPlayerId: origin.benchPlayerId,
          });
        }
        setGhostChip({
          benchPlayerId: origin.benchPlayerId,
          x: e.clientX,
          y: e.clientY,
        });
      }
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const origin = dragOriginRef.current;
      const wasDragging = isDragActiveRef.current;

      dragOriginRef.current = null;
      isDragActiveRef.current = false;
      setGhostChip(null);

      if (!origin) return;

      if (!wasDragging) {
        // Under the threshold → treat as tap, let onClick handle it.
        return;
      }

      dispatch({ type: "CANCEL_DRAG" });

      // Hit-test the drop target.
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const slotEl = el?.closest<HTMLElement>("[data-slot-id]");
      const targetSlotId = slotEl?.dataset.slotId ?? null;
      if (!targetSlotId) return;

      const occupantId =
        liveMatchRef.current.liveSlotAssignments[targetSlotId] ?? null;
      const isOccupantOnField =
        occupantId !== null &&
        liveMatchRef.current.onFieldPlayerIds.includes(occupantId);

      if (isOccupantOnField && occupantId) {
        commitSwap(occupantId, origin.benchPlayerId);
      }
      // Drop on empty slot: no-op. A slot without a player doesn't make sense
      // as a swap target — the squad is already on the field.
    },
    [commitSwap]
  );

  const handlePointerCancel = useCallback(() => {
    dragOriginRef.current = null;
    isDragActiveRef.current = false;
    setGhostChip(null);
    dispatch({ type: "CANCEL_DRAG" });
  }, []);

  return {
    state,
    ghostChip,
    undoSecondsRemaining,
    tapFieldPlayer,
    tapBenchPlayer,
    cancel,
    triggerUndo,
    getBenchPointerDownHandler,
    pointerSurfaceHandlers: {
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
  };
}
