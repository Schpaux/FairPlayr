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
 *
 * Taps are handled by `click` only (mouse, touch and keyboard alike). A
 * pointer release that was not a drag does nothing itself, so a tap is never
 * applied twice, and the click a browser fires after a drag is swallowed.
 *
 * The pitch itself is the live pitch (FP-PITCH-01, DESIGN.md §7): the same
 * markings, orientation (own goal at the bottom), token placement
 * (`placeTokens`) and token, without minutes or ring, so every player stands
 * in the same spot in setup and in Live.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import type { Player } from "@/domain/team";
import type { MatchSetup } from "@/domain/match";
import { FpButton } from "@/components/ui/FpButton";
import {
  assignStarterToSlot,
  clearStarterSlot,
  getBenchPlayerIds,
  getFormationSlots,
  getRequiredStarters,
  swapFieldSlots,
} from "@/domain/match";
import { buildDisplayNameMap } from "@/lib/utils/playerName";
import { cn } from "@/lib/utils";
import { discLabel, hasShirtNumber } from "@/components/live/liveScreenModel";
import { isKeeperSlot, placeTokens, tokenDensity } from "@/components/live/placeTokens";
import { PitchMarkings, useElementSize, type PitchLineInset } from "@/components/live/PitchMarkings";
import styles from "@/components/live/LiveScreen.module.css";

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
/** How long after a drag its trailing click is ignored (as in useLiveSubstitution). */
const DRAG_CLICK_GUARD_MS = 400;

/** True (once) for the click a browser fires right after a drag ends. */
function consumeTrailingClick(untilRef: { current: number }): boolean {
  const trailing = Date.now() < untilRef.current;
  untilRef.current = 0;
  return trailing;
}

/** No dugout overlaps the setup pitch, so its lines sit evenly inside the card. */
const SETUP_LINE_INSET: PitchLineInset = { top: 10, right: 10, bottom: 10, left: 10 };

// ─── Component ────────────────────────────────────────────────────────────────

export function PitchLineupEditor({
  setup,
  players,
  onSetupChange,
  onAutoFill,
}: PitchLineupEditorProps) {
  const t = useTranslations("matchSetup.pitch");
  const tToken = useTranslations("matchLive.sideline.token");
  const slots = getFormationSlots(setup.format, setup.formationId);
  const placements = useMemo(() => placeTokens(slots), [slots]);
  const density = tokenDensity(slots.length);
  const benchIds = getBenchPlayerIds(setup);
  const required = getRequiredStarters(setup);
  const current = setup.startingPlayerIds.length;

  const playerMap = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );
  // Same name ladder as Live, from the same squad (DESIGN.md §5.2).
  const shortNames = useMemo(() => buildDisplayNameMap(players), [players]);
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
    /**
     * Past the threshold. Kept here as well as in `drag`, because the last
     * pointermove may not have rendered yet when pointerup arrives.
     */
    active: boolean;
  } | null>(null);
  /** Until when (ms) the click that follows a finished drag is ignored. */
  const trailingClickUntilRef = useRef(0);

  // ── Pitch container ref (sizes the markings) ─────────────────────────────────
  const pitchRef = useRef<HTMLDivElement>(null);
  const pitchSize = useElementSize(pitchRef);

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
      // A new press is never the trailing click of the previous drag.
      trailingClickUntilRef.current = 0;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      dragOriginRef.current = {
        source,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
        active: false,
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
      const origin = dragOriginRef.current;
      if (!origin) return;
      const dx = e.clientX - origin.startX;
      const dy = e.clientY - origin.startY;
      const moved = Math.sqrt(dx * dx + dy * dy);
      origin.active = origin.active || moved > DRAG_THRESHOLD;
      const active = origin.active;
      setDrag((prev) =>
        prev
          ? {
              ...prev,
              currentX: e.clientX,
              currentY: e.clientY,
              active,
            }
          : null
      );
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const origin = dragOriginRef.current;
      dragOriginRef.current = null;
      setDrag(null);

      // Not a drag: the click that follows is the tap.
      if (!origin?.active) return;

      trailingClickUntilRef.current = Date.now() + DRAG_CLICK_GUARD_MS;

      // Find drop target by hit-testing
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const slotEl = el?.closest<HTMLElement>("[data-slot-id]");
      const targetSlotId = slotEl?.dataset.slotId ?? null;

      if (targetSlotId) {
        applyDrop(origin.source, targetSlotId);
        setTapSelected(null);
      }
    },
    [applyDrop]
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
        <FpButton
          type="button"
          variant="ghost"
          size="sm"
          className="tap-target"
          onClick={onAutoFill}
        >
          Fyll automatisk
        </FpButton>
      </div>

      {/* ── Pitch ──────────────────────────────────────────────────────────── */}
      <div
        ref={pitchRef}
        data-testid="setup-pitch"
        role="group"
        aria-label={t("label")}
        className={cn(styles.setupPitch, density !== "regular" && styles[density])}
      >
        <PitchMarkings width={pitchSize.width} height={pitchSize.height} inset={SETUP_LINE_INSET} />

        <div className={styles.tokenBox} data-token-box>
          {slots.map((slot) => {
            const occupantId = setup.slotAssignments[slot.id] ?? null;
            const placement = placements[slot.id];
            const isBeingDragged = occupantId ? isDragSource(occupantId) : false;
            const isSelected =
              occupantId
                ? isTapSelected({ kind: "slot", playerId: occupantId, slotId: slot.id })
                : false;
            const isDropTarget =
              drag?.active &&
              (drag.source.kind === "bench" || drag.source.slotId !== slot.id);
            const isTapTarget = tapSelected && !isSelected;
            const isKeeper = isKeeperSlot(setup.format, slots, slot.id);
            const player = occupantId ? playerMap.get(occupantId) : undefined;
            const hasNumber = hasShirtNumber(player);
            const name = occupantId ? getShort(occupantId) : "";
            // Everything after the first name tells clashing players apart, so a cut keeps it (DESIGN.md §5.2).
            const split = name.indexOf(" ");
            const nameHead = split > 0 ? name.slice(0, split) : name;
            const nameSuffix = split > 0 ? name.slice(split + 1) : "";
            const label = occupantId
              ? [
                  name,
                  hasNumber ? tToken("number", { number: discLabel(player) }) : "",
                  isKeeper ? tToken("keeper") : "",
                ].join("")
              : t("emptySlot", { label: slot.label });

            return (
              <button
                key={slot.id}
                type="button"
                data-slot-id={slot.id}
                data-player-id={occupantId ?? undefined}
                aria-label={label}
                aria-pressed={occupantId ? isSelected : undefined}
                className={cn(
                  styles.token,
                  occupantId ? isKeeper && styles.keeper : styles.slotEmpty,
                  isSelected && styles.selected,
                  !isSelected && (isDropTarget || isTapTarget) && styles.target,
                  isBeingDragged && styles.dragged
                )}
                style={{
                  left: `${placement.x}%`,
                  top: `${placement.y}%`,
                  width: `calc(${placement.room}% - 4px)`,
                }}
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
                onClick={() => {
                  if (!consumeTrailingClick(trailingClickUntilRef)) handleSlotTap(slot.id);
                }}
              >
                <span className={styles.disc}>
                  {occupantId ? (
                    <span className={hasNumber ? undefined : styles.discInitials}>
                      {discLabel(player)}
                    </span>
                  ) : (
                    slot.label
                  )}
                  {occupantId && isKeeper ? (
                    <span className={styles.keeperBadge} aria-hidden>
                      K
                    </span>
                  ) : null}
                </span>
                {occupantId ? (
                  <span className={styles.tag}>
                    <span className={styles.tagName}>
                      <span className={styles.tagFirst}>{nameHead}</span>
                      {nameSuffix ? <span className={styles.tagSuffix}>{nameSuffix}</span> : null}
                    </span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Bench ──────────────────────────────────────────────────────────── */}
      <div className="mt-4 rounded-xl border border-fp-border bg-fp-surface-2 p-3">
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
                      : "border-fp-border bg-fp-surface text-foreground shadow-sm"
                  )}
                  style={{ touchAction: "none" }}
                  onPointerDown={(e) =>
                    startDrag(e, { kind: "bench", playerId })
                  }
                  onClick={() => {
                    if (!consumeTrailingClick(trailingClickUntilRef)) handleBenchTap(playerId);
                  }}
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
        <div className={styles.ghost} style={{ left: drag.currentX, top: drag.currentY }}>
          {getShort(drag.source.playerId)}
        </div>
      )}
    </div>
  );
}
