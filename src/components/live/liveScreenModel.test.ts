import { describe, expect, it } from "vitest";
import {
  createLiveMatchFromSetup,
  endCurrentHalf,
  startLiveMatch,
  substitutePlayers,
  type LiveMatchState,
} from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import { INITIAL_SUB_STATE } from "@/domain/liveSubInteraction";
import { createGoalEvent, createSubstitutionEvent } from "@/domain/matchEvent";
import type { Player } from "@/domain/team";
import { buildLiveScreenModel } from "@/components/live/liveScreenModel";

const setup: MatchSetup = {
  id: "setup-1",
  teamId: "team-1",
  format: "5v5",
  reportEnabled: true,
  formationId: "5v5-2-2",
  duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
  selectedPlayerIds: ["p1", "p2", "p3", "p4", "p5", "p6"],
  startingPlayerIds: ["p1", "p2", "p3", "p4", "p5"],
  slotAssignments: { "5v5-1": "p1", "5v5-2": "p2", "5v5-3": "p3", "5v5-4": "p4", "5v5-5": "p5" },
  createdAt: "2026-04-15T10:00:00.000Z",
  updatedAt: "2026-04-15T10:00:00.000Z",
};

const T0 = 1_000_000;
const at = (minutes: number) => T0 + minutes * 60_000;

function tokenFor(liveMatch: LiveMatchState, playerId: string, nowMs: number) {
  const model = buildLiveScreenModel({
    liveMatch,
    nowMs,
    inStoppage: false,
    playersById: new Map(),
    getShortName: (id) => id,
    suggestion: null,
    interaction: INITIAL_SUB_STATE,
  });
  const token = model.tokens.find((t) => t.playerId === playerId);
  if (!token) throw new Error(`no token for ${playerId}`);
  return token;
}

describe("buildLiveScreenModel — number vs ring", () => {
  it("shows total minutes as the number and time since last rest as the ring", () => {
    let state = startLiveMatch(createLiveMatchFromSetup(setup), T0);
    state = substitutePlayers(state, "p2", "p6", at(6));
    state = substitutePlayers(state, "p6", "p2", at(9)); // p2: 6 played, 3 rested

    const token = tokenFor(state, "p2", at(12));
    expect(token.minutes).toBe(9);
    expect(token.ringRatio).toBeCloseTo(3 / 15);
  });

  it("resets the ring at half-time but keeps the total", () => {
    let state = startLiveMatch(createLiveMatchFromSetup(setup), T0);
    state = endCurrentHalf(state, at(15));
    state = startLiveMatch(state, at(25));

    const token = tokenFor(state, "p1", at(28));
    expect(token.minutes).toBe(18);
    expect(token.ringRatio).toBeCloseTo(3 / 15);
  });

  it("colours the ring from time since last rest, not total minutes", () => {
    let state = startLiveMatch(createLiveMatchFromSetup(setup), T0);

    const tired = tokenFor(state, "p2", at(13));
    expect(tired.minutes).toBe(13);
    expect(tired.ringRatio).toBeCloseTo(13 / 15);
    expect(tired.fatigue).toBe("critical");

    state = substitutePlayers(state, "p2", "p6", at(14));
    state = substitutePlayers(state, "p6", "p2", at(15)); // p2: 14 played, 1 rested

    const returned = tokenFor(state, "p2", at(16));
    expect(returned.minutes).toBe(15);
    expect(returned.ringRatio).toBeCloseTo(1 / 15);
    expect(returned.fatigue).toBe("fresh");
  });

  it("never escalates the keeper's ring colour", () => {
    const state = startLiveMatch(createLiveMatchFromSetup(setup), T0);

    const keeper = tokenFor(state, "p1", at(14));
    expect(keeper.isKeeper).toBe(true);
    expect(keeper.ringRatio).toBeCloseTo(14 / 15);
    expect(keeper.fatigue).toBe("fresh");
  });
});

describe("buildLiveScreenModel — event names (FEAT-NAME-01)", () => {
  const player = (id: string, name: string): Player => ({
    id,
    name,
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: "2026-04-15T10:00:00.000Z",
    updatedAt: "2026-04-15T10:00:00.000Z",
  });

  it("shows the pitch display name for known players and the stored name for a player no longer in the team", () => {
    const state: LiveMatchState = {
      ...startLiveMatch(createLiveMatchFromSetup(setup), T0),
      events: [
        createGoalEvent({
          minute: 3,
          teamSide: "own",
          scorerPlayerId: "p2",
          scorerName: "Emma Haugen",
          assistPlayerId: "gone",
          assistName: "Ola Nordmann",
        }),
        createSubstitutionEvent({
          minute: 6,
          inPlayerId: "p6",
          inPlayerName: "Emma Hansen",
          outPlayerId: "p2",
          outPlayerName: "Emma Haugen",
        }),
      ],
    };
    const short: Record<string, string> = { p2: "Emma Hau", p6: "Emma Han" };
    const model = buildLiveScreenModel({
      liveMatch: state,
      nowMs: at(7),
      inStoppage: false,
      playersById: new Map([
        ["p2", player("p2", "Emma Haugen")],
        ["p6", player("p6", "Emma Hansen")],
      ]),
      getShortName: (id) => short[id] ?? id,
      suggestion: null,
      interaction: INITIAL_SUB_STATE,
    });

    expect(model.events.map(({ primary, secondary }) => [primary, secondary])).toEqual([
      ["Emma Hau", "Ola Nordmann"],
      ["Emma Han", "Emma Hau"],
    ]);
  });
});
