"use client";

/** The real public-match presentation, driven solely by a fictional local clock. */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { PublicMatchHero } from "@/components/share/PublicMatchHero";
import { EventTimeline, type TimelineEntry } from "@/components/match/EventTimeline";
import type { PublicMatchShare } from "@/domain/matchShare";
import styles from "./Roadmap.module.css";

const BASE_TIME = Date.UTC(2026, 9, 26, 12, 0);
const LOOP_SECONDS = 22;
const GOAL_SECOND = 12;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (onChange: () => void) => {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const motionSnapshot = () => window.matchMedia(REDUCED_MOTION).matches;
const serverMotionSnapshot = () => true;

export function RoadmapShareDemo() {
  const t = useTranslations("marketing.roadmap.demo");
  const publicText = useTranslations("publicMatch");
  const locale = useLocale() as "no" | "en";
  const reducedMotion = useSyncExternalStore(subscribeMotion, motionSnapshot, serverMotionSnapshot);
  const [elapsed, setElapsed] = useState(0);
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLElement>(null);
  const paused = userPaused ?? reducedMotion;

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !visible) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setElapsed((seconds) => (seconds + 1) % LOOP_SECONDS);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [paused, visible]);

  const goal = elapsed >= GOAL_SECOND;
  const nowMs = BASE_TIME + elapsed * 1000;
  const fetchedAt = new Date(nowMs).toISOString();
  const goals: TimelineEntry[] = [
    { id: "first", minute: 8, side: "own", kind: "goal", primary: null, secondary: null },
    ...(goal ? [{ id: "second", minute: 17, side: "own" as const, kind: "goal" as const, primary: null, secondary: null }] : []),
  ];
  const share: PublicMatchShare = {
    phase: "live", teamName: t("team"), opponentName: t("opponent"), startsAt: null,
    shareLive: true, shareSummary: false, detailLevel: "result",
    score: { for: goal ? 2 : 1, against: 0 }, goals: goals.map(({ minute, side }) => ({ minute, side })), summary: null, lineup: null,
    live: {
      updatedAt: fetchedAt, phase: "first_half", status: "running", halves: 2,
      regularSecondsPerHalf: 1500, phaseStartedAtElapsedMs: 0,
      clock: { startedAtMs: BASE_TIME - 1008 * 1000, pausedAtMs: null, accumulatedPausedMs: 0, isRunning: true },
    },
  };

  return (
    <figure ref={root} className={styles.demo} aria-label={t("label")} data-testid="roadmap-share-demo" data-paused={paused || !visible}>
      <div className={styles.demoWindow}>
        <p className={styles.demoWindowTitle}>{t("audience")}</p>
        <PublicMatchHero share={share} locale={locale} nowMs={nowMs} fetchedAt={fetchedAt} headingLevel="h3" />
        <div className={styles.demoGoals}>
          <h3>{publicText("goalsTitle")}</h3>
          <EventTimeline entries={goals} opponentName={share.opponentName!} label={publicText("goalsLabel")} testId="roadmap-demo-goals" />
        </div>
      </div>
      <figcaption className={styles.demoCaption}>
        <button type="button" className={styles.demoToggle} disabled={!visible} onClick={() => setUserPaused(!paused)} aria-label={t(paused ? "play" : "pause")}>
          {paused ? <Play size={17} aria-hidden /> : <Pause size={17} aria-hidden />}
        </button>
        <div><p>{t(goal ? "goal" : "caption")}</p><p className={styles.demoDisclaimer}>{t("fictional")}</p></div>
      </figcaption>
    </figure>
  );
}
