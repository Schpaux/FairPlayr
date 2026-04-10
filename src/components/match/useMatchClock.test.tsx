import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { useMatchClock } from "@/components/match/useMatchClock";
import type { MatchClockBasis } from "@/domain/liveMatch";

function startClock(clock: MatchClockBasis, nowMs: number): MatchClockBasis {
  if (clock.startedAtMs === null) {
    return {
      startedAtMs: nowMs,
      pausedAtMs: null,
      accumulatedPausedMs: 0,
      isRunning: true,
    };
  }

  if (clock.isRunning) {
    return clock;
  }

  const pausedAtMs = clock.pausedAtMs ?? nowMs;

  return {
    startedAtMs: clock.startedAtMs,
    pausedAtMs: null,
    accumulatedPausedMs: clock.accumulatedPausedMs + Math.max(0, nowMs - pausedAtMs),
    isRunning: true,
  };
}

function pauseClock(clock: MatchClockBasis, nowMs: number): MatchClockBasis {
  if (!clock.isRunning || clock.startedAtMs === null) {
    return clock;
  }

  return {
    ...clock,
    pausedAtMs: nowMs,
    isRunning: false,
  };
}

function useClockHarness() {
  const [clock, setClock] = useState<MatchClockBasis>({
    startedAtMs: null,
    pausedAtMs: null,
    accumulatedPausedMs: 0,
    isRunning: false,
  });

  return useMatchClock({
    clock,
    refreshIntervalMs: 200,
    onStart: () => {
      setClock((previous) => startClock(previous, Date.now()));
    },
    onPause: () => {
      setClock((previous) => pauseClock(previous, Date.now()));
    },
    onResume: () => {
      setClock((previous) => startClock(previous, Date.now()));
    },
    onReset: () => {
      setClock({
        startedAtMs: null,
        pausedAtMs: null,
        accumulatedPausedMs: 0,
        isRunning: false,
      });
    },
  });
}

describe("useMatchClock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps time stable through start, pause, resume and cleans up intervals", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T10:00:00.000Z"));

    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");

    const { result, rerender, unmount } = renderHook(() => useClockHarness());

    expect(result.current.elapsedSeconds).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      result.current.start();
    });

    expect(result.current.isRunning).toBe(true);
    expect(result.current.startedAtMs).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(3200);
    });

    expect(result.current.elapsedSeconds).toBe(3);

    rerender();
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      result.current.pause();
    });

    expect(result.current.isRunning).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.elapsedSeconds).toBe(3);

    act(() => {
      result.current.resume();
    });

    expect(result.current.isRunning).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(2200);
    });

    expect(result.current.elapsedSeconds).toBe(5);
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    expect(clearIntervalSpy).toHaveBeenCalled();

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it("is idempotent for start/pause/resume and reset clears active timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T11:00:00.000Z"));

    const { result } = renderHook(() => useClockHarness());

    act(() => {
      result.current.start();
      result.current.start();
    });

    expect(result.current.isRunning).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      result.current.resume();
    });

    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      result.current.pause();
      result.current.pause();
    });

    expect(result.current.isRunning).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      result.current.reset();
    });

    expect(result.current.startedAtMs).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not leak intervals across unmount and remount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T12:00:00.000Z"));

    const first = renderHook(() => useClockHarness());

    act(() => {
      first.result.current.start();
    });

    expect(first.result.current.isRunning).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(4100);
    });

    expect(first.result.current.elapsedSeconds).toBe(4);
    expect(vi.getTimerCount()).toBe(1);

    first.unmount();

    expect(vi.getTimerCount()).toBe(0);

    const second = renderHook(() => useClockHarness());

    expect(second.result.current.elapsedSeconds).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      second.result.current.start();
    });

    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(second.result.current.elapsedSeconds).toBe(2);
    second.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
