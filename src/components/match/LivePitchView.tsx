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
 *   3. drop_target       — chalk ring when a drag is active
 *   4. dimmed            — 50% opacity when another player is selected
 *   5. fatigue colour    — fresh (disc) / watch / act+critical (ring tokens)
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
import { shouldPulse, type FatigueLevel } from "@/domain/playerFatigue";
import { cn } from "@/lib/utils";

/**
 * Chip fill per fatigue level, from the pitch tokens (DESIGN.md §2.3): fresh
 * is a plain disc, watch and act use the stint-ring colours. Lime stays for
 * the selection ring. `critical` shares act's colours; the pulse (shouldPulse)
 * tells it apart.
 */
const FATIGUE_CHIP_CLASSES: Record<FatigueLevel, string> = {
  fresh: "bg-fp-disc text-fp-on-disc",
  watch: "bg-fp-ring-watch text-fp-tag",
  act: "bg-fp-ring-act text-fp-tag",
  critical: "bg-fp-ring-act text-fp-tag",
};

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
      className="relative w-full overflow-hidden rounded-[22px]"
      style={{
        aspectRatio: "340 / 260",
        background: "linear-gradient(180deg, var(--fp-pitch-a) 0%, var(--fp-pitch-b) 100%)",
        boxShadow: "inset 0 0 0 1px var(--fp-border)",
        touchAction: "none",
      }}
      onClick={onBackgroundTap}
    >
      {/* ── Grass stripes ───────────────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, var(--fp-pitch-stripe-a) 0, var(--fp-pitch-stripe-a) 12.5%, var(--fp-pitch-stripe-b) 12.5%, var(--fp-pitch-stripe-b) 25%)",
        }}
      />

      {/* ── Half-pitch markings, mirrored: our goal at the bottom (FP-PITCH-01) */}
      <svg
        aria-hidden
        viewBox="0 0 100 80"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <g stroke="var(--fp-pitch-line)" strokeWidth="0.4" fill="none" transform="matrix(1 0 0 -1 0 80)">
          <rect x="1.5" y="1.5" width="97" height="77" rx="1" />
          <line x1="1.5" y1="77" x2="98.5" y2="77" strokeWidth="0.5" />
          <path d="M 40 77 A 10 10 0 0 1 60 77" />
          <circle cx="50" cy="77" r="0.8" fill="var(--fp-pitch-line)" stroke="none" />
          <rect x="22" y="1.5" width="56" height="18" />
          <rect x="34" y="1.5" width="32" height="7" />
          <circle cx="50" cy="13" r="0.6" fill="var(--fp-pitch-line)" stroke="none" />
          <path d="M 42 19.5 A 8 8 0 0 0 58 19.5" />
          <path d="M 1.5 4 A 2.5 2.5 0 0 0 4 1.5" />
          <path d="M 96 1.5 A 2.5 2.5 0 0 0 98.5 4" />
        </g>
      </svg>

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
              "rounded-full border-2 transition-[left,top,transform,background-color,border-color,color,opacity] duration-150",
              "select-none cursor-pointer",
              // Fatigue background (base layer).
              FATIGUE_CHIP_CLASSES[fatigue],
              // Modifiers.
              isSelected && [
                "ring-[3px] ring-fp-lime ring-offset-[2px] ring-offset-transparent",
                "scale-110 z-10",
              ],
              isDropTarget && !isSelected && [
                "ring-2 ring-fp-on-tag ring-offset-1",
                "scale-105",
              ],
              isBeingDraggedAway && "opacity-20",
              isDimmed && !isDropTarget && "opacity-50",
              pulse && "animate-pulse",
              disabled && "cursor-default",
              // Border
              isSelected ? "border-fp-lime/80" : "border-fp-grass-line"
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
