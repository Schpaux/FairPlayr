"use client";

/**
 * Scoreboard (DESIGN.md §5.1): clock key, score, menu and goal keys on club
 * green. Pure presentation: every press calls a handler from the controller.
 */

import { CircleAlert, Ellipsis, Flag, Pause, Play, Plus, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { LiveScreenModel } from "@/components/live/liveScreenModel";
import { isInPlay } from "@/components/live/stripModel";
import styles from "@/components/live/LiveScreen.module.css";

const ICON = { strokeWidth: 1.75, "aria-hidden": true } as const;

interface ScoreboardProps {
  model: LiveScreenModel;
  isOnline: boolean;
  /**
   * The match cannot be saved on the device (DESIGN.md §5.6): the meta line
   * shows an alert glyph and «Ikke lagret» for as long as it lasts, even
   * after the band is dismissed. Takes priority over the offline glyph.
   */
  saveFailed?: boolean;
  menuOpen: boolean;
  onClockPress: () => void;
  onGoalUs: () => void;
  onGoalThem: () => void;
  onOpenMenu: () => void;
}

export function usePhaseLabel(model: Pick<LiveScreenModel, "phase" | "halves" | "status">) {
  const t = useTranslations("matchLive.sideline.phase");
  if (model.status === "ended" || model.phase === "full_time") return t("fullTime");
  if (model.phase === "half_time") return t("halfTime");
  if (model.halves === 1) return t("match");
  return model.phase === "second_half" ? t("secondHalf") : t("firstHalf");
}

export function Scoreboard({
  model,
  isOnline,
  saveFailed = false,
  menuOpen,
  onClockPress,
  onGoalUs,
  onGoalThem,
  onOpenMenu,
}: ScoreboardProps) {
  const t = useTranslations("matchLive.sideline");
  const tRestore = useTranslations("restore.storageError");
  const phaseLabel = usePhaseLabel(model);

  const inPlay = isInPlay(model);
  const isDone = model.status === "ended" || model.phase === "half_time";
  const isRunning = model.status === "running";
  const isPaused = !isRunning && !isDone;

  const duration = t("meta.duration", { halves: model.halves, minutes: model.halfMinutes });
  const metaText = isDone
    ? phaseLabel
    : model.status === "not_started"
      ? t("meta.ready", { duration })
      : isRunning
        ? t("meta.running", { phase: phaseLabel, minutes: model.halfMinutes })
        : t("meta.paused", { phase: phaseLabel });

  const baseClockLabel = isDone
    ? t("clock.done", { phase: phaseLabel, clock: model.clock })
    : model.status === "not_started"
      ? t("clock.kickoff")
      : isRunning
        ? t("clock.pause", { clock: model.clock })
        : t("clock.resume", { clock: model.clock });
  // The meta line sits inside the clock button, whose label replaces its
  // content for assistive tech: say "not saved" there too.
  const clockLabel = saveFailed ? `${baseClockLabel}, ${tRestore("short")}` : baseClockLabel;

  return (
    <header className={styles.board}>
      <div className={styles.boardRow}>
        <button
          type="button"
          className={cn(
            styles.clockKey,
            isPaused && styles.clockPaused,
            isDone && styles.clockDone,
            model.inStoppage && inPlay && styles.clockOver
          )}
          aria-label={clockLabel}
          aria-disabled={isDone || undefined}
          onClick={isDone ? undefined : onClockPress}
          data-testid="live-clock"
        >
          <span className={styles.clockDisc}>
            {isDone ? <Flag size={20} {...ICON} /> : isRunning ? <Pause size={20} {...ICON} /> : <Play size={20} {...ICON} />}
          </span>
          <span className={styles.clockText}>
            <b className={styles.clockDigits}>{model.clock}</b>
            <span className={styles.clockMeta} data-testid="live-meta">
              {saveFailed ? (
                <>
                  <span className={styles.saveFailed} aria-hidden>
                    <CircleAlert size={16} {...ICON} />
                  </span>
                  <span className={styles.saveFailedText}>{tRestore("short")}</span>
                </>
              ) : (
                <>
                  {isOnline ? (
                    <span className={styles.statusDot} aria-hidden />
                  ) : (
                    <span className={styles.offline} role="img" aria-label={t("meta.offline")}>
                      <WifiOff size={16} {...ICON} />
                    </span>
                  )}
                  {metaText}
                </>
              )}
            </span>
          </span>
        </button>

        <div
          className={styles.score}
          role="img"
          aria-label={t("score.label", { us: model.teamScore, them: model.opponentScore })}
          data-testid="live-score"
        >
          <span className={styles.scoreDigit}>{model.teamScore}</span>
          <span className={styles.scoreSep} />
          <span className={styles.scoreDigit}>{model.opponentScore}</span>
          <small className={styles.scoreLabel}>{t("score.us")}</small>
          <span />
          <small className={styles.scoreLabel}>{t("score.them")}</small>
        </div>

        <button
          type="button"
          className={styles.iconButton}
          aria-label={t("menu.open")}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={onOpenMenu}
          data-live-menu
        >
          <Ellipsis size={24} {...ICON} />
        </button>
      </div>

      <div className={styles.goals}>
        <button
          type="button"
          className={cn(styles.btn, styles.goalUs)}
          disabled={!inPlay}
          onClick={onGoalUs}
        >
          <Plus size={20} {...ICON} />
          {t("goals.us")}
        </button>
        <button
          type="button"
          className={cn(styles.btn, styles.goalThem)}
          disabled={!inPlay}
          onClick={onGoalThem}
        >
          <Plus size={20} {...ICON} />
          {t("goals.them")}
        </button>
      </div>
    </header>
  );
}
