import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLiveMatchFromSetup,
  getElapsedSeconds,
  getPlayerAccumulatedSeconds,
  pauseLiveMatch,
  startLiveMatch,
  substitutePlayers,
  updateScore,
  type LiveMatchState,
} from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import { createGoalEvent, createSubstitutionEvent } from "@/domain/matchEvent";
import {
  getStoredLiveMatch,
  LIVE_MATCH_STORAGE_KEY,
  saveStoredLiveMatch,
  trySaveStoredLiveMatch,
} from "@/lib/storage/liveMatchStorage";
import {
  getStorageSignalSnapshot,
  resetStorageSignalsForTests,
  StorageNewerVersionError,
} from "@/lib/storage/storageEnvelope";

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

/** A match with goals both ways (one with scorer/assist) and a substitution. */
function playedMatch(): { state: LiveMatchState; nowMs: number } {
  let state = startLiveMatch(createLiveMatchFromSetup(SETUP), KICKOFF);
  state = {
    ...updateScore(state, "team", 1),
    events: [
      ...state.events,
      createGoalEvent({
        minute: 3,
        timestampMs: KICKOFF + 3 * MIN,
        teamSide: "own",
        scorerPlayerId: "p4",
        scorerName: "Ida",
        assistPlayerId: "p5",
        assistName: "Selma",
      }),
    ],
  };
  state = {
    ...substitutePlayers(state, "p4", "p6", KICKOFF + 5 * MIN),
    events: [
      ...state.events,
      createSubstitutionEvent({ minute: 5, timestampMs: KICKOFF + 5 * MIN, inPlayerId: "p6", outPlayerId: "p4" }),
    ],
  };
  state = {
    ...updateScore(state, "opponent", 1),
    events: [...state.events, createGoalEvent({ minute: 7, timestampMs: KICKOFF + 7 * MIN, teamSide: "opponent" })],
  };
  return { state, nowMs: KICKOFF + 8 * MIN };
}

describe("liveMatchStorage version guard (OFF-01a)", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    resetStorageSignalsForTests();
  });

  it("migrates an older envelope forward and writes it back in the current version", () => {
    const { state } = playedMatch();
    window.localStorage.setItem(LIVE_MATCH_STORAGE_KEY, JSON.stringify({ version: 3, liveMatch: state }));

    const restored = getStoredLiveMatch();

    expect(restored?.id).toBe(state.id);
    expect(JSON.parse(window.localStorage.getItem(LIVE_MATCH_STORAGE_KEY)!).version).toBe(4);
  });

  it("reads a newer build's record tolerantly and never writes it back", () => {
    const { state } = playedMatch();
    const newer = JSON.stringify({
      version: 99,
      liveMatch: { ...state, someFutureField: { nested: true } },
      futureEnvelopeField: 1,
    });
    window.localStorage.setItem(LIVE_MATCH_STORAGE_KEY, newer);

    const restored = getStoredLiveMatch();

    expect(restored?.teamScore).toBe(1);
    expect(restored?.opponentScore).toBe(1);
    expect(window.localStorage.getItem(LIVE_MATCH_STORAGE_KEY)).toBe(newer);
    expect(getStorageSignalSnapshot().newerVersionKeys).toContain(LIVE_MATCH_STORAGE_KEY);

    // A later save from this (older) build is refused as well, and for a
    // throwing caller it is a failed write (FP-OFF-01 review finding 2).
    expect(() => saveStoredLiveMatch({ ...restored!, teamScore: 7 })).toThrow(StorageNewerVersionError);
    expect(trySaveStoredLiveMatch({ ...restored!, teamScore: 8 })).toEqual({ ok: false, reason: "newer_version" });
    expect(window.localStorage.getItem(LIVE_MATCH_STORAGE_KEY)).toBe(newer);
  });

  it("surfaces a quota error: saveStoredLiveMatch throws, trySaveStoredLiveMatch reports it", () => {
    const { state } = playedMatch();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    expect(() => saveStoredLiveMatch(state)).toThrow();
    expect(trySaveStoredLiveMatch(state)).toEqual({ ok: false, reason: "quota" });
    expect(getStorageSignalSnapshot().writeErrors[LIVE_MATCH_STORAGE_KEY]?.reason).toBe("quota");
  });

  it("restores score, scorers, events, pitch, bench and per-player minutes identically", () => {
    const { state, nowMs } = playedMatch();
    saveStoredLiveMatch(state);

    const restored = getStoredLiveMatch()!;

    expect(restored.teamScore).toBe(state.teamScore);
    expect(restored.opponentScore).toBe(state.opponentScore);
    expect(restored.events).toEqual(state.events);
    expect(restored.events.find((event) => event.type === "goal" && event.teamSide === "own")).toMatchObject({
      scorerPlayerId: "p4",
      scorerName: "Ida",
      assistPlayerId: "p5",
    });
    expect(restored.onFieldPlayerIds).toEqual(state.onFieldPlayerIds);
    expect(restored.benchPlayerIds).toEqual(state.benchPlayerIds);
    expect(restored.liveSlotAssignments).toEqual(state.liveSlotAssignments);
    for (const playerId of SETUP.selectedPlayerIds) {
      expect(getPlayerAccumulatedSeconds(restored, playerId, nowMs)).toBe(
        getPlayerAccumulatedSeconds(state, playerId, nowMs)
      );
    }
    // p4 played 5 minutes, p6 came on at 5'.
    expect(getPlayerAccumulatedSeconds(restored, "p4", nowMs)).toBe(5 * 60);
    expect(getPlayerAccumulatedSeconds(restored, "p6", nowMs)).toBe(3 * 60);
  });

  it("a running clock includes the time the app was closed; a paused one does not move", () => {
    const { state } = playedMatch();
    saveStoredLiveMatch(state);
    const closedFor = 7 * MIN;
    const reopenedAt = KICKOFF + 8 * MIN + closedFor;

    const running = getStoredLiveMatch()!;
    expect(getElapsedSeconds(running, reopenedAt)).toBe((8 * MIN + closedFor) / 1000);
    expect(getPlayerAccumulatedSeconds(running, "p6", reopenedAt)).toBe((3 * MIN + closedFor) / 1000);

    saveStoredLiveMatch(pauseLiveMatch(state, KICKOFF + 8 * MIN));
    const paused = getStoredLiveMatch()!;
    expect(paused.clock.isRunning).toBe(false);
    expect(getElapsedSeconds(paused, reopenedAt)).toBe(8 * 60);
  });
});
