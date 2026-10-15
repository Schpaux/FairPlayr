"use client";

/**
 * Modern Sideline live screen (DESIGN.md §5), behind NEXT_PUBLIC_LIVE_UI.
 *
 * View only. MatchLiveManager stays the controller: it owns state, timers,
 * persistence, server sync and completion, and passes its existing handlers
 * in. The only state here is which sheet is open.
 *
 * The screen covers the app chrome (header, banner, bottom nav) as a fixed
 * full-screen layer. Moving /match/live into its own route group is a later,
 * separately reviewed step (IMPLEMENTATION-PLAN.md step 2).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { LiveScreenModel } from "@/components/live/liveScreenModel";
import { Scoreboard } from "@/components/live/Scoreboard";
import { Pitch } from "@/components/live/Pitch";
import { Dugout } from "@/components/live/Dugout";
import {
  ConfirmSheet,
  EventsSheet,
  GoalContributorSheet,
  MenuSheet,
  type GoalPromptView,
} from "@/components/live/LiveSheets";
import { LiveNotices, type LiveNoticesProps } from "@/components/live/LiveNotices";
import { isLastPhase } from "@/components/live/stripModel";
import { cn } from "@/lib/utils";
import styles from "@/components/live/LiveScreen.module.css";

export interface LiveScreenHandlers {
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onEndHalf: () => void;
  /** The existing end-match flow (it asks for confirmation itself). */
  onEndMatch: () => void;
  onGoalUs: () => void;
  onGoalThem: () => void;
  onRemoveGoalUs: () => void;
  onRemoveGoalThem: () => void;
  onTapFieldPlayer: (playerId: string) => void;
  onTapBenchPlayer: (playerId: string) => void;
  onCancelSelection: () => void;
  onUndo: () => void;
  onBenchPointerDown: (playerId: string, event: React.PointerEvent) => void;
  pointerSurfaceHandlers: {
    onPointerMove: (event: React.PointerEvent) => void;
    onPointerUp: (event: React.PointerEvent) => void;
    onPointerCancel: () => void;
  };
  onSetupNext: () => void;
  onPickGoalContributor: (playerId: string | null) => void;
}

export interface LiveScreenProps {
  model: LiveScreenModel;
  handlers: LiveScreenHandlers;
  isOnline: boolean;
  undo: { secondsRemaining: number; expiresAtMs: number } | null;
  ghost: { name: string; x: number; y: number } | null;
  goalPrompt: GoalPromptView | null;
  notices: LiveNoticesProps;
  ending: { done: boolean } | null;
}

type OpenSheet = "menu" | "events" | "confirmEndHalf" | "confirmRemoveGoalUs" | "confirmRemoveGoalThem";

export function LiveScreen({ model, handlers, isOnline, undo, ghost, goalPrompt, notices, ending }: LiveScreenProps) {
  const t = useTranslations("matchLive");
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const isEnded = model.status === "ended";
  const inHalf = model.status === "running" || model.status === "paused";
  const canEndHalf = model.halves === 2 && model.phase === "first_half" && inHalf;

  const openSheet = (next: OpenSheet) => {
    if (sheet === null && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
    }
    setSheet(next);
  };

  const closeSheet = useCallback(() => setSheet(null), []);

  // Return focus to the control that opened the sheet, or to the menu button.
  const hadSheet = useRef(false);
  useEffect(() => {
    const hasSheet = sheet !== null || goalPrompt !== null;
    if (hadSheet.current && !hasSheet) {
      const target =
        returnFocusRef.current?.isConnected
          ? returnFocusRef.current
          : rootRef.current?.querySelector<HTMLElement>("[data-live-menu]");
      target?.focus({ preventScroll: true });
      returnFocusRef.current = null;
    }
    hadSheet.current = hasSheet;
  }, [sheet, goalPrompt]);

  const runAndClose = (action: () => void) => () => {
    setSheet(null);
    action();
  };

  const onClockPress = () => {
    if (model.status === "not_started") handlers.onStart();
    else if (model.status === "running") handlers.onPause();
    else if (model.status === "paused") handlers.onResume();
  };

  const landed = model.strip === "undo" ? model.lastSubstitution : null;
  const scoreAfterRemoval = (side: "us" | "them") =>
    t("sideline.confirm.removeGoalBody", {
      us: side === "us" ? Math.max(0, model.teamScore - 1) : model.teamScore,
      them: side === "them" ? Math.max(0, model.opponentScore - 1) : model.opponentScore,
    });

  return (
    <div
      ref={rootRef}
      className={cn(styles.live, model.density !== "regular" && styles[model.density])}
      data-testid="live-sideline"
      data-density={model.density}
      {...handlers.pointerSurfaceHandlers}
    >
      <Scoreboard
        model={model}
        isOnline={isOnline}
        menuOpen={sheet !== null}
        onClockPress={onClockPress}
        onGoalUs={handlers.onGoalUs}
        onGoalThem={handlers.onGoalThem}
        onOpenMenu={() => openSheet("menu")}
      />

      <Pitch
        model={model}
        disabled={isEnded}
        landedPlayerId={landed?.inPlayerId ?? null}
        onTapFieldPlayer={handlers.onTapFieldPlayer}
        onBackgroundTap={handlers.onCancelSelection}
      >
        <LiveNotices {...notices} />
      </Pitch>

      <Dugout
        model={model}
        undo={undo}
        disabled={isEnded}
        flashedPlayerId={landed?.outPlayerId ?? null}
        onTapBenchPlayer={handlers.onTapBenchPlayer}
        onBenchPointerDown={handlers.onBenchPointerDown}
        onKickoff={handlers.onStart}
        onStartSecondHalf={handlers.onStart}
        onSetupNext={handlers.onSetupNext}
        onRequestEndPhase={() => (isLastPhase(model) ? handlers.onEndMatch() : openSheet("confirmEndHalf"))}
        onSelectSuggestion={() => {
          if (model.suggestion) handlers.onTapFieldPlayer(model.suggestion.outgoingPlayerId);
        }}
        onCancelSelection={handlers.onCancelSelection}
        onUndo={handlers.onUndo}
      />

      {ghost ? (
        <div className={styles.ghost} style={{ left: ghost.x, top: ghost.y }} aria-hidden>
          {ghost.name}
        </div>
      ) : null}

      {sheet === "menu" ? (
        <MenuSheet
          isOnline={isOnline}
          canEndHalf={canEndHalf}
          canRemoveGoalUs={model.teamScore > 0 && !isEnded}
          canRemoveGoalThem={model.opponentScore > 0 && !isEnded}
          canEndMatch={!isEnded}
          onClose={closeSheet}
          onEvents={() => setSheet("events")}
          onEndHalf={() => setSheet("confirmEndHalf")}
          onRemoveGoalUs={() => setSheet("confirmRemoveGoalUs")}
          onRemoveGoalThem={() => setSheet("confirmRemoveGoalThem")}
          onEndMatch={runAndClose(handlers.onEndMatch)}
        />
      ) : null}

      {sheet === "events" ? <EventsSheet events={model.events} onClose={closeSheet} /> : null}

      {sheet === "confirmEndHalf" ? (
        <ConfirmSheet
          title={t("sideline.confirm.endHalfTitle")}
          lede={t("sideline.confirm.endHalfBody")}
          confirmLabel={t("sideline.confirm.endHalfConfirm")}
          onConfirm={runAndClose(handlers.onEndHalf)}
          onClose={closeSheet}
        />
      ) : null}

      {sheet === "confirmRemoveGoalUs" ? (
        <ConfirmSheet
          title={t("sideline.confirm.removeGoalUsTitle")}
          lede={scoreAfterRemoval("us")}
          confirmLabel={t("sideline.confirm.removeGoalConfirm")}
          destructive
          onConfirm={runAndClose(handlers.onRemoveGoalUs)}
          onClose={closeSheet}
        />
      ) : null}

      {sheet === "confirmRemoveGoalThem" ? (
        <ConfirmSheet
          title={t("sideline.confirm.removeGoalThemTitle")}
          lede={scoreAfterRemoval("them")}
          confirmLabel={t("sideline.confirm.removeGoalConfirm")}
          destructive
          onConfirm={runAndClose(handlers.onRemoveGoalThem)}
          onClose={closeSheet}
        />
      ) : null}

      {goalPrompt ? <GoalContributorSheet prompt={goalPrompt} onPick={handlers.onPickGoalContributor} /> : null}

      {ending ? (
        <div className={styles.ending} role="status">
          <p className={styles.endingTitle}>{ending.done ? t("endingSequence.done") : t("endingSequence.title")}</p>
          <p className={styles.noticeBody}>{t("endingSequence.subtitle")}</p>
        </div>
      ) : null}
    </div>
  );
}
