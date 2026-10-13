import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeAppShell } from "@/components/layout/NativeAppShell";
import { OfflineIndicator } from "@/components/layout/OfflineIndicator";
import { useMatchClock } from "@/components/match/useMatchClock";
import type { MatchClockBasis } from "@/domain/liveMatch";
import en from "../../../messages/en.json";
import no from "../../../messages/no.json";

let online = true;

function goOffline() {
  online = false;
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
}

function goOnline() {
  online = true;
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
}

let mountCount = 0;
let unmountCount = 0;

/** Stand-in for the live match view: local state + a running match clock. */
function FakeLiveMatch() {
  const [score, setScore] = useState(0);
  const [clock, setClock] = useState<MatchClockBasis>({
    startedAtMs: null,
    pausedAtMs: null,
    accumulatedPausedMs: 0,
    isRunning: false,
  });
  const matchClock = useMatchClock({
    clock,
    refreshIntervalMs: 200,
    onStart: () =>
      setClock({
        startedAtMs: Date.now(),
        pausedAtMs: null,
        accumulatedPausedMs: 0,
        isRunning: true,
      }),
  });

  useEffect(() => {
    mountCount += 1;
    return () => {
      unmountCount += 1;
    };
  }, []);

  return (
    <div>
      <button type="button" onClick={() => setScore((value) => value + 1)}>
        goal
      </button>
      <button type="button" onClick={matchClock.start}>
        start
      </button>
      <span data-testid="score">{score}</span>
      <span data-testid="elapsed">{matchClock.elapsedSeconds}</span>
    </div>
  );
}

function renderShell(locale: "en" | "no" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : no}>
      <NativeAppShell>
        {/* Mirrors the layout: the indicator lives in the Header, a sibling of the page. */}
        <header>
          <OfflineIndicator />
        </header>
        <FakeLiveMatch />
      </NativeAppShell>
    </NextIntlClientProvider>
  );
}

describe("NativeAppShell offline resilience", () => {
  beforeEach(() => {
    online = true;
    mountCount = 0;
    unmountCount = 0;
    vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps the child tree mounted with its state when connectivity drops and returns", () => {
    renderShell();

    fireEvent.click(screen.getByText("goal"));
    fireEvent.click(screen.getByText("goal"));
    expect(screen.getByTestId("score").textContent).toBe("2");

    goOffline();

    expect(screen.getByText("goal")).toBeTruthy();
    expect(screen.getByTestId("score").textContent).toBe("2");

    // Score controls still work while offline.
    fireEvent.click(screen.getByText("goal"));
    expect(screen.getByTestId("score").textContent).toBe("3");

    goOnline();

    expect(screen.getByTestId("score").textContent).toBe("3");
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);
  });

  it("shows the offline indicator in the header only while offline", () => {
    renderShell();

    // The live region stays mounted (empty, visually hidden) so changes are announced.
    const indicator = screen.getByRole("status");
    expect(indicator.textContent).toBe("");
    expect(indicator.className).toContain("sr-only");

    goOffline();

    expect(screen.getByRole("status")).toBe(indicator);
    expect(indicator.textContent).toContain(en.native.offline.label);
    expect(indicator.textContent).toContain(en.native.offline.detail);
    expect(indicator.closest("header")).not.toBeNull();
    // In-flow inside the header, never floating over the scoreboard or timer.
    expect(indicator.className).not.toMatch(/\b(fixed|absolute)\b/);
    expect(indicator.className).not.toContain("shadow");

    goOnline();

    expect(indicator.textContent).toBe("");
  });

  it("renders the indicator on first paint when the app starts offline", () => {
    online = false;
    renderShell();

    expect(screen.getByRole("status").textContent).toContain(en.native.offline.label);
    expect(screen.getByText("goal")).toBeTruthy();
  });

  it("localises the indicator via next-intl", () => {
    renderShell("no");
    goOffline();

    expect(screen.getByRole("status").textContent).toContain(no.native.offline.label);
  });

  it("does not interrupt a running match clock across offline/online transitions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T10:00:00.000Z"));

    renderShell();
    fireEvent.click(screen.getByText("start"));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId("elapsed").textContent).toBe("5");

    goOffline();
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByTestId("elapsed").textContent).toBe("15");

    goOnline();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId("elapsed").textContent).toBe("18");
    expect(unmountCount).toBe(0);
  });
});
