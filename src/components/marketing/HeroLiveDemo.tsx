"use client";

/**
 * The hero's live demo (WEB-01 phase 1, MARKETING.md §5 and §8): the app's
 * own Scoreboard, Pitch and Dugout, driven by the scripted moment in
 * `liveDemoScript.ts`, next to a playing-time ledger that follows it.
 *
 * Not interactive yet (the tappable demo is WEB-01k): the screen is `inert`
 * and described in words. It plays only while on screen, pauses with the
 * button (WCAG 2.2.2), and with reduced motion it starts paused on the
 * suggestion and moves only when the visitor presses play.
 */

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { Scoreboard } from "@/components/live/Scoreboard";
import { Pitch } from "@/components/live/Pitch";
import { Dugout } from "@/components/live/Dugout";
import liveStyles from "@/components/live/LiveScreen.module.css";
import { cn } from "@/lib/utils";
import { DEMO_LOOP_SECONDS, demoFrame } from "./liveDemoScript";
import styles from "./Landing.module.css";

const noop = () => {};
const TICK_MS = 200;
const LEDGER_ROWS = 10;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function HeroLiveDemo() {
  const t = useTranslations("marketing.demo");
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [loop, setLoop] = useState(0);
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(false);

  const paused = userPaused ?? reducedMotion;
  const playing = visible && !paused;

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const timeRef = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = document.hidden ? 0 : (now - last) / 1000;
      last = now;
      const next = timeRef.current + delta;
      if (next < DEMO_LOOP_SECONDS) {
        timeRef.current = next;
      } else {
        timeRef.current = 0;
        setLoop((count) => count + 1);
      }
      setTime(timeRef.current);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  const frame = demoFrame(time);
  const { model } = frame;
  const rowIndex = new Map(frame.ledger.map((row, index) => [row.id, index]));
  // Squad order keeps the DOM stable; the rows move by transform only.
  const ledgerRows = [...frame.ledger].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div ref={rootRef} className={styles.demo} data-beat={frame.beat}>
      <figure className={styles.device} aria-label={t("label")}>
        <div className={styles.deviceScreen}>
          {/* The app's live screen, contained in the device instead of the viewport. */}
          <div
            key={loop}
            className={cn(liveStyles.live, styles.deviceLive)}
            style={{ position: "absolute", inset: 0, height: "100%", zIndex: 0 }}
            inert
            aria-hidden
          >
            <Scoreboard
              model={model}
              isOnline
              menuOpen={false}
              onClockPress={noop}
              onGoalUs={noop}
              onGoalThem={noop}
              onOpenMenu={noop}
            />
            <Pitch
              model={model}
              disabled={false}
              landedPlayerIds={frame.landedPlayerId ? [frame.landedPlayerId] : []}
              dropSlotId={null}
              onTapFieldPlayer={noop}
              onFieldPointerDown={noop}
              onBackgroundTap={noop}
            />
            <Dugout
              model={model}
              undo={frame.undo}
              disabled={false}
              flashedPlayerId={frame.flashedPlayerId}
              onTapBenchPlayer={noop}
              onBenchPointerDown={noop}
              onKickoff={noop}
              onStartSecondHalf={noop}
              onSetupNext={noop}
              onRequestEndPhase={noop}
              onSelectSuggestion={noop}
              onCancelSelection={noop}
              onStartPositionSwap={noop}
              onUndo={noop}
            />
          </div>
        </div>
        <figcaption className="sr-only">{t("description")}</figcaption>
      </figure>

      <aside className={styles.ledger} aria-label={t("ledgerTitle")}>
        <header className={styles.ledgerHead}>
          <div>
            <p className={styles.ledgerTitle}>{t("ledgerTitle")}</p>
            <p className={styles.ledgerSub}>{t("ledgerSub")}</p>
          </div>
          <p className={cn(styles.ledgerClock, "font-num")} aria-hidden>
            {model.clock}
          </p>
        </header>
        <ol className={styles.ledgerList} style={{ "--rows": LEDGER_ROWS } as React.CSSProperties} aria-hidden>
          {ledgerRows.map((row) => (
            <li
              key={row.id}
              className={cn(styles.ledgerRow, row.onField && styles.ledgerRowOn, frame.landedPlayerId === row.id && styles.ledgerRowIn)}
              style={{ "--i": rowIndex.get(row.id) } as React.CSSProperties}
            >
              <span className={styles.ledgerDot} />
              <span className={styles.ledgerName}>{row.name}</span>
              <span className={styles.ledgerState}>{row.isKeeper ? t("keeper") : row.onField ? t("onField") : t("onBench")}</span>
              <span className={cn(styles.ledgerMinutes, "font-num")}>
                <span key={row.minutes} className={styles.ledgerFigure}>
                  {row.minutes}
                </span>
                <span className={styles.ledgerUnit}>′</span>
              </span>
            </li>
          ))}
        </ol>
        <footer className={styles.ledgerFoot}>
          <span>{t("spread")}</span>
          <span className={cn(styles.ledgerSpread, "font-num")}>
            <span key={frame.spread} className={styles.ledgerFigure}>
              {frame.spread}
            </span>
            <span className={styles.ledgerUnit}>′</span>
          </span>
        </footer>
      </aside>

      <div className={styles.demoBar}>
        <button
          type="button"
          className={styles.demoToggle}
          onClick={() => setUserPaused(!paused)}
          aria-label={paused ? t("play") : t("pause")}
        >
          {paused ? <Play size={16} strokeWidth={1.75} aria-hidden /> : <Pause size={16} strokeWidth={1.75} aria-hidden />}
        </button>
        <p className={styles.demoCaption} aria-hidden>
          <span key={frame.beat} className={styles.demoCaptionText}>
            {t(`beats.${frame.beat}`)}
          </span>
        </p>
        <span className={styles.demoProgress} aria-hidden>
          <span className={styles.demoProgressFill} style={{ transform: `scaleX(${time / DEMO_LOOP_SECONDS})` }} />
        </span>
      </div>
    </div>
  );
}
