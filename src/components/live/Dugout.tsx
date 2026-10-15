"use client";

/**
 * Dugout (DESIGN.md §5.3–5.4): the action strip, then the bench.
 * The strip shows exactly one message, chosen by `resolveStripKind`; every
 * button calls a handler that already exists on the controller.
 */

import { useLayoutEffect, useRef } from "react";
import { ArrowLeftRight, Play, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { LiveScreenModel } from "@/components/live/liveScreenModel";
import { isLastPhase } from "@/components/live/stripModel";
import styles from "@/components/live/LiveScreen.module.css";

const ICON = { strokeWidth: 1.75, "aria-hidden": true } as const;

export interface StripActions {
  onKickoff: () => void;
  onStartSecondHalf: () => void;
  onSetupNext: () => void;
  onRequestEndPhase: () => void;
  onSelectSuggestion: () => void;
  onCancelSelection: () => void;
  onUndo: () => void;
}

interface ActionStripProps extends StripActions {
  model: LiveScreenModel;
  undo: { secondsRemaining: number; expiresAtMs: number } | null;
}

function ActionStrip({ model, undo, ...actions }: ActionStripProps) {
  const t = useTranslations("matchLive.sideline.strip");
  const benchCount = model.bench.length;
  const selected = model.tokens.find(
    (token) => token.playerId === model.selectedFieldPlayerId,
  );
  const dragging = model.bench.find(
    (tile) => tile.playerId === model.draggingBenchPlayerId,
  );

  let small: string;
  let main: string;
  let announce: string | null = null;
  let tone: "plain" | "idle" | "inverse" = "plain";
  let button: React.ReactNode = null;
  let key: string = model.strip;

  switch (model.strip) {
    case "undo": {
      const sub = model.lastSubstitution;
      const seconds = undo?.secondsRemaining ?? 0;
      tone = "inverse";
      key = `undo-${undo?.expiresAtMs ?? 0}`;
      // One name per line, so neither is cut beside the undo key; the
      // announcer still reads the whole swap.
      small = !sub
        ? ""
        : sub.minute !== null && sub.minute !== undefined
          ? t("undoOutSmall", { out: sub.outName, minute: sub.minute })
          : t("undoOutSmallNoMinute", { out: sub.outName });
      main = sub ? t("undoIn", { in: sub.inName }) : "";
      announce = sub ? t("undoText", { in: sub.inName, out: sub.outName }) : "";
      button = (
        <button
          type="button"
          className={cn(styles.btn, styles.btnSm)}
          aria-label={t("undoLabel", { seconds })}
          onClick={actions.onUndo}
        >
          <Undo2 size={18} {...ICON} />
          {t("undo")}
          <span className={styles.undoSeconds} aria-hidden>
            {seconds}
          </span>
        </button>
      );
      break;
    }
    case "dragging":
      small = dragging?.name ?? "";
      main = t("draggingText");
      break;
    case "selection":
      key = `selection-${model.selectedFieldPlayerId}`;
      small = selected
        ? t("selectedSmall", { name: selected.name, minutes: selected.minutes })
        : "";
      main = benchCount > 0 ? t("selectedText") : t("selectedNoBench");
      button = (
        <button
          type="button"
          className={cn(styles.btn, styles.btnSm, styles.btnSecondary)}
          onClick={actions.onCancelSelection}
        >
          {t("cancel")}
        </button>
      );
      break;
    case "kickoff":
      small = t("kickoffSmall", {
        field: model.tokens.length,
        bench: benchCount,
      });
      main = t("kickoffText");
      button = (
        <button
          type="button"
          className={cn(styles.btn, styles.btnSm, styles.btnPrimary)}
          onClick={actions.onKickoff}
        >
          <Play size={16} {...ICON} />
          {t("kickoff")}
        </button>
      );
      break;
    case "halfTime":
      small = t("halfTimeSmall", {
        us: model.teamScore,
        them: model.opponentScore,
      });
      main = benchCount > 0 ? t("halfTimeText") : t("halfTimeNoBench");
      button = (
        <button
          type="button"
          className={cn(styles.btn, styles.btnSm, styles.btnPrimary)}
          onClick={actions.onStartSecondHalf}
        >
          <Play size={16} {...ICON} />
          {t("startSecondHalf")}
        </button>
      );
      break;
    case "fullTime":
      small = t("fullTimeSmall", {
        us: model.teamScore,
        them: model.opponentScore,
      });
      main = t("fullTimeText");
      button = (
        <button
          type="button"
          className={cn(styles.btn, styles.btnSm, styles.btnSecondary)}
          onClick={actions.onSetupNext}
        >
          {t("nextMatch")}
        </button>
      );
      break;
    case "timeUp":
      small = t("timeUpSmall", { minutes: model.halfMinutes });
      main = t("timeUpText");
      button = (
        <button
          type="button"
          className={cn(styles.btn, styles.btnSm, styles.btnSecondary)}
          onClick={actions.onRequestEndPhase}
        >
          {isLastPhase(model) ? t("endMatch") : t("endHalf")}
        </button>
      );
      break;
    case "suggestion": {
      const suggestion = model.suggestion;
      key = `suggestion-${suggestion?.incomingPlayerId}-${suggestion?.outgoingPlayerId}`;
      small = suggestion
        ? t("suggestionSmall", {
            inMinutes: suggestion.incomingMinutes,
            outMinutes: suggestion.outgoingMinutes,
          })
        : "";
      main = suggestion
        ? t("suggestionText", {
            in: suggestion.incomingName,
            out: suggestion.outgoingName,
          })
        : "";
      button = (
        <button
          type="button"
          className={cn(styles.btn, styles.btnSm, styles.btnPrimary)}
          aria-label={
            suggestion
              ? t("suggestionLabel", { out: suggestion.outgoingName })
              : undefined
          }
          onClick={actions.onSelectSuggestion}
        >
          <ArrowLeftRight size={18} {...ICON} />
          {t("suggestionAction")}
        </button>
      );
      break;
    }
    default:
      tone = "idle";
      small = t("idleSmall");
      main = benchCount > 0 ? t("idleText") : t("idleNoBench");
  }

  return (
    <>
      {/* One persistent polite announcer: the strip itself remounts on change. */}
      <div className="sr-only" aria-live="polite">
        {announce ?? main}
      </div>
      <div
        key={key}
        className={cn(
          styles.strip,
          styles.stripEnter,
          tone === "idle" && styles.stripIdle,
          tone === "inverse" && styles.stripInverse,
        )}
        data-testid="live-strip"
        data-strip={model.strip}
      >
        <span className={styles.stripText}>
          <small className={styles.stripSmall}>{small}</small>
          <b className={styles.stripMain}>{main}</b>
        </span>
        {button}
        {model.strip === "undo" && undo ? (
          <span key={undo.expiresAtMs} className={styles.drain} aria-hidden />
        ) : null}
      </div>
    </>
  );
}

interface BenchProps {
  model: LiveScreenModel;
  disabled: boolean;
  flashedPlayerId: string | null;
  onTapBenchPlayer: (playerId: string) => void;
  onBenchPointerDown: (playerId: string, event: React.PointerEvent) => void;
}

function Bench({
  model,
  disabled,
  flashedPlayerId,
  onTapBenchPlayer,
  onBenchPointerDown,
}: BenchProps) {
  const t = useTranslations("matchLive.sideline.bench");
  const benchRef = useRef<HTMLDivElement>(null);
  const count = model.bench.length;
  const dense = count >= 6;
  const fieldSelected = model.selectedFieldPlayerId !== null;
  const suggestedId =
    model.strip === "suggestion" ? model.suggestion?.incomingPlayerId : null;

  // Fit order: one content-sized row → tight row → dense grid; one-row mode
  // never wraps (prototype fitBench). Two hidden rows that never change mode
  // measure the one-row and tight widths, because re-measuring the live bench
  // after switching it out of the grid reads stale max-content widths. The
  // result is written to the DOM only when it changes, so React does not own
  // the attribute and nothing oscillates.
  const regularRef = useRef<HTMLDivElement>(null);
  const tightRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bench = benchRef.current;
    const regular = regularRef.current;
    const tight = tightRef.current;
    if (!bench || !regular || !tight) return;

    const available = bench.clientWidth + 0.5;
    const fit = dense
      ? null
      : regular.scrollWidth <= available
        ? null
        : tight.scrollWidth <= available
          ? "tight"
          : "dense";

    if (bench.getAttribute("data-fit") === fit) return;
    if (fit) bench.setAttribute("data-fit", fit);
    else bench.removeAttribute("data-fit");
  });

  if (count === 0) return null;

  const measureTiles = model.bench.map((tile) => (
    <span key={tile.playerId} className={styles.benchTile}>
      <span className={styles.benchName}>{tile.name}</span>
      {tile.number ? (
        <span className={styles.benchNumber}>{tile.number}</span>
      ) : null}
      <span className={styles.benchMinutes}>{tile.minutes}′</span>
    </span>
  ));

  return (
    <div className={styles.benchWrap}>
      <div
        ref={regularRef}
        className={cn(styles.bench, styles.benchMeasure)}
        aria-hidden
      >
        {measureTiles}
      </div>
      <div
        ref={tightRef}
        className={cn(styles.bench, styles.benchMeasure)}
        data-fit="tight"
        aria-hidden
      >
        {measureTiles}
      </div>
      <div
        ref={benchRef}
        className={cn(styles.bench, dense && styles.benchDense)}
        role="group"
        aria-label={t("label")}
        style={
          {
            "--cols-2": Math.max(1, Math.ceil(count / 2)),
            "--cols-3":
              count >= 7
                ? Math.ceil(count / 3)
                : Math.max(1, Math.ceil(count / 2)),
          } as React.CSSProperties
        }
      >
        {model.bench.map((tile) => {
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
                !fieldSelected &&
                  tile.playerId === suggestedId &&
                  styles.benchSuggested,
                tile.playerId === model.draggingBenchPlayerId &&
                  styles.benchDragging,
                tile.playerId === flashedPlayerId && styles.benchLanded,
              )}
              aria-label={label}
              disabled={disabled}
              onPointerDown={(event) =>
                onBenchPointerDown(tile.playerId, event)
              }
              onClick={() => onTapBenchPlayer(tile.playerId)}
            >
              <span className={styles.benchName}>{tile.name}</span>
              {tile.number ? (
                <span className={styles.benchNumber}>{tile.number}</span>
              ) : null}
              <span className={styles.benchMinutes}>{tile.minutes}′</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface DugoutProps extends StripActions {
  model: LiveScreenModel;
  undo: { secondsRemaining: number; expiresAtMs: number } | null;
  disabled: boolean;
  flashedPlayerId: string | null;
  onTapBenchPlayer: (playerId: string) => void;
  onBenchPointerDown: (playerId: string, event: React.PointerEvent) => void;
}

export function Dugout({
  model,
  undo,
  disabled,
  flashedPlayerId,
  onTapBenchPlayer,
  onBenchPointerDown,
  ...actions
}: DugoutProps) {
  return (
    <section className={styles.dugout}>
      <ActionStrip model={model} undo={undo} {...actions} />
      <Bench
        model={model}
        disabled={disabled}
        flashedPlayerId={flashedPlayerId}
        onTapBenchPlayer={onTapBenchPlayer}
        onBenchPointerDown={onBenchPointerDown}
      />
    </section>
  );
}
