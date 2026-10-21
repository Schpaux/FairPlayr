import { describe, expect, it } from "vitest";
import {
  createLiveMatchFromSetup,
  endCurrentHalf,
  endLiveMatch,
  startLiveMatch,
  substitutePlayers,
  type LiveMatchState,
} from "@/domain/liveMatch";
import type { MatchFormat, MatchSetup } from "@/domain/match";
import { sumSeasonPlayingTime, summarizeMatchPlayingTime } from "@/domain/matchPlayingTime";

const MIN = 60_000;
const T0 = 1_000_000;

function makeSetup(format: MatchFormat, squad: number, minutesPerHalf: number): MatchSetup {
  const fieldCount = Number(format.split("v")[0]);
  const selectedPlayerIds = Array.from({ length: squad }, (_, index) => `p${index + 1}`);
  const startingPlayerIds = selectedPlayerIds.slice(0, fieldCount);

  return {
    id: "setup-1",
    teamId: "team-1",
    format,
    reportEnabled: false,
    formationId: `${format}-x`,
    duration: { mode: "custom", presetId: null, halves: 2, minutesPerHalf, totalMinutes: minutesPerHalf * 2 },
    selectedPlayerIds,
    startingPlayerIds,
    slotAssignments: Object.fromEntries(startingPlayerIds.map((id, index) => [`${format}-${index + 1}`, id])),
    createdAt: "2026-10-21T10:00:00.000Z",
    updatedAt: "2026-10-21T10:00:00.000Z",
  };
}

/** What the server stores: the state as JSON. */
function stored(state: LiveMatchState): unknown {
  return JSON.parse(JSON.stringify(state)) as unknown;
}

/**
 * 5v5, 2 × 15, squad of 7: p6 replaces p5 after 10 minutes, p7 never plays.
 * Half-time is a 5-minute break on the wall clock, which the match clock skips.
 */
function playedFiveVFive(): LiveMatchState {
  let state = createLiveMatchFromSetup(makeSetup("5v5", 7, 15));
  state = startLiveMatch(state, T0);
  state = substitutePlayers(state, "p5", "p6", T0 + 10 * MIN);
  state = endCurrentHalf(state, T0 + 15 * MIN);
  state = startLiveMatch(state, T0 + 20 * MIN);
  return endLiveMatch(state, T0 + 35 * MIN);
}

function minutesById(summary: ReturnType<typeof summarizeMatchPlayingTime>) {
  return Object.fromEntries((summary?.players ?? []).map((player) => [player.playerId, player.minutes]));
}

describe("summarizeMatchPlayingTime", () => {
  it("lists a squad player who never came on with 0 minutes", () => {
    const summary = summarizeMatchPlayingTime(stored(playedFiveVFive()), { nowMs: T0 + 99 * MIN });

    const unused = summary?.players.find((player) => player.playerId === "p7");
    expect(unused).toEqual({ playerId: "p7", seconds: 0, minutes: 0, role: "unused", gapMinutes: -21 });
    expect(summary?.players).toHaveLength(7);
  });

  it("credits players still on the field at the final whistle with their last spell", () => {
    const state = playedFiveVFive();
    // The raw total misses the open spell: the bug behind hidden full-match players.
    expect(state.playerAccumulatedMs.p1).toBe(0);

    const summary = summarizeMatchPlayingTime(stored(state), { nowMs: T0 + 99 * MIN });

    expect(minutesById(summary)).toEqual({ p1: 30, p2: 30, p3: 30, p4: 30, p5: 10, p6: 20, p7: 0 });
  });

  it("orders least played first, equal minutes in squad order", () => {
    const summary = summarizeMatchPlayingTime(stored(playedFiveVFive()), { nowMs: T0 });

    expect(summary?.players.map((player) => player.playerId)).toEqual(["p7", "p5", "p6", "p1", "p2", "p3", "p4"]);
  });

  it("tells starters, substitutes and unused players apart", () => {
    const summary = summarizeMatchPlayingTime(stored(playedFiveVFive()), { nowMs: T0 });
    const roles = Object.fromEntries((summary?.players ?? []).map((player) => [player.playerId, player.role]));

    expect(roles).toEqual({
      p1: "starter",
      p2: "starter",
      p3: "starter",
      p4: "starter",
      p5: "starter",
      p6: "substitute",
      p7: "unused",
    });
    expect(summary?.gaps).toEqual([]);
  });

  it("computes fair share over the whole squad and credits nobody with time they did not play", () => {
    const summary = summarizeMatchPlayingTime(stored(playedFiveVFive()), { nowMs: T0 });

    // 5 on the field × 30 played ÷ 7 in the squad (the unused player counts).
    expect(summary?.fairShare).toEqual({
      fieldSlots: 5,
      squadSize: 7,
      playedSeconds: 30 * 60,
      playedMinutes: 30,
      seconds: Math.round((5 * 30 * 60) / 7),
      minutes: 21,
    });
    // Total player time is exactly field slots × match time: no spell counted twice.
    const total = summary!.players.reduce((sum, player) => sum + player.seconds, 0);
    expect(total).toBe(5 * 30 * 60);
    expect(summary?.players.find((player) => player.playerId === "p5")?.seconds).toBe(10 * 60);
    expect(summary?.players.find((player) => player.playerId === "p6")?.gapMinutes).toBe(-1);
  });

  it.each([
    // format, squad, minutes per half, expected fair share
    ["7v7", 10, 20, 28],
    ["9v9", 12, 25, 38],
    ["11v11", 14, 30, 47],
  ] as const)("uses the %s field count with a squad of %i", (format, squad, half, expected) => {
    let state = createLiveMatchFromSetup(makeSetup(format, squad, half));
    state = startLiveMatch(state, T0);
    state = endLiveMatch(state, T0 + 2 * half * MIN);

    const summary = summarizeMatchPlayingTime(stored(state), { nowMs: T0 });

    expect(summary?.fairShare?.fieldSlots).toBe(Number(format.split("v")[0]));
    expect(summary?.fairShare?.minutes).toBe(expected);
    expect(summary?.players).toHaveLength(squad);
  });

  it("caps fair share at the match time when the squad is no bigger than the field", () => {
    let state = createLiveMatchFromSetup(makeSetup("3v3", 3, 10));
    state = startLiveMatch(state, T0);
    state = endLiveMatch(state, T0 + 20 * MIN);

    const summary = summarizeMatchPlayingTime(stored(state), { nowMs: T0 });

    expect(summary?.fairShare?.minutes).toBe(20);
    expect(summary?.players.every((player) => player.gapMinutes === 0)).toBe(true);
  });

  it("counts a running match up to now", () => {
    const state = startLiveMatch(createLiveMatchFromSetup(makeSetup("5v5", 6, 15)), T0);

    const summary = summarizeMatchPlayingTime(stored(state), { nowMs: T0 + 12 * MIN });

    expect(minutesById(summary)).toMatchObject({ p1: 12, p6: 0 });
    expect(summary?.fairShare?.playedMinutes).toBe(12);
  });

  it("takes the format from the match when the stored state has none", () => {
    const state = stored(playedFiveVFive()) as Record<string, unknown>;
    delete state.format;

    expect(summarizeMatchPlayingTime(state, { nowMs: T0 })?.fairShare).toBeNull();
    expect(summarizeMatchPlayingTime(state, { nowMs: T0, format: "5v5" })?.fairShare?.minutes).toBe(21);
  });

  describe("incomplete historic data", () => {
    it("returns null when nothing about the squad was recorded", () => {
      expect(summarizeMatchPlayingTime(null, { nowMs: T0 })).toBeNull();
      expect(summarizeMatchPlayingTime({}, { nowMs: T0 })).toBeNull();
      expect(summarizeMatchPlayingTime("garbage", { nowMs: T0 })).toBeNull();
      expect(summarizeMatchPlayingTime({ playerAccumulatedMs: {} }, { nowMs: T0 })).toBeNull();
    });

    it("marks roles unknown without a starting lineup instead of guessing", () => {
      const state = stored(playedFiveVFive()) as Record<string, unknown>;
      delete state.initialOnFieldPlayerIds;

      const summary = summarizeMatchPlayingTime(state, { nowMs: T0 });

      expect(summary?.gaps).toEqual(["startersMissing"]);
      expect(summary?.players.every((player) => player.role === "unknown")).toBe(true);
      expect(minutesById(summary).p7).toBe(0);
    });

    it("keeps only recorded time when the clock is missing, and says so", () => {
      const state = stored(playedFiveVFive()) as Record<string, unknown>;
      delete state.clock;

      const summary = summarizeMatchPlayingTime(state, { nowMs: T0 });

      expect(summary?.gaps).toEqual(["openSpellsMissing"]);
      expect(summary?.fairShare).toBeNull();
      expect(minutesById(summary)).toMatchObject({ p1: 0, p5: 10, p6: 0, p7: 0 });
      // Those on the field at the end are a lower bound only; the others are exact.
      const incomplete = summary?.players.filter((player) => player.incomplete).map((player) => player.playerId);
      expect(incomplete?.sort()).toEqual(["p1", "p2", "p3", "p4", "p6"]);
      expect(summary?.players.every((player) => player.gapMinutes === null)).toBe(true);
    });

    it("reads a completed match's still-running clock at its last save, never at now", () => {
      // Completed on the server with a snapshot saved 12 minutes in, clock running.
      const running = startLiveMatch(createLiveMatchFromSetup(makeSetup("5v5", 6, 15)), T0);
      const state: Record<string, unknown> = { ...(stored(running) as Record<string, unknown>), updatedAt: new Date(T0 + 12 * MIN).toISOString() };
      const threeDaysLater = T0 + 3 * 24 * 60 * MIN;

      const summary = summarizeMatchPlayingTime(state, { nowMs: threeDaysLater, completed: true });

      expect(summary?.gaps).toEqual(["clockNotStopped"]);
      expect(minutesById(summary)).toMatchObject({ p1: 12, p6: 0 });
      expect(summary?.fairShare?.playedMinutes).toBe(12);

      delete state.updatedAt;
      const unknown = summarizeMatchPlayingTime(state, { nowMs: threeDaysLater, completed: true });
      expect(unknown?.gaps).toEqual(["openSpellsMissing"]);
      expect(unknown?.fairShare).toBeNull();
      expect(minutesById(unknown).p1).toBe(0);
    });

    it("treats a stopped clock without its stop time as unmeasurable once the match is over", () => {
      const state = stored(playedFiveVFive()) as Record<string, unknown>;
      (state.clock as Record<string, unknown>).pausedAtMs = null;

      const summary = summarizeMatchPlayingTime(state, { nowMs: T0 + 99 * MIN, completed: true });

      expect(summary?.gaps).toEqual(["openSpellsMissing"]);
      expect(summary?.fairShare).toBeNull();
      expect(minutesById(summary)).toMatchObject({ p1: 0, p5: 10 });
    });

    it("never adds players who are not in the stored squad", () => {
      const state = stored(playedFiveVFive()) as Record<string, unknown>;
      // A goal or substitution event naming someone else does not make them part of the squad.
      (state.events as unknown[]).push({ type: "substitution", inPlayerId: "outsider", outPlayerId: "p1" });

      const summary = summarizeMatchPlayingTime(state, { nowMs: T0 });

      expect(summary?.players.map((player) => player.playerId)).not.toContain("outsider");
      expect(summary?.players).toHaveLength(7);
    });

    it("reads the early whole-seconds format as recorded and flags it", () => {
      const legacy = {
        status: "ended",
        format: "5v5",
        elapsedSeconds: 1800,
        onFieldPlayerIds: ["a", "b", "c", "d", "e"],
        benchPlayerIds: ["f"],
        playerAccumulatedSeconds: { a: 1800, b: 1800, c: 1800, d: 1800, e: 900, f: 900 },
      };

      const summary = summarizeMatchPlayingTime(legacy, { nowMs: T0 });

      expect(summary?.gaps).toEqual(["legacyFormat", "startersMissing"]);
      expect(minutesById(summary)).toEqual({ a: 30, b: 30, c: 30, d: 30, e: 15, f: 15 });
      expect(summary?.fairShare?.minutes).toBe(25);
    });
  });
});

describe("sumSeasonPlayingTime", () => {
  /**
   * 7v7, 2 × 20, squad of 9: p8 replaces p6 at 12′, p9 replaces p8 at 30′,
   * and p6 comes back on for p9 at 35′ (a second spell).
   */
  function sevenVSeven(): LiveMatchState {
    let state = createLiveMatchFromSetup(makeSetup("7v7", 9, 20));
    state = startLiveMatch(state, T0);
    state = substitutePlayers(state, "p6", "p8", T0 + 12 * MIN);
    state = endCurrentHalf(state, T0 + 20 * MIN);
    state = startLiveMatch(state, T0 + 30 * MIN);
    state = substitutePlayers(state, "p8", "p9", T0 + 40 * MIN);
    state = substitutePlayers(state, "p9", "p6", T0 + 45 * MIN);
    return endLiveMatch(state, T0 + 50 * MIN);
  }

  it("adds each match's details-page totals once per player", () => {
    const first = stored(playedFiveVFive()); // 5v5: p1–p4 30′, p5 10′, p6 20′, p7 0′
    const second = stored(sevenVSeven()); // 7v7: p1–p5, p7 40′, p6 12′ + 5′, p8 18′, p9 5′

    const season = sumSeasonPlayingTime([first, second], { nowMs: T0 });
    const minutes = Object.fromEntries([...season.seconds].map(([id, seconds]) => [id, seconds / 60]));

    expect(season).toMatchObject({ countedMatches: 2, skippedMatches: 0 });
    expect(minutes).toEqual({ p1: 70, p2: 70, p3: 70, p4: 70, p5: 50, p6: 37, p7: 40, p8: 18, p9: 5 });
    // Every counted second is a played second: 5 × 30 + 7 × 40.
    expect([...season.seconds.values()].reduce((sum, value) => sum + value, 0)).toBe((5 * 30 + 7 * 40) * 60);
  });

  it("keeps squad players who never came on, at 0", () => {
    const season = sumSeasonPlayingTime([stored(playedFiveVFive())], { nowMs: T0 });

    expect(season.seconds.get("p7")).toBe(0);
    expect(season.seconds.size).toBe(7);
  });

  it("counts a match stored twice in the list twice, and nothing else twice", () => {
    // Totals are per stored match row; the caller passes each completed match once.
    const match = stored(playedFiveVFive());
    const season = sumSeasonPlayingTime([match, match], { nowMs: T0 });

    expect(season.countedMatches).toBe(2);
    expect(season.seconds.get("p1")).toBe(2 * 30 * 60);
  });

  it("leaves out matches it cannot support, for everyone in them", () => {
    const noClock = stored(playedFiveVFive()) as Record<string, unknown>;
    delete noClock.clock;
    const legacy = {
      onFieldPlayerIds: ["p1"],
      benchPlayerIds: [],
      elapsedSeconds: 600,
      playerAccumulatedSeconds: { p1: 600 },
    };

    const season = sumSeasonPlayingTime([noClock, legacy, null, "garbage", stored(playedFiveVFive())], { nowMs: T0 });

    expect(season).toMatchObject({ countedMatches: 1, skippedMatches: 4 });
    expect(season.seconds.get("p1")).toBe(30 * 60);
  });

  it("reads a completed match's stale running clock at its last save", () => {
    const running = startLiveMatch(createLiveMatchFromSetup(makeSetup("5v5", 6, 15)), T0);
    const state = { ...(stored(running) as Record<string, unknown>), updatedAt: new Date(T0 + 12 * MIN).toISOString() };

    const season = sumSeasonPlayingTime([state], { nowMs: T0 + 3 * 24 * 60 * MIN });

    expect(season.seconds.get("p1")).toBe(12 * 60);
  });
});
