"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatchClockBasis } from "@/domain/liveMatch";

interface UseMatchClockArgs {
  clock: MatchClockBasis;
  refreshIntervalMs?: number;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onReset?: () => void;
}

interface UseMatchClockResult {
  elapsedMs: number;
  elapsedSeconds: number;
  isRunning: boolean;
  startedAtMs: number | null;
  nowMs: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
}

function computeElapsedMs(clock: MatchClockBasis, nowMs: number): number {
  if (clock.startedAtMs === null) {
    return 0;
  }

  const effectiveNowMs = clock.isRunning ? nowMs : (clock.pausedAtMs ?? nowMs);

  return Math.max(0, effectiveNowMs - clock.startedAtMs - Math.max(0, clock.accumulatedPausedMs));
}

export function useMatchClock({
  clock,
  refreshIntervalMs = 250,
  onStart,
  onPause,
  onResume,
  onReset,
}: UseMatchClockArgs): UseMatchClockResult {
  const intervalRef = useRef<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refreshNow = useCallback(() => {
    setNowMs(Date.now());
  }, []);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    clearTimer();

    if (clock.isRunning) {
      // Date.now is the source of truth so Safari/iOS timer throttling only delays repaint.
      intervalRef.current = window.setInterval(() => {
        refreshNow();
      }, refreshIntervalMs);
    }

    return () => {
      clearTimer();
    };
  }, [clearTimer, clock.isRunning, refreshIntervalMs, refreshNow]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleVisibilityOrFocus = () => {
      refreshNow();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshNow();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("pageshow", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("pageshow", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshNow]);

  const elapsedMs = useMemo(() => computeElapsedMs(clock, nowMs), [clock, nowMs]);

  const start = useCallback(() => {
    if (clock.startedAtMs === null) {
      onStart?.();
      return;
    }

    if (!clock.isRunning && clock.pausedAtMs !== null) {
      onResume?.();
    }
  }, [clock.isRunning, clock.pausedAtMs, clock.startedAtMs, onResume, onStart]);

  const pause = useCallback(() => {
    if (clock.isRunning) {
      onPause?.();
    }
  }, [clock.isRunning, onPause]);

  const resume = useCallback(() => {
    if (!clock.isRunning && clock.startedAtMs !== null && clock.pausedAtMs !== null) {
      onResume?.();
    }
  }, [clock.isRunning, clock.pausedAtMs, clock.startedAtMs, onResume]);

  const reset = useCallback(() => {
    // Reset always tears down any active interval before external reset side effects run.
    clearTimer();
    onReset?.();
  }, [clearTimer, onReset]);

  return {
    elapsedMs,
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    isRunning: clock.isRunning,
    startedAtMs: clock.startedAtMs,
    nowMs,
    start,
    pause,
    resume,
    reset,
  };
}
