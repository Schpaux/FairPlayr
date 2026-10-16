"use client";

/**
 * Bench (DESIGN.md §5.3; FP-MS2.1-B2, approved Alternative C "fairness rail").
 *
 * - Order: least-played first by displayed total minutes, ties in squad order
 *   (`sortBenchPlayers`). Held while the coach is mid-interaction or has a
 *   finger on / is scrolling the bench (`nextBenchOrder`); re-sorted once
 *   afterwards, with a short slide, and the rail returns to its start if
 *   somebody joined or left the bench meanwhile.
 * - Layout: column-major grid, one row if everyone fits, else two (three on
 *   tall phones), else a horizontal rail (`chooseBenchLayout`). Names are
 *   never cut.
 * - Rail: native horizontal scrolling, a fade on whichever edge hides
 *   players, and "‹ N" / "+N ›" buttons that jump to either end.
 * - Touch: on a rail, tiles allow horizontal panning and ask the substitution
 *   hook for a direction lock, so a sideways swipe scrolls and an upward drag
 *   still substitutes.
 * Every tap, drag and drop resolves through the player id on the tile.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { LiveScreenModel } from "@/components/live/liveScreenModel";
import type { BenchPointerDownOptions } from "@/components/match/useLiveSubstitution";
import { INITIAL_BENCH_ORDER, nextBenchOrder, sortBenchPlayers } from "@/domain/benchOrder";
import {
  benchMaxRows,
  benchWidth,
  chooseBenchLayout,
  type BenchLayout,
  type BenchPad,
} from "@/components/live/benchLayout";
import styles from "@/components/live/LiveScreen.module.css";

/** Width of the edge fade that still hides a tile's content (rail.js). */
const FADE_PX = 28;
/** How long after the last touch or scroll the bench counts as settled. */
const SETTLE_MS = 180;
/** Re-sort slide: --fp-d-base with --fp-ease-out. */
const SLIDE_MS = 220;
const SLIDE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

interface BenchProps {
  model: LiveScreenModel;
  disabled: boolean;
  flashedPlayerId: string | null;
  onTapBenchPlayer: (playerId: string) => void;
  onBenchPointerDown: (playerId: string, event: React.PointerEvent, options?: BenchPointerDownOptions) => void;
}

interface RailCues {
  less: number;
  more: number;
}

function railOverflows(rail: HTMLElement): boolean {
  return rail.scrollWidth - rail.clientWidth > 1;
}

/** Tiles not fully reachable (off-screen or under the fade) on each side. */
function measureCues(rail: HTMLElement): RailCues {
  if (!railOverflows(rail)) return { less: 0, more: 0 };
  const box = rail.getBoundingClientRect();
  const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
  const left = box.left + (rail.scrollLeft > 1 ? FADE_PX : 0);
  const right = Math.min(box.right, window.innerWidth) - (remaining > 1 ? FADE_PX : 0);
  let less = 0;
  let more = 0;
  for (const tile of rail.querySelectorAll<HTMLElement>("[data-bench-player-id]")) {
    const rect = tile.getBoundingClientRect();
    if (rect.right > right + 0.5) more += 1;
    else if (rect.left < left - 0.5) less += 1;
  }
  return { less, more };
}

function readLayout(rail: HTMLElement): BenchLayout {
  return {
    rows: Number(rail.style.getPropertyValue("--bench-rows")) || 1,
    pad: (rail.getAttribute("data-pad") as BenchPad | null) ?? "regular",
    rail: rail.hasAttribute("data-rail"),
  };
}

function writeLayout(rail: HTMLElement, layout: BenchLayout) {
  if (rail.style.getPropertyValue("--bench-rows") !== String(layout.rows)) {
    rail.style.setProperty("--bench-rows", String(layout.rows));
  }
  if (rail.getAttribute("data-pad") !== layout.pad) rail.setAttribute("data-pad", layout.pad);
  if (layout.rail !== rail.hasAttribute("data-rail")) {
    if (layout.rail) rail.setAttribute("data-rail", "");
    else rail.removeAttribute("data-rail");
  }
}

export function Bench({ model, disabled, flashedPlayerId, onTapBenchPlayer, onBenchPointerDown }: BenchProps) {
  const t = useTranslations("matchLive.sideline.bench");
  const railRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ── Gesture: a finger on the bench, or the rail still scrolling ─────────
  const [gesture, setGesture] = useState(false);
  const pointerDownRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdForGesture = () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
    setGesture(true);
  };
  const settleLater = () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      if (!pointerDownRef.current) setGesture(false);
    }, SETTLE_MS);
  };
  useEffect(() => {
    const release = () => {
      if (!pointerDownRef.current) return;
      pointerDownRef.current = false;
      settleLater();
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, []);

  // ── Order: sorted, or held while anything is in progress ─────────────────
  const held = model.interactionActive || gesture;
  const sorted = sortBenchPlayers(model.bench);
  const [orderState, setOrderState] = useState(INITIAL_BENCH_ORDER);
  const nextOrder = nextBenchOrder(orderState, { sorted, held });
  if (nextOrder !== orderState) setOrderState(nextOrder);
  const tilesById = new Map(model.bench.map((tile) => [tile.playerId, tile]));
  const tiles = nextOrder.order.flatMap((playerId) => {
    const tile = tilesById.get(playerId);
    return tile ? [tile] : [];
  });

  // ── Rail cues ("‹ N" / "+N ›"), updated on scroll and after layout ──────
  const [cues, setCues] = useState<RailCues>({ less: 0, more: 0 });
  const cuesFrameRef = useRef<number | null>(null);
  const scheduleCues = () => {
    if (cuesFrameRef.current !== null) return;
    cuesFrameRef.current = requestAnimationFrame(() => {
      cuesFrameRef.current = null;
      const rail = railRef.current;
      if (!rail) return;
      const next = measureCues(rail);
      setCues((prev) => (prev.less === next.less && prev.more === next.more ? prev : next));
    });
  };
  useEffect(
    () => () => {
      if (cuesFrameRef.current !== null) cancelAnimationFrame(cuesFrameRef.current);
      cuesFrameRef.current = null;
    },
    []
  );

  // Viewport changes re-run the layout.
  const [viewport, setViewport] = useState(0);
  useEffect(() => {
    const wrap = wrapRef.current;
    const bump = () => setViewport((value) => value + 1);
    window.addEventListener("resize", bump);
    const observer = typeof ResizeObserver === "function" && wrap ? new ResizeObserver(bump) : null;
    if (observer && wrap) observer.observe(wrap);
    return () => {
      window.removeEventListener("resize", bump);
      observer?.disconnect();
    };
  }, []);

  // ── Layout, re-sort slide and return-to-start: one step after commit ───
  // Rows, padding and rail are written to the DOM (not React state) so the
  // measurement never feeds back into a render; they change only when the
  // result changes. While held, a layout only grows (to stop clipping), so
  // nothing moves under the finger.
  const contentKey = tiles.map((tile) => `${tile.playerId}:${tile.name}:${tile.minutes}`).join("|");
  const offsetsRef = useRef<{ key: string; offsets: Map<string, { left: number; top: number }> } | null>(null);
  const returnKeyRef = useRef(orderState.returnToStartKey);
  useLayoutEffect(() => {
    const rail = railRef.current;
    const measure = measureRef.current;
    const wrap = wrapRef.current;
    if (!rail || !measure || !wrap) return;

    const contentWidths = [...measure.children].map((child) => child.getBoundingClientRect().width);
    const available = wrap.clientWidth;
    const maxRows = benchMaxRows(window.innerHeight);
    const current = readLayout(rail);
    const currentFits =
      rail.style.getPropertyValue("--bench-rows") !== "" &&
      current.rows <= maxRows &&
      (current.rail || benchWidth(contentWidths, current.rows, current.pad) <= available + 0.5);
    if (!(held && currentFits)) writeLayout(rail, chooseBenchLayout({ contentWidths, available, maxRows }));

    // After a substitution, back to the start, where the least-played are.
    if (returnKeyRef.current !== nextOrder.returnToStartKey) {
      returnKeyRef.current = nextOrder.returnToStartKey;
      if (!held) rail.scrollLeft = 0;
    }

    // Slide tiles from where they were to where they are now (FLIP).
    const order = tiles.map((tile) => tile.playerId).join("|");
    const offsets = new Map<string, { left: number; top: number }>();
    for (const el of rail.querySelectorAll<HTMLElement>("[data-bench-player-id]")) {
      offsets.set(el.dataset.benchPlayerId!, { left: el.offsetLeft, top: el.offsetTop });
    }
    const previous = offsetsRef.current;
    const reduced =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (previous && previous.key !== order && !held && !reduced) {
      for (const el of rail.querySelectorAll<HTMLElement>("[data-bench-player-id]")) {
        const before = previous.offsets.get(el.dataset.benchPlayerId!);
        const after = offsets.get(el.dataset.benchPlayerId!);
        if (!before || !after || typeof el.animate !== "function") continue;
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: SLIDE_MS,
          easing: SLIDE_EASING,
        });
      }
    }
    offsetsRef.current = { key: order, offsets };

    scheduleCues();
    // scheduleCues and tiles are read through refs/derived from contentKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, held, viewport, nextOrder.returnToStartKey]);

  if (model.bench.length === 0) return null;

  const fieldSelected = model.selectedFieldPlayerId !== null;
  const suggestedId = model.strip === "suggestion" ? model.suggestion?.incomingPlayerId : null;

  const jump = (side: "start" | "end") => {
    const rail = railRef.current;
    if (!rail) return;
    const reduced =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const left = side === "end" ? rail.scrollWidth : 0;
    if (typeof rail.scrollTo === "function") rail.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });
    else rail.scrollLeft = left;
    scheduleCues();
  };

  return (
    <div
      ref={wrapRef}
      className={styles.benchWrap}
      data-rail-less={cues.less > 0 ? "" : undefined}
      data-rail-more={cues.more > 0 ? "" : undefined}
    >
      {/* Content widths for the layout: the same text, no padding. */}
      <div ref={measureRef} className={styles.benchMeasure} aria-hidden>
        {tiles.map((tile) => (
          <span key={tile.playerId} className={styles.benchMeasureTile}>
            <span className={styles.benchName}>{tile.name}</span>
            <span className={styles.benchMinutes}>{tile.minutes}′</span>
          </span>
        ))}
      </div>
      <div
        ref={railRef}
        className={styles.bench}
        role="group"
        aria-label={t("label")}
        data-testid="live-bench"
        onPointerDown={() => {
          pointerDownRef.current = true;
          holdForGesture();
        }}
        onScroll={() => {
          holdForGesture();
          settleLater();
          scheduleCues();
        }}
      >
        {tiles.map((tile) => {
          const label = [
            tile.name,
            tile.number ? t("number", { number: tile.number }) : "",
            t("minutes", { minutes: tile.minutes }),
          ].join("");

          return (
            <button
              key={tile.playerId}
              type="button"
              data-bench-player-id={tile.playerId}
              className={cn(
                styles.benchTile,
                fieldSelected && styles.benchTarget,
                !fieldSelected && tile.playerId === suggestedId && styles.benchSuggested,
                tile.playerId === model.draggingBenchPlayerId && styles.benchDragging,
                tile.playerId === flashedPlayerId && styles.benchLanded,
              )}
              aria-label={label}
              disabled={disabled}
              onPointerDown={(event) => {
                const rail = railRef.current;
                onBenchPointerDown(tile.playerId, event, {
                  directionLock: rail !== null && railOverflows(rail),
                });
              }}
              onClick={() => onTapBenchPlayer(tile.playerId)}
            >
              <span className={styles.benchName}>{tile.name}</span>
              <span className={styles.benchMinutes}>{tile.minutes}′</span>
            </button>
          );
        })}
      </div>
      {cues.less > 0 ? (
        <button
          type="button"
          className={styles.railJump}
          data-side="start"
          data-testid="bench-jump-start"
          aria-label={t("jumpStartLabel")}
          onClick={() => jump("start")}
        >
          <ChevronLeft size={14} strokeWidth={2.25} aria-hidden />
          {cues.less}
        </button>
      ) : null}
      {cues.more > 0 ? (
        <button
          type="button"
          className={styles.railJump}
          data-side="end"
          data-testid="bench-jump-end"
          aria-label={t("jumpEndLabel", { count: cues.more })}
          onClick={() => jump("end")}
        >
          {t("jumpEndShort", { count: cues.more })}
          <ChevronRight size={14} strokeWidth={2.25} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
