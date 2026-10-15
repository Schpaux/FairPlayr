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
 * ## Position swap (FP-MS2.1-B1): two field players exchange slots
 *   Both paths end in commitPositionSwap(), the only caller of
 *   onPositionSwap, so tap and drag produce the same domain change.
 *   - Tap: field player selected → startPositionSwap() ("Bytt plass") →
 *     tapFieldPlayer(other) commits.
 *   - Drag: pointer down on a field token → past FIELD_DRAG_THRESHOLD_PX
 *     START_FIELD_DRAG, positionDrag follows the finger and names the valid
 *     slot underneath → release on another occupied slot commits; anywhere
 *     else cancels without a change.
 *   The one click the browser fires on the dragged token after its release
 *   is swallowed, so releasing a drag never also selects or deselects it.
 *
 * ## Undo flow (FP-MS2.1-B1-F1: targeted, never a snapshot)
 *   commitSwap() is the one place a substitution is applied, for both tap and
 *   drag. onSwap returns the SubstitutionRecord of what changed; commitSwap
 *   stores it with SWAP_COMMITTED. A 5-second timer dispatches UNDO_EXPIRED.
 *   triggerUndo() dispatches UNDO_TRIGGERED and calls onUndo(record), which
 *   reverses only that substitution on the current match state, so goals,
 *   clock and half-time changes made inside the window survive.
 *   A position swap keeps only the swapped pair and undoes through
 *   onPositionSwapUndo(swap), which reverses those two slots and nothing else.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { LiveMatchState } from "@/domain/liveMatch";
import type { SubstitutionRecord } from "@/domain/substitutionUndo";
import {
  INITIAL_SUB_STATE,
  subInteractionReducer,
  getSelectedFieldPlayerId,
  hasPendingUndo,
  type SubInteractionState,
} from "@/domain/liveSubInteraction";
import {
  canSwapLivePositions,
  describeLivePositionSwap,
  findLiveSlotOf,
  type PositionSwapRecord,
} from "@/domain/positionSwap";

// ─── Constants ────────────────────────────────────────────────────────────────

const DRAG_THRESHOLD_PX = 8;
/** Field tokens are tapped far more than dragged, so a drag needs a clearer move. */
const FIELD_DRAG_THRESHOLD_PX = 12;
/** How long after a field drag ends its trailing click on that token is ignored. */
const DRAG_CLICK_GUARD_MS = 400;
const UNDO_WINDOW_MS = 5000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GhostChip {
  benchPlayerId: string;
  x: number;
  y: number;
}

/** A field player being dragged onto another position. */
export interface PositionDrag {
  fieldPlayerId: string;
  x: number;
  y: number;
  /** The occupied slot under the finger that a release would swap with, or null. */
  targetSlotId: string | null;
}

type DragOrigin =
  | { kind: "bench"; benchPlayerId: string; startX: number; startY: number }
  | { kind: "field"; playerId: string; slotId: string; startX: number; startY: number };

export interface UseLiveSubstitutionOptions {
  /** Current live match state. */
  liveMatch: LiveMatchState;
  /**
   * Called immediately when a swap is executed. Parent updates match state and
   * returns what changed, or null when nothing was substituted (no undo then).
   */
  onSwap: (outgoingPlayerId: string, incomingPlayerId: string) => SubstitutionRecord | null;
  /** Called when undo is triggered. Parent reverses only this substitution. */
  onUndo: (substitution: SubstitutionRecord) => void;
  /**
   * Called when two field players exchange positions (tap or drag). Without
   * it, position swaps are not offered.
   */
  onPositionSwap?: (fromSlotId: string, toSlotId: string) => void;
  /** Called when a position swap is undone. Parent reverses only that swap. */
  onPositionSwapUndo?: (swap: PositionSwapRecord) => void;
  /** When true, all interaction is blocked (e.g. match ended). */
  disabled?: boolean;
}

export interface UseLiveSubstitutionReturn {
  /** Current interaction state from the pure reducer. */
  state: SubInteractionState;
  /** Drag ghost position, or null when not dragging. */
  ghostChip: GhostChip | null;
  /** Field-player drag (position swap), or null. */
  positionDrag: PositionDrag | null;
  /** Seconds remaining in the undo window, or null. */
  undoSecondsRemaining: number | null;
  /**
   * Tap a field player slot. Selects, deselects, or — while a position swap
   * is waiting for its partner — swaps positions.
   */
  tapFieldPlayer: (playerId: string) => void;
  /**
   * Tap a bench player.
   * If a field player is already selected → executes swap immediately.
   * Otherwise no-op (field player must be selected first in this model).
   */
  tapBenchPlayer: (benchPlayerId: string) => void;
  /** "Bytt plass": the selected field player waits for another field player. */
  startPositionSwap: () => void;
  /** Tap pitch background to cancel selection. */
  cancel: () => void;
  /** Trigger undo (only valid during an undo window). */
  triggerUndo: () => void;
  /**
   * Attach onPointerDown to each bench chip.
   * Tracks drag origin; does NOT prevent tap from firing.
   */
  getBenchPointerDownHandler: (
    benchPlayerId: string
  ) => (e: React.PointerEvent) => void;
  /** Attach onPointerDown to each field token for drag-to-swap positions. */
  getFieldPointerDownHandler: (
    playerId: string,
    slotId: string
  ) => (e: React.PointerEvent) => void;
  /** Attach to the container that wraps pitch + bench. */
  pointerSurfaceHandlers: {
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: () => void;
  };
}

/** The `data-slot-id` of the element under a point, or null. */
function slotIdAt(x: number, y: number): string | null {
  if (typeof document.elementFromPoint !== "function") return null;
  const el = document.elementFromPoint(x, y);
  return el?.closest<HTMLElement>("[data-slot-id]")?.dataset.slotId ?? null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLiveSubstitution({
  liveMatch,
  onSwap,
  onUndo,
  onPositionSwap,
  onPositionSwapUndo,
  disabled = false,
}: UseLiveSubstitutionOptions): UseLiveSubstitutionReturn {
  const [state, dispatch] = useReducer(
    subInteractionReducer,
    INITIAL_SUB_STATE
  );
  const [ghostChip, setGhostChip] = useState<GhostChip | null>(null);
  const [positionDrag, setPositionDrag] = useState<PositionDrag | null>(null);
  const [undoSecondsRemaining, setUndoSecondsRemaining] = useState<
    number | null
  >(null);

  // Refs for drag tracking (mutable, no re-renders).
  const dragOriginRef = useRef<DragOrigin | null>(null);
  const isDragActiveRef = useRef(false);
  // The click a browser fires on the dragged token after its release.
  const trailingClickRef = useRef<{ playerId: string; untilMs: number } | null>(null);

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

  /** Start the 5 s countdown; returns when it ends. */
  const openUndoWindow = useCallback((): number => {
    const expiresAtMs = Date.now() + UNDO_WINDOW_MS;

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

    return expiresAtMs;
  }, [clearUndoTimers]);

  // ── Core swap commit ───────────────────────────────────────────────────────

  const commitSwap = useCallback(
    (outgoingPlayerId: string, incomingPlayerId: string) => {
      const substitution = onSwap(outgoingPlayerId, incomingPlayerId);
      if (!substitution) return;

      const expiresAtMs = openUndoWindow();
      dispatch({ type: "SWAP_COMMITTED", substitution, expiresAtMs });
    },
    [onSwap, openUndoWindow]
  );

  /** The one place a position swap is applied, for both tap and drag. */
  const commitPositionSwap = useCallback(
    (fromSlotId: string, toSlotId: string) => {
      if (!onPositionSwap) return;
      const swap = describeLivePositionSwap(liveMatchRef.current, fromSlotId, toSlotId);
      if (!swap) return;

      onPositionSwap(fromSlotId, toSlotId);

      const expiresAtMs = openUndoWindow();
      dispatch({ type: "POSITION_SWAP_COMMITTED", swap, expiresAtMs });
    },
    [onPositionSwap, openUndoWindow]
  );

  // ── Tap interactions ───────────────────────────────────────────────────────

  const tapFieldPlayer = useCallback(
    (playerId: string) => {
      if (disabled) return;

      // Releasing a drag must not also select or deselect the dragged player.
      const trailing = trailingClickRef.current;
      trailingClickRef.current = null;
      if (trailing && trailing.playerId === playerId && Date.now() < trailing.untilMs) return;

      if (state.kind === "positionSwapSource" && state.fieldPlayerId !== playerId) {
        const fromSlotId = findLiveSlotOf(liveMatchRef.current, state.fieldPlayerId);
        const toSlotId = findLiveSlotOf(liveMatchRef.current, playerId);
        if (fromSlotId && toSlotId) commitPositionSwap(fromSlotId, toSlotId);
        return;
      }

      dispatch({ type: "SELECT_FIELD_PLAYER", playerId });
    },
    [disabled, state, commitPositionSwap]
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

  const startPositionSwap = useCallback(() => {
    if (disabled || !onPositionSwap) return;
    dispatch({ type: "START_POSITION_SWAP" });
  }, [disabled, onPositionSwap]);

  const cancel = useCallback(() => {
    if (disabled) return;
    dispatch({ type: "CANCEL" });
  }, [disabled]);

  // ── Undo ──────────────────────────────────────────────────────────────────

  const triggerUndo = useCallback(() => {
    // The window is closed at its deadline even if the expiry timer has not
    // fired yet (a throttled background tab or a sleeping phone).
    if (
      (state.kind === "pendingUndo" || state.kind === "pendingPositionUndo") &&
      Date.now() >= state.expiresAtMs
    ) {
      dispatch({ type: "UNDO_EXPIRED" });
      clearUndoTimers();
      return;
    }

    if (state.kind === "pendingPositionUndo") {
      const swap = state.swap;
      dispatch({ type: "UNDO_TRIGGERED" });
      clearUndoTimers();
      onPositionSwapUndo?.(swap);
      return;
    }

    if (!hasPendingUndo(state)) return;
    if (state.kind !== "pendingUndo") return;

    const substitution = state.substitution;
    dispatch({ type: "UNDO_TRIGGERED" });
    clearUndoTimers();
    onUndo(substitution);
  }, [state, clearUndoTimers, onUndo, onPositionSwapUndo]);

  // ── Drag handling ─────────────────────────────────────────────────────────

  const getBenchPointerDownHandler = useCallback(
    (benchPlayerId: string) =>
      (e: React.PointerEvent) => {
        if (disabled) return;
        if (hasPendingUndo(state)) return;

        // Capture the element before preventDefault changes things.
        (e.currentTarget as Element).setPointerCapture(e.pointerId);

        dragOriginRef.current = {
          kind: "bench",
          benchPlayerId,
          startX: e.clientX,
          startY: e.clientY,
        };
        isDragActiveRef.current = false;
      },
    [disabled, state]
  );

  const getFieldPointerDownHandler = useCallback(
    (playerId: string, slotId: string) =>
      (e: React.PointerEvent) => {
        if (disabled || !onPositionSwap) return;
        if (hasPendingUndo(state)) return;
        // One finger at a time; a second touch never starts another drag.
        if (!e.isPrimary) return;

        // Keep receiving moves when the finger leaves the token.
        const target = e.currentTarget as Element;
        if (typeof target.setPointerCapture === "function") {
          target.setPointerCapture(e.pointerId);
        }

        dragOriginRef.current = {
          kind: "field",
          playerId,
          slotId,
          startX: e.clientX,
          startY: e.clientY,
        };
        isDragActiveRef.current = false;
      },
    [disabled, onPositionSwap, state]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const origin = dragOriginRef.current;
      if (!origin) return;

      const dx = e.clientX - origin.startX;
      const dy = e.clientY - origin.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (origin.kind === "field") {
        if (!isDragActiveRef.current && dist <= FIELD_DRAG_THRESHOLD_PX) return;
        if (!isDragActiveRef.current) {
          isDragActiveRef.current = true;
          dispatch({
            type: "START_FIELD_DRAG",
            playerId: origin.playerId,
            slotId: origin.slotId,
          });
        }
        const hovered = slotIdAt(e.clientX, e.clientY);
        setPositionDrag({
          fieldPlayerId: origin.playerId,
          x: e.clientX,
          y: e.clientY,
          targetSlotId:
            hovered && canSwapLivePositions(liveMatchRef.current, origin.slotId, hovered)
              ? hovered
              : null,
        });
        return;
      }

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
      setPositionDrag(null);

      if (!origin) return;

      if (!wasDragging) {
        // Under the threshold → treat as tap, let onClick handle it.
        return;
      }

      dispatch({ type: "CANCEL_DRAG" });

      if (origin.kind === "field") {
        trailingClickRef.current = {
          playerId: origin.playerId,
          untilMs: Date.now() + DRAG_CLICK_GUARD_MS,
        };
        const targetSlotId = slotIdAt(e.clientX, e.clientY);
        // Only another occupied pitch slot swaps; the bench, empty grass, the
        // same slot or anything else cancels without a change.
        if (targetSlotId) commitPositionSwap(origin.slotId, targetSlotId);
        return;
      }

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
    [commitSwap, commitPositionSwap]
  );

  const handlePointerCancel = useCallback(() => {
    const origin = dragOriginRef.current;
    if (origin?.kind === "field" && isDragActiveRef.current) {
      trailingClickRef.current = {
        playerId: origin.playerId,
        untilMs: Date.now() + DRAG_CLICK_GUARD_MS,
      };
    }
    dragOriginRef.current = null;
    isDragActiveRef.current = false;
    setGhostChip(null);
    setPositionDrag(null);
    dispatch({ type: "CANCEL_DRAG" });
  }, []);

  return {
    state,
    ghostChip,
    positionDrag,
    undoSecondsRemaining,
    tapFieldPlayer,
    tapBenchPlayer,
    startPositionSwap,
    cancel,
    triggerUndo,
    getBenchPointerDownHandler,
    getFieldPointerDownHandler,
    pointerSurfaceHandlers: {
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
  };
}
