import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLiveMatchFromSetup,
  endCurrentHalf,
  getElapsedSeconds,
  resumeLiveMatch,
  startLiveMatch,
  type LiveMatchState,
} from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import {
  getStoredLiveMatch,
  normalizeLiveMatchState,
  saveStoredLiveMatch,
} from "@/lib/storage/liveMatchStorage";

const STORAGE_KEY = "fairplayr.liveMatch.v1";

describe("liveMatchStorage normalization", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("normalizes legacy state and falls back safely when clock is missing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T13:00:00.000Z"));

    const legacy = {
      id: "lm-1",
      setupId: "setup-1",
      teamId: "team-1",
      durationSeconds: 3600,
      halves: 2,
      regularSecondsPerHalf: 1800,
      phase: "first_half",
      currentHalf: 1,
      elapsedSeconds: 90,
      phaseElapsedSeconds: 45,
      status: "running",
      teamScore: 1,
      opponentScore: 0,
      onFieldPlayerIds: ["p1"],
      benchPlayerIds: ["p2"],
      playerAccumulatedSeconds: {
        p1: 90,
        p2: 0,
      },
      startedAt: null,
      endedAt: null,
      createdAt: "2026-04-11T12:58:00.000Z",
      updatedAt: "2026-04-11T12:59:00.000Z",
    };

    const normalizedLegacy = normalizeLiveMatchState(legacy);

    expect(normalizedLegacy).not.toBeNull();
    expect(normalizedLegacy?.clock.isRunning).toBe(true);
    expect(normalizedLegacy?.clock.startedAtMs).not.toBeNull();
    expect(normalizedLegacy?.playerAccumulatedMs.p1).toBe(90000);

    const partialMissingClock = {
      id: "lm-2",
      setupId: "setup-2",
      teamId: "team-2",
      durationSeconds: 3600,
      halves: 2,
      regularSecondsPerHalf: 1800,
      phase: "first_half",
      currentHalf: 1,
      status: "paused",
      teamScore: 0,
      opponentScore: 0,
      elapsedSeconds: 120,
      onFieldPlayerIds: ["p1"],
      benchPlayerIds: ["p2"],
      playerAccumulatedMs: {
        p1: 120000,
        p2: 0,
      },
      onFieldStartedAtElapsedMs: {
        p1: null,
        p2: null,
      },
      createdAt: "2026-04-11T12:57:00.000Z",
      updatedAt: "2026-04-11T12:58:00.000Z",
    };

    const normalizedPartial = normalizeLiveMatchState(partialMissingClock);

    expect(normalizedPartial).not.toBeNull();
    expect(normalizedPartial?.clock.isRunning).toBe(false);
    expect(normalizedPartial?.clock.pausedAtMs).not.toBeNull();
  });

  it("uses clock as source of truth when elapsed fields conflict and handles stored partial legacy envelope", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T14:00:00.000Z"));

    const nowMs = Date.now();

    const conflicting = {
      id: "lm-3",
      setupId: "setup-3",
      teamId: "team-3",
      durationSeconds: 3600,
      halves: 2,
      regularSecondsPerHalf: 1800,
      phase: "first_half",
      currentHalf: 1,
      status: "running",
      teamScore: 0,
      opponentScore: 0,
      elapsedSeconds: 9999,
      onFieldPlayerIds: ["p1"],
      benchPlayerIds: ["p2"],
      playerAccumulatedMs: {
        p1: 0,
        p2: 0,
      },
      onFieldStartedAtElapsedMs: {
        p1: 0,
        p2: null,
      },
      clock: {
        startedAtMs: nowMs - 10000,
        pausedAtMs: null,
        accumulatedPausedMs: 0,
        isRunning: true,
      },
      createdAt: "2026-04-11T13:50:00.000Z",
      updatedAt: "2026-04-11T13:59:59.000Z",
    };

    const normalized = normalizeLiveMatchState(conflicting);

    expect(normalized).not.toBeNull();
    expect(getElapsedSeconds(normalized!, nowMs)).toBe(10);

    const storedEnvelope = {
      version: 1,
      liveMatch: {
        id: "lm-4",
        setupId: "setup-4",
        teamId: "team-4",
        durationSeconds: 2400,
        status: "paused",
        elapsedSeconds: 30,
        createdAt: "2026-04-11T13:00:00.000Z",
        updatedAt: "2026-04-11T13:10:00.000Z",
        onFieldPlayerIds: ["p1"],
        benchPlayerIds: ["p2"],
        playerAccumulatedSeconds: {
          p1: 30,
          p2: 0,
        },
      },
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedEnvelope));
    const hydrated = getStoredLiveMatch();

    expect(hydrated).not.toBeNull();
    expect(hydrated?.clock.isRunning).toBe(false);
    expect(hydrated?.clock.startedAtMs).not.toBeNull();
    expect(hydrated?.onFieldPlayerIds).toEqual(["p1"]);
  });
});

describe("liveMatchStorage half-time phases", () => {
  const MIN = 60_000;
  const KICKOFF = 1_000_000;
  const SETUP: MatchSetup = {
    id: "setup-1",
    teamId: "team-1",
    format: "5v5",
    reportEnabled: false,
    formationId: "5v5-2-2",
    duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
    selectedPlayerIds: ["p1", "p2", "p3", "p4", "p5", "p6"],
    startingPlayerIds: ["p1", "p2", "p3", "p4", "p5"],
    slotAssignments: { "5v5-1": "p1", "5v5-2": "p2", "5v5-3": "p3", "5v5-4": "p4", "5v5-5": "p5" },
    createdAt: "2026-04-15T10:00:00.000Z",
    updatedAt: "2026-04-15T10:00:00.000Z",
  };

  function halfTime(): LiveMatchState {
    return endCurrentHalf(startLiveMatch(createLiveMatchFromSetup(SETUP), KICKOFF), KICKOFF + 15 * MIN);
  }

  afterEach(() => {
    window.localStorage.clear();
  });

  it("keeps half-time and the second half across a reload", () => {
    saveStoredLiveMatch(halfTime());
    expect(getStoredLiveMatch()?.phase).toBe("half_time");

    const secondHalf = resumeLiveMatch(halfTime(), KICKOFF + 25 * MIN);
    saveStoredLiveMatch(secondHalf);
    const restored = getStoredLiveMatch();
    expect(restored?.phase).toBe("second_half");
    expect(restored?.currentHalf).toBe(2);
    expect(restored?.phaseStartedAtElapsedMs).toBe(15 * MIN);
    expect(restored?.clock).toEqual(secondHalf.clock);
  });

  it("repairs a second half stored in the half-time phase by earlier builds", () => {
    const base = halfTime();
    const stuck: LiveMatchState = {
      ...base,
      status: "running",
      clock: { ...base.clock, isRunning: true, pausedAtMs: null, accumulatedPausedMs: 10 * MIN },
    };

    saveStoredLiveMatch(stuck);
    expect(getStoredLiveMatch()).toMatchObject({ phase: "second_half", currentHalf: 2, status: "running" });

    // Server runtime state is normalized the same way.
    expect(normalizeLiveMatchState(JSON.parse(JSON.stringify(stuck)))?.phase).toBe("second_half");
  });

  it("repairs a legacy (elapsedSeconds) record resumed without leaving half-time", () => {
    // Legacy resumeLiveMatch set status "running" but kept phase "half_time";
    // phaseElapsedSeconds was reset to 0 at half-time, so 120 s were played since.
    const legacyStuck = {
      id: "lm-legacy-ht",
      setupId: "setup-1",
      teamId: "team-1",
      durationSeconds: 1800,
      halves: 2,
      regularSecondsPerHalf: 900,
      phase: "half_time",
      currentHalf: 1,
      elapsedSeconds: 1020,
      phaseElapsedSeconds: 120,
      status: "running",
      teamScore: 0,
      opponentScore: 0,
      onFieldPlayerIds: ["p1"],
      benchPlayerIds: ["p2"],
      playerAccumulatedSeconds: { p1: 1020, p2: 0 },
      startedAt: null,
      endedAt: null,
      createdAt: "2026-04-11T12:00:00.000Z",
      updatedAt: "2026-04-11T12:17:00.000Z",
    };

    expect(normalizeLiveMatchState(legacyStuck)).toMatchObject({
      phase: "second_half",
      currentHalf: 2,
      status: "running",
      phaseStartedAtElapsedMs: 900_000,
    });

    // A legacy record genuinely at half-time is left alone.
    const legacyHalfTime = { ...legacyStuck, status: "paused", phaseElapsedSeconds: 0, elapsedSeconds: 900 };
    expect(normalizeLiveMatchState(legacyHalfTime)?.phase).toBe("half_time");
  });
});
