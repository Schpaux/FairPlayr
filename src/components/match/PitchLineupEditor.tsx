"use client";

/**
 * PitchLineupEditor
 *
 * Visual pitch-based lineup editor combining:
 *  - Formation-aware slot layout (DEL 7)
 *  - Touch-friendly drag-and-drop via Pointer Events (DEL 8)
 *  - Tap-to-select / tap-to-place fallback (DEL 8)
 *  - Short player names throughout (DEL 4)
 *
 * Interaction model
 *  1. Drag a bench player onto a slot → place (if occupied, displaced to bench)
 *  2. Drag a field player onto another slot → swap
 *  3. Tap bench player → select; tap slot → place/swap (fallback)
 *  4. Tap selected player again → deselect
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { Users } from "lucide-react";
import type { Player } from "@/domain/team";
import type { MatchSetup } from "@/domain/match";
import {
  assignStarterToSlot,
  clearStarterSlot,
  getBenchPlayerIds,
  getFormationSlots,
  getRequiredStarters,
  swapFieldSlots,
} from "@/domain/match";
import { buildShortNameMap } from "@/lib/utils/playerName";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type DragSource =
  | { kind: "bench"; playerId: string }
  | { kind: "slot"; playerId: string; slotId: string };

interface DragState {
  source: DragSource;
  currentX: number;
  currentY: number;
  /** True once pointer moved past threshold — show ghost */
  active: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PitchLineupEditorProps {
  setup: MatchSetup;
  players: Player[];
  onSetupChange: (updated: MatchSetup) => void;
  onAutoFill: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Pixels pointer must move before drag is "active" (shows ghost, skips tap) */
const DRAG_THRESHOLD = 8;

// ─── Component ────────────────────────────────────────────────────────────────

export function PitchLineupEditor({
  setup,
  players,
  onSetupChange,
  onAutoFill,
}: PitchLineupEditorProps) {
  const slots = getFormationSlots(setup.format, setup.formationId);
  const benchIds = getBenchPlayerIds(setup);
  const required = getRequiredStarters(setup);
  const current = setup.startingPlayerIds.length;

  const playerMap = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );
  const shortNames = useMemo(() => buildShortNameMap(players), [players]);
  const getShort = (id: string) =>
    shortNames.get(id) ?? playerMap.get(id)?.name ?? id;

  // ── Tap selection state ──────────────────────────────────────────────────────
  const [tapSelected, setTapSelected] = useState<DragSource | null>(null);

  // ── Drag state ────────────────────────────────────────────────────────────────
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragOriginRef = useRef<{
    source: DragSource;
    startX: number;
    startY: number;
    pointerId: number;
  } | null>(null);

  // ── Pitch container ref (for hit-testing) ────────────────────────────────────
  const pitchRef = useRef<HTMLDivElement>(null);

  // ─── Domain helpers ──────────────────────────────────────────────────────────

  const applyDrop = useCallback(
    (source: DragSource, targetSlotId: string) => {
      const occupantId = setup.slotAssignments[targetSlotId] ?? null;

      if (source.kind === "bench") {
        // Bench → slot
        let next = setup;
        if (occupantId) {
          next = clearStarterSlot(next, targetSlotId); // displace to bench
        }
        onSetupChange(assignStarterToSlot(next, targetSlotId, source.playerId));
      } else {
        // Slot → slot
        if (source.slotId === targetSlotId) return;
        onSetupChange(swapFieldSlots(setup, source.slotId, targetSlotId));
      }
    },
    [setup, onSetupChange]
  );

  const applyRemoveFromSlot = useCallback(
    (slotId: string) => {
      onSetupChange(clearStarterSlot(setup, slotId));
    },
    [setup, onSetupChange]
  );

  // ─── Tap interaction ─────────────────────────────────────────────────────────

  const handleSlotTap = useCallback(
    (slotId: string) => {
      const occupantId = setup.slotAssignments[slotId] ?? null;

      if (tapSelected) {
        if (tapSelected.kind === "slot" && tapSelected.slotId === slotId) {
          // Tap same field slot → deselect
          setTapSelected(null);
          return;
        }
        // Place / swap
        applyDrop(tapSelected, slotId);
        setTapSelected(null);
        return;
      }

      if (occupantId) {
        // Select this field player
        setTapSelected({ kind: "slot", playerId: occupantId, slotId });
      }
      // Tap empty slot with nothing selected → no-op
    },
    [tapSelected, setup.slotAssignments, applyDrop]
  );

  const handleBenchTap = useCallback(
    (playerId: string) => {
      if (tapSelected?.kind === "bench" && tapSelected.playerId === playerId) {
        setTapSelected(null);
        return;
      }
      setTapSelected({ kind: "bench", playerId });
    },
    [tapSelected]
  );

  // ─── Pointer / drag interaction ──────────────────────────────────────────────

  const startDrag = useCallback(
    (
      e: React.PointerEvent,
      source: DragSource
    ) => {
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      dragOriginRef.current = {
        source,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
      };
      setDrag({
        source,
        currentX: e.clientX,
        currentY: e.clientY,
        active: false,
      });
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragOriginRef.current) return;
      const { startX, startY } = dragOriginRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const moved = Math.sqrt(dx * dx + dy * dy);
      setDrag((prev) =>
        prev
          ? {
              ...prev,
              currentX: e.clientX,
              currentY: e.clientY,
              active: prev.active || moved > DRAG_THRESHOLD,
            }
          : null
      );
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const origin = dragOriginRef.current;
      const currentDrag = drag;
      dragOriginRef.current = null;
      setDrag(null);

      if (!origin || !currentDrag) return;

      if (!currentDrag.active) {
        // Treat as tap
        if (origin.source.kind === "bench") {
          handleBenchTap(origin.source.playerId);
        } else {
          handleSlotTap(origin.source.slotId);
        }
        return;
      }

      // Find drop target by hit-testing
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const slotEl = el?.closest<HTMLElement>("[data-slot-id]");
      const targetSlotId = slotEl?.dataset.slotId ?? null;

      if (targetSlotId) {
        applyDrop(origin.source, targetSlotId);
        setTapSelected(null);
      }
    },
    [drag, handleBenchTap, handleSlotTap, applyDrop]
  );

  const handlePointerCancel = useCallback(() => {
    dragOriginRef.current = null;
    setDrag(null);
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────

  const isDragSource = (id: string) =>
    drag?.active && drag.source.playerId === id;

  const isTapSelected = (source: DragSource) => {
    if (!tapSelected) return false;
    if (tapSelected.kind !== source.kind) return false;
    return tapSelected.kind === "bench"
      ? tapSelected.playerId === (source as { kind: "bench"; playerId: string }).playerId
      : tapSelected.kind === "slot" &&
          (tapSelected as { kind: "slot"; slotId: string }).slotId ===
            (source as { kind: "slot"; slotId: string }).slotId;
  };

  return (
    <div
      className="relative select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* ── Progress indicator ─────────────────────────────────────────────── */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-xs font-semibold tabular-nums",
            current === required ? "text-fp-accent" : "text-muted-foreground"
          )}
        >
          {current} / {required} startere
        </span>
        <button
          type="button"
          onClick={onAutoFill}
          className="tap-target rounded-lg border border-fp-border bg-fp-surface-2 px-2 py-1 text-[11px] font-medium text-muted-foreground"
        >
          Fyll automatisk
        </button>
      </div>

      {/* ── Pitch ──────────────────────────────────────────────────────────── */}
      <div
        ref={pitchRef}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-gradient-to-b from-emerald-500/25 via-emerald-500/15 to-emerald-600/25"
        style={{ touchAction: "none" }}
      >
        {/* Field markings */}
        <div className="pointer-events-none absolute inset-4 rounded-2xl border-2 border-white/35">
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/20" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
          <div className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-b-xl border border-t-0 border-white/20" />
          <div className="absolute bottom-2 left-1/2 h-5 w-20 -translate-x-1/2 rounded-t-xl border border-b-0 border-white/20" />
        </div>

        {/* Slots */}
        {slots.map((slot) => {
          const occupantId = setup.slotAssignments[slot.id] ?? null;
          const isOccupied = Boolean(occupantId);
          const isBeingDragged = occupantId ? isDragSource(occupantId) : false;
          const isSelected =
            occupantId
              ? isTapSelected({ kind: "slot", playerId: occupantId, slotId: slot.id })
              : false;
          const isDropTarget =
            drag?.active &&
            (drag.source.kind === "bench" || drag.source.slotId !== slot.id);
          const isTapTarget = tapSelected && !isSelected;

          return (
            <button
              key={slot.id}
              type="button"
              data-slot-id={slot.id}
              className={cn(
                "tap-target absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border px-2 py-1.5 text-center transition-all",
                "min-w-[52px]",
                isBeingDragged && "opacity-30",
                isSelected
                  ? "border-fp-cta bg-fp-cta/20 text-fp-cta shadow-[var(--glow-cta-sm)] scale-105"
                  : isDropTarget || isTapTarget
                    ? isOccupied
                      ? "border-warning/60 bg-warning/20 text-white"
                      : "border-fp-cta/60 bg-fp-cta/20 text-white"
                    : isOccupied
                      ? "border-white/40 bg-black/50 text-white"
                      : "border-dashed border-white/30 bg-white/8 text-white/60"
              )}
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
              onPointerDown={
                occupantId
                  ? (e) =>
                      startDrag(e, {
                        kind: "slot",
                        playerId: occupantId,
                        slotId: slot.id,
                      })
                  : undefined
              }
              onClick={() => handleSlotTap(slot.id)}
            >
              {occupantId ? (
                <span className="block max-w-[80px] truncate text-xs font-semibold leading-tight">
                  {getShort(occupantId)}
                </span>
              ) : (
                <span className="block text-[10px] font-semibold uppercase tracking-wide">
                  {slot.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Bench ──────────────────────────────────────────────────────────── */}
      <div className="mt-3 rounded-xl border border-fp-border bg-fp-surface-2 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Benk
          </p>
          <span className="text-xs tabular-nums text-muted-foreground">
            {benchIds.length}
          </span>
        </div>

        {benchIds.length === 0 ? (
          <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
            <Users size={13} />
            Ingen på benken
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {benchIds.map((playerId) => {
              const selected = isTapSelected({ kind: "bench", playerId });
              const beingDragged = isDragSource(playerId);

              return (
                <button
                  key={playerId}
                  type="button"
                  className={cn(
                    "tap-target rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                    beingDragged && "opacity-30",
                    selected
                      ? "border-fp-cta/40 bg-fp-cta/15 text-fp-cta shadow-[var(--glow-cta-sm)] scale-105"
                      : "border-fp-border bg-background text-foreground"
                  )}
                  style={{ touchAction: "none" }}
                  onPointerDown={(e) =>
                    startDrag(e, { kind: "bench", playerId })
                  }
                  onClick={() => handleBenchTap(playerId)}
                >
                  {getShort(playerId)}
                </button>
              );
            })}
          </div>
        )}

        {tapSelected && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {tapSelected.kind === "bench"
              ? `"${getShort(tapSelected.playerId)}" valgt — trykk på en posisjon`
              : `"${getShort(tapSelected.playerId)}" valgt — trykk på en annen posisjon`}
          </p>
        )}
      </div>

      {/* ── Drag ghost ────────────────────────────────────────────────────── */}
      {drag?.active && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-fp-cta/60 bg-fp-cta px-3 py-1.5 text-xs font-semibold text-fp-cta-foreground shadow-lg"
          style={{ left: drag.currentX, top: drag.currentY }}
        >
          {getShort(drag.source.playerId)}
        </div>
      )}
    </div>
  );
}
