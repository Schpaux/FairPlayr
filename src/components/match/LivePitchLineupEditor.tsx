"use client";

/**
 * LivePitchLineupEditor
 *
 * Visual pitch-based lineup editor for live matches.
 * Same interaction model as PitchLineupEditor, adapted for live state:
 *  - Slot → slot: repositioning (no substitution event)
 *  - Bench → slot: substitution (caller creates event)
 *  - Slot → bench (long-press / tap-to-bench): remove from field
 *
 * Reuses the same visual structure, field markings, DnD, and tap-fallback
 * as PitchLineupEditor. No auto-fill or counter — those belong to setup only.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { Users } from "lucide-react";
import type { Player } from "@/domain/team";
import type { MatchFormat } from "@/domain/match";
import { getFormationSlots } from "@/domain/match";
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
  active: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface LivePitchLineupEditorProps {
  format: MatchFormat;
  formationId: string;
  liveSlotAssignments: Record<string, string | null>;
  onFieldPlayerIds: string[];
  benchPlayerIds: string[];
  players: Player[];
  disabled?: boolean;
  /** Optional subtitle per player (e.g. playtime). */
  getPlayerSubtitle?: (playerId: string) => string;
  /**
   * Bench player dropped/tapped onto a slot.
   * displacedPlayerId is set if the slot was occupied — caller creates substitution event.
   */
  onBenchToSlot: (
    benchPlayerId: string,
    slotId: string,
    displacedPlayerId: string | null
  ) => void;
  /** Both players remain on field — no substitution event needed. */
  onSlotToSlot: (slotAId: string, slotBId: string) => void;
  /** Player dragged/tapped from slot to bench area. Caller decides event. */
  onSlotToBench?: (playerId: string, slotId: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DRAG_THRESHOLD = 8;

// ─── Component ────────────────────────────────────────────────────────────────

export function LivePitchLineupEditor({
  format,
  formationId,
  liveSlotAssignments,
  onFieldPlayerIds,
  benchPlayerIds,
  players,
  disabled = false,
  getPlayerSubtitle,
  onBenchToSlot,
  onSlotToSlot,
  onSlotToBench,
}: LivePitchLineupEditorProps) {
  const slots = getFormationSlots(format, formationId);

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

  // ─── Action dispatch ─────────────────────────────────────────────────────────

  const applyDrop = useCallback(
    (source: DragSource, targetSlotId: string) => {
      if (disabled) return;

      const occupantId = liveSlotAssignments[targetSlotId] ?? null;

      if (source.kind === "bench") {
        // Bench → slot: substitution (occupant may or may not exist)
        onBenchToSlot(source.playerId, targetSlotId, occupantId);
      } else {
        // Slot → slot
        if (source.slotId === targetSlotId) return;

        const isSourceOnField = onFieldPlayerIds.includes(source.playerId);
        const isTargetOnField = occupantId
          ? onFieldPlayerIds.includes(occupantId)
          : false;

        if (isSourceOnField && (isTargetOnField || !occupantId)) {
          // Both on field (or target is empty slot) → reposition
          onSlotToSlot(source.slotId, targetSlotId);
        } else if (isSourceOnField && occupantId && !isTargetOnField) {
          // Source on field, target has bench player in slot (unusual) → treat as reposition
          onSlotToSlot(source.slotId, targetSlotId);
        }
      }
    },
    [disabled, liveSlotAssignments, onFieldPlayerIds, onBenchToSlot, onSlotToSlot]
  );

  const applyToBench = useCallback(
    (playerId: string, slotId: string) => {
      if (disabled || !onSlotToBench) return;
      onSlotToBench(playerId, slotId);
    },
    [disabled, onSlotToBench]
  );

  // ─── Tap interaction ─────────────────────────────────────────────────────────

  const handleSlotTap = useCallback(
    (slotId: string) => {
      if (disabled) return;
      const occupantId = liveSlotAssignments[slotId] ?? null;

      if (tapSelected) {
        if (tapSelected.kind === "slot" && tapSelected.slotId === slotId) {
          // Tap same slot again → move to bench (if supported)
          if (occupantId && onSlotToBench) {
            applyToBench(occupantId, slotId);
          }
          setTapSelected(null);
          return;
        }
        applyDrop(tapSelected, slotId);
        setTapSelected(null);
        return;
      }

      if (occupantId) {
        setTapSelected({ kind: "slot", playerId: occupantId, slotId });
      }
    },
    [tapSelected, liveSlotAssignments, applyDrop, applyToBench, onSlotToBench, disabled]
  );

  const handleBenchTap = useCallback(
    (playerId: string) => {
      if (disabled) return;

      if (tapSelected?.kind === "bench" && tapSelected.playerId === playerId) {
        setTapSelected(null);
        return;
      }

      if (tapSelected?.kind === "slot") {
        // Tap bench after selecting a field player: move field player to bench
        applyToBench(tapSelected.playerId, tapSelected.slotId);
        setTapSelected(null);
        return;
      }

      setTapSelected({ kind: "bench", playerId });
    },
    [tapSelected, disabled, applyToBench]
  );

  // ─── Pointer / drag interaction ──────────────────────────────────────────────

  const startDrag = useCallback(
    (e: React.PointerEvent, source: DragSource) => {
      if (disabled) return;
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      dragOriginRef.current = {
        source,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
      };
      setDrag({ source, currentX: e.clientX, currentY: e.clientY, active: false });
    },
    [disabled]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragOriginRef.current) return;
    const { startX, startY } = dragOriginRef.current;
    const moved = Math.sqrt(
      (e.clientX - startX) ** 2 + (e.clientY - startY) ** 2
    );
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
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const origin = dragOriginRef.current;
      const currentDrag = drag;
      dragOriginRef.current = null;
      setDrag(null);

      if (!origin || !currentDrag) return;

      if (!currentDrag.active) {
        // Tap fallback
        if (origin.source.kind === "bench") {
          handleBenchTap(origin.source.playerId);
        } else {
          handleSlotTap(origin.source.slotId);
        }
        return;
      }

      // Drag: hit-test drop target
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const slotEl = el?.closest<HTMLElement>("[data-slot-id]");
      const benchAreaEl = el?.closest<HTMLElement>("[data-bench-area]");
      const targetSlotId = slotEl?.dataset.slotId ?? null;

      if (targetSlotId) {
        applyDrop(origin.source, targetSlotId);
        setTapSelected(null);
      } else if (benchAreaEl && origin.source.kind === "slot") {
        applyToBench(origin.source.playerId, origin.source.slotId);
        setTapSelected(null);
      }
    },
    [drag, handleBenchTap, handleSlotTap, applyDrop, applyToBench]
  );

  const handlePointerCancel = useCallback(() => {
    dragOriginRef.current = null;
    setDrag(null);
  }, []);

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const isDragSource = (id: string) => drag?.active && drag.source.playerId === id;

  const isTapSelected = (source: DragSource) => {
    if (!tapSelected) return false;
    if (tapSelected.kind !== source.kind) return false;
    return tapSelected.kind === "bench"
      ? tapSelected.playerId === (source as { kind: "bench"; playerId: string }).playerId
      : tapSelected.kind === "slot" &&
          (tapSelected as { kind: "slot"; slotId: string }).slotId ===
            (source as { kind: "slot"; slotId: string }).slotId;
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* ── Pitch ──────────────────────────────────────────────────────────── */}
      <div
        className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-gradient-to-b from-[#21592a] via-[#1c4e24] to-[#16401e]"
        style={{ touchAction: "none" }}
      >
        {/* Field markings */}
        <div className="pointer-events-none absolute inset-4 rounded-2xl border-2 border-white/40">
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/30" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
          <div className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-b-xl border border-t-0 border-white/30" />
          <div className="absolute bottom-2 left-1/2 h-5 w-20 -translate-x-1/2 rounded-t-xl border border-b-0 border-white/30" />
        </div>

        {/* Slots */}
        {slots.map((slot) => {
          const occupantId = liveSlotAssignments[slot.id] ?? null;
          const isOccupied = Boolean(occupantId);
          const isBeingDragged = occupantId ? isDragSource(occupantId) : false;
          const isSelected = occupantId
            ? isTapSelected({ kind: "slot", playerId: occupantId, slotId: slot.id })
            : false;
          const isDropTarget =
            drag?.active &&
            (drag.source.kind === "bench" || drag.source.slotId !== slot.id);
          const isTapTarget = tapSelected && !isSelected;
          const subtitle =
            occupantId && getPlayerSubtitle ? getPlayerSubtitle(occupantId) : null;

          return (
            <button
              key={slot.id}
              type="button"
              data-slot-id={slot.id}
              disabled={disabled && !occupantId}
              className={cn(
                "tap-target absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border px-2.5 py-1.5 text-center transition-all duration-150",
                "min-w-[56px]",
                isBeingDragged && "opacity-20",
                disabled && "cursor-default",
                isSelected
                  ? "border-fp-cta bg-fp-cta text-fp-cta-foreground shadow-[var(--glow-cta-sm)] scale-110"
                  : isDropTarget || isTapTarget
                    ? isOccupied
                      ? "border-amber-300/90 bg-amber-50/90 text-amber-900"
                      : "border-fp-cta/60 bg-fp-cta/20 text-fp-cta"
                    : isOccupied
                      ? "border-white/20 bg-white/90 text-fp-cta-foreground shadow-sm"
                      : "border-dashed border-white/25 bg-white/6 text-white/40"
              )}
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
              onPointerDown={
                occupantId && !disabled
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
                <span className="flex flex-col items-center">
                  <span className="block max-w-[80px] truncate text-xs font-semibold leading-tight">
                    {getShort(occupantId)}
                  </span>
                  {subtitle && (
                    <span className="block text-[9px] tabular-nums opacity-75 leading-tight">
                      {subtitle}
                    </span>
                  )}
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
      <div
        data-bench-area="true"
        className="mt-4 rounded-xl border border-fp-border bg-fp-surface-2 p-3"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Benk
          </p>
          <span className="text-xs tabular-nums text-muted-foreground">
            {benchPlayerIds.length}
          </span>
        </div>

        {benchPlayerIds.length === 0 ? (
          <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
            <Users size={13} />
            Ingen på benken
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {benchPlayerIds.map((playerId) => {
              const selected = isTapSelected({ kind: "bench", playerId });
              const beingDragged = isDragSource(playerId);
              const subtitle = getPlayerSubtitle ? getPlayerSubtitle(playerId) : null;

              return (
                <button
                  key={playerId}
                  type="button"
                  disabled={disabled}
                  className={cn(
                    "tap-target rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                    beingDragged && "opacity-30",
                    disabled && "cursor-default",
                    selected
                      ? "border-fp-cta/40 bg-fp-cta/15 text-fp-cta shadow-[var(--glow-cta-sm)] scale-105"
                      : "border-fp-border bg-fp-surface text-foreground shadow-sm"
                  )}
                  style={{ touchAction: "none" }}
                  onPointerDown={
                    !disabled
                      ? (e) => startDrag(e, { kind: "bench", playerId })
                      : undefined
                  }
                  onClick={() => handleBenchTap(playerId)}
                >
                  <span className="block text-center">
                    <span className="block">{getShort(playerId)}</span>
                    {subtitle && (
                      <span className="block text-[9px] tabular-nums opacity-60">
                        {subtitle}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {tapSelected && !disabled && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {tapSelected.kind === "bench"
              ? `"${getShort(tapSelected.playerId)}" valgt — trykk på en posisjon`
              : onSlotToBench
                ? `"${getShort(tapSelected.playerId)}" valgt — trykk en posisjon eller benken`
                : `"${getShort(tapSelected.playerId)}" valgt — trykk på en annen posisjon`}
          </p>
        )}
      </div>

      {/* ── Drag ghost ────────────────────────────────────────────────────── */}
      {drag?.active && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/20 bg-white/95 px-3 py-1.5 text-xs font-semibold text-fp-cta-foreground shadow-xl"
          style={{ left: drag.currentX, top: drag.currentY }}
        >
          {getShort(drag.source.playerId)}
        </div>
      )}
    </div>
  );
}
