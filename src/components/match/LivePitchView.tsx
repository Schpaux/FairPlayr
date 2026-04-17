"use client";

/**
 * LivePitchView — pure presentation component.
 *
 * Renders the football pitch with positioned player chips during a live match.
 * Contains zero business logic: it translates props into DOM and forwards
 * pointer events upward. All substitution state lives in useLiveSubstitution.
 *
 * ## Visual chip states (priority order, highest first)
 *   1. selected          — lime ring + scale (overrides everything)
 *   2. being_dragged     — ghost follows cursor; source chip fades
 *   3. drop_target       — amber ring when a drag is active
 *   4. dimmed            — 50% opacity when another player is selected
 *   5. fatigue colour    — fresh (lime) / watch (amber) / act+critical (red)
 *   6. empty slot        — dashed outline
 *
 * ## Zone lines
 *   Horizontal 1px bands at 25%, 50%, 75% height give spatial context without
 *   text labels. They are aria-hidden, pointer-events-none.
 */

import { useMemo } from "react";
import type { FieldSlot } from "@/domain/match";
import type { SubInteractionState } from "@/domain/liveSubInteraction";
import {
  getSelectedFieldPlayerId,
  getDraggingBenchPlayerId,
  isDragging,
} from "@/domain/liveSubInteraction";
import {
  FATIGUE_CHIP_CLASSES,
  shouldPulse,
  type FatigueLevel,
} from "@/domain/playerFatigue";
import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface LivePitchViewProps {
  /** Formation slots with x/y percentages and labels. */
  slots: FieldSlot[];
  /** slot id → player id (or null for empty slots). */
  liveSlotAssignments: Record<string, string | null>;
  /** Players currently on the field. */
  onFieldPlayerIds: string[];
  /** Current interaction state from useLiveSubstitution. */
  interactionState: SubInteractionState;
  /** Fatigue level per player id (field players only). */
  fatigueMap: Record<string, FatigueLevel>;
  /** Short display name for a player. */
  getShortName: (playerId: string) => string;
  /** Formatted playtime string (e.g. "14:23") for the subtitle. */
  getPlaytime?: (playerId: string) => string;
  /** Tap on an occupied slot — parent dispatches selectFieldPlayer. */
  onSlotTap: (playerId: string, slotId: string) => void;
  /** Tap on pitch background to cancel selection. */
  onBackgroundTap: () => void;
  /** PointerDown on an occupied slot, for drag initiation from field. */
  onSlotPointerDown: (playerId: string, slotId: string, e: React.PointerEvent) => void;
  disabled?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LivePitchView({
  slots,
  liveSlotAssignments,
  onFieldPlayerIds,
  interactionState,
  fatigueMap,
  getShortName,
  getPlaytime,
  onSlotTap,
  onBackgroundTap,
  onSlotPointerDown,
  disabled = false,
}: LivePitchViewProps) {
  const selectedPlayerId = getSelectedFieldPlayerId(interactionState);
  const draggingBenchId = getDraggingBenchPlayerId(interactionState);
  const activeDrag = isDragging(interactionState);
  const hasSelection = selectedPlayerId !== null;

  // Pre-compute set for fast field-player lookup.
  const fieldPlayerSet = useMemo(
    () => new Set(onFieldPlayerIds),
    [onFieldPlayerIds]
  );

  return (
    <div
      className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl"
      style={{
        background:
          "linear-gradient(180deg, #1d5227 0%, #1a4a22 50%, #163d1b 100%)",
        touchAction: "none",
      }}
      onClick={onBackgroundTap}
    >
      {/* ── Field markings ──────────────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[5%] rounded-xl border-2 border-white/30"
      >
        {/* Centre line */}
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/20" />
        {/* Centre circle */}
        <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        {/* Top box */}
        <div className="absolute left-1/2 top-0 h-[14%] w-[52%] -translate-x-1/2 rounded-b-lg border border-t-0 border-white/20" />
        {/* Bottom box */}
        <div className="absolute bottom-0 left-1/2 h-[14%] w-[52%] -translate-x-1/2 rounded-t-lg border border-b-0 border-white/20" />
      </div>

      {/* ── Subtle zone bands ────────────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/4 h-px bg-white/[0.04]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/[0.04]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-3/4 h-px bg-white/[0.04]"
      />

      {/* ── Player chips ─────────────────────────────────────────────────── */}
      {slots.map((slot) => {
        const occupantId = liveSlotAssignments[slot.id] ?? null;
        const isOccupied = occupantId !== null && fieldPlayerSet.has(occupantId);

        if (!isOccupied) {
          // Empty slot — invisible touch target, no visual.
          return (
            <button
              key={slot.id}
              type="button"
              data-slot-id={slot.id}
              aria-label={`Empty slot: ${slot.label}`}
              disabled={disabled}
              className="absolute -translate-x-1/2 -translate-y-1/2 h-[52px] w-[52px] rounded-full opacity-0"
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
              onClick={(e) => {
                e.stopPropagation();
                // Tap empty slot: cancel any pending selection.
                onBackgroundTap();
              }}
            />
          );
        }

        const fatigue = fatigueMap[occupantId] ?? "fresh";
        const isSelected = occupantId === selectedPlayerId;
        const isBeingDraggedAway = occupantId === draggingBenchId;
        const isDimmed = hasSelection && !isSelected && !activeDrag;
        const isDropTarget = activeDrag && occupantId !== draggingBenchId;
        const playtime = getPlaytime ? getPlaytime(occupantId) : null;
        const pulse = shouldPulse(fatigue) && !isSelected;

        return (
          <button
            key={slot.id}
            type="button"
            data-slot-id={slot.id}
            disabled={disabled}
            aria-label={getShortName(occupantId)}
            aria-pressed={isSelected}
            className={cn(
              // Base — 52px touch target centred on the slot coordinate.
              "absolute -translate-x-1/2 -translate-y-1/2",
              "flex h-[52px] w-[52px] flex-col items-center justify-center",
              "rounded-full border-2 transition-all duration-150",
              "select-none cursor-pointer",
              // Fatigue background (base layer).
              FATIGUE_CHIP_CLASSES[fatigue],
              // Modifiers.
              isSelected && [
                "ring-[3px] ring-fp-cta ring-offset-[2px] ring-offset-transparent",
                "scale-110 z-10",
                "shadow-[0_0_0_6px_rgba(159,232,112,0.20)]",
              ],
              isDropTarget && !isSelected && [
                "ring-2 ring-amber-300 ring-offset-1",
                "scale-105",
              ],
              isBeingDraggedAway && "opacity-20",
              isDimmed && !isDropTarget && "opacity-50",
              pulse && "animate-pulse",
              disabled && "cursor-default",
              // Border
              isSelected ? "border-fp-cta/80" : "border-white/20"
            )}
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) onSlotTap(occupantId, slot.id);
            }}
            onPointerDown={(e) => {
              if (!disabled) onSlotPointerDown(occupantId, slot.id, e);
            }}
          >
            <span className="block text-[10px] font-bold leading-none">
              {getShortName(occupantId)}
            </span>
            {playtime && (
              <span className="block text-[8px] tabular-nums opacity-75 leading-none mt-0.5">
                {playtime}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
