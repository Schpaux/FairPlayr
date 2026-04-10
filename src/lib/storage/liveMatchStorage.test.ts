import { getElapsedSeconds } from "@/domain/liveMatch";
import {
  getStoredLiveMatch,
  normalizeLiveMatchState,
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
