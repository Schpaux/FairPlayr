"use client";

/**
 * LiveBenchStrip — pure presentation component.
 *
 * Renders the bench as a horizontally scrollable strip of player chips.
 * Equal in visual weight to the pitch: the bench is not secondary, it is half
 * of the substitution system.
 *
 * ## Chip states
 *   - default           — dark surface, muted text, low contrast (waiting)
 *   - tap-ready         — lime ring glow when a field player is selected
 *                         (hints: "tap me to complete the swap")
 *   - suggested         — faint lime border + shadow (coach intelligence hint)
 *   - being_dragged     — fades the chip that is currently following the finger
 *   - last_subbed_out   — reduced opacity + muted text (receipt; cannot re-enter)
 *
 * ## Interaction
 *   onTap      — fires on click; parent decides what to do based on sub state
 *   onPointerDown — from useLiveSubstitution.getBenchPointerDownHandler()
 */

import type { SubInteractionState } from "@/domain/liveSubInteraction";
import {
  getSelectedFieldPlayerId,
  getDraggingBenchPlayerId,
} from "@/domain/liveSubInteraction";
import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface LiveBenchStripProps {
  benchPlayerIds: string[];
  interactionState: SubInteractionState;
  /** Short display name for a player. */
  getShortName: (playerId: string) => string;
  /** Optional jersey number to show alongside the name. */
  getJerseyNumber?: (playerId: string) => string | null;
  /** Formatted playtime string, shown dimly under the name. */
  getPlaytime?: (playerId: string) => string;
  /** The player most recently subbed off — shown faded as a "receipt". */
  lastSubbedOutPlayerId?: string | null;
  /**
   * Coach intelligence: this player is suggested as the best incoming sub.
   * Gets a faint lime glow — passive, non-blocking.
   */
  suggestedIncomingPlayerId?: string | null;
  /** Tap handler — parent calls tapBenchPlayer() from useLiveSubstitution. */
  onTap: (benchPlayerId: string) => void;
  /** PointerDown handler — from getBenchPointerDownHandler(). */
  onPointerDown: (benchPlayerId: string, e: React.PointerEvent) => void;
  disabled?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LiveBenchStrip({
  benchPlayerIds,
  interactionState,
  getShortName,
  getJerseyNumber,
  getPlaytime,
  lastSubbedOutPlayerId = null,
  suggestedIncomingPlayerId = null,
  onTap,
  onPointerDown,
  disabled = false,
}: LiveBenchStripProps) {
  const selectedFieldPlayerId = getSelectedFieldPlayerId(interactionState);
  const draggingBenchId = getDraggingBenchPlayerId(interactionState);

  // When a field player is selected, bench chips glow lime to signal
  // they are valid swap targets.
  const fieldPlayerIsSelected = selectedFieldPlayerId !== null;

  if (benchPlayerIds.length === 0) {
    return (
      <div className="flex h-[72px] items-center px-1">
        <p className="text-xs text-muted-foreground">Ingen på benken</p>
      </div>
    );
  }

  return (
    <div
      data-bench-area="true"
      className="flex h-[72px] items-center gap-2.5 overflow-x-auto px-1 py-2"
      style={{ scrollbarWidth: "none" }}
    >
      {benchPlayerIds.map((playerId) => {
        const isBeingDragged = playerId === draggingBenchId;
        const isLastSubbedOut = playerId === lastSubbedOutPlayerId;
        const isSuggested =
          playerId === suggestedIncomingPlayerId && !fieldPlayerIsSelected;
        const isReadyTarget = fieldPlayerIsSelected && !isLastSubbedOut;
        const jerseyNum = getJerseyNumber ? getJerseyNumber(playerId) : null;
        const playtime = getPlaytime ? getPlaytime(playerId) : null;

        return (
          <button
            key={playerId}
            type="button"
            disabled={disabled || isLastSubbedOut}
            aria-label={getShortName(playerId)}
            className={cn(
              // Base chip — pill, 52px height, min 64px width.
              "shrink-0 flex flex-col items-center justify-center gap-0.5",
              "h-[52px] min-w-[64px] rounded-full border px-3",
              "transition duration-150 select-none",
              // Default: dark, muted, waiting.
              "bg-fp-surface-2 border-fp-border text-foreground",
              // Ready target: field player is selected.
              isReadyTarget && [
                "border-fp-lime bg-fp-lime text-fp-on-lime",
                "scale-105",
              ],
              // Suggested: coach intelligence hint (only when nothing selected).
              isSuggested && [
                "border-fp-lime",
              ],
              // Being dragged: original chip fades.
              isBeingDragged && "opacity-20 scale-95",
              // Last subbed out: receipt, not actionable.
              isLastSubbedOut && "opacity-35 cursor-default",
              disabled && !isLastSubbedOut && "cursor-default"
            )}
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
              if (!disabled && !isLastSubbedOut) onPointerDown(playerId, e);
            }}
            onClick={() => {
              if (!disabled && !isLastSubbedOut) onTap(playerId);
            }}
          >
            <span className="flex items-baseline gap-1 leading-none">
              <span className="text-[12px] font-semibold">
                {getShortName(playerId)}
              </span>
              {jerseyNum && (
                <span className="text-[10px] opacity-50">{jerseyNum}</span>
              )}
            </span>
            {playtime && (
              <span className="text-[9px] tabular-nums opacity-50 leading-none">
                {playtime}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
