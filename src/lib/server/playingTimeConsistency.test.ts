// @vitest-environment node
// STATS-01: one stored match gives the same playing time on the match details
// page, in the Home season stats and in the AI match summary input, and the
// AI prompt names no more players than before (SEC-04).
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLiveMatchFromSetup,
  endCurrentHalf,
  endLiveMatch,
  moveBenchPlayerToSlot,
  removePlayerFromField,
  startLiveMatch,
  type LiveMatchState,
} from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import { createSubstitutionEvent } from "@/domain/matchEvent";
import { summarizeMatchPlayingTime } from "@/domain/matchPlayingTime";
import { applySubstitution } from "@/domain/substitutionUndo";

vi.mock("server-only", () => ({}));

const { getSeasonStats } = await import("@/lib/server/seasonStats");
const { buildMatchSummaryInput } = await import("@/lib/server/ai/match-summary/buildMatchSummaryInput");
const { buildMatchSummaryPrompt } = await import("@/lib/server/ai/match-summary/buildMatchSummaryPrompt");

const MIN = 60_000;
const T0 = 1_000_000;
const TEAM_ID = "team-1";
const NAMES = ["Alma", "Bea", "Cora", "Dina", "Eli", "Fia", "Gro", "Hege", "Iben"];
const IDS = NAMES.map((_, index) => `p${index + 1}`);

function setup(): MatchSetup {
  const starters = IDS.slice(0, 7);
  return {
    id: "setup-1",
    teamId: TEAM_ID,
    format: "7v7",
    reportEnabled: true,
    formationId: "7v7-2-3-1",
    duration: { mode: "preset", presetId: "2x20", halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
    selectedPlayerIds: IDS,
    startingPlayerIds: starters,
    slotAssignments: Object.fromEntries(starters.map((id, index) => [`7v7-${index + 1}`, id])),
    createdAt: "2026-10-21T10:00:00.000Z",
    updatedAt: "2026-10-21T10:00:00.000Z",
  };
}

/**
 * 7v7, 2 × 20, squad of 9. Hege (p8) replaces Fia (p6) at 12′; Iben (p9)
 * never plays. The starters still on at the whistle have their last spell open.
 */
function playedMatch(): LiveMatchState {
  let state = startLiveMatch(createLiveMatchFromSetup(setup()), T0);
  const event = createSubstitutionEvent({
    minute: 12,
    timestampMs: 12 * MIN,
    inPlayerId: "p8",
    inPlayerName: "Hege",
    outPlayerId: "p6",
    outPlayerName: "Fia",
  });
  state = applySubstitution(state, "p6", "p8", T0 + 12 * MIN, event)!.state;
  state = endCurrentHalf(state, T0 + 20 * MIN);
  state = startLiveMatch(state, T0 + 30 * MIN);
  return endLiveMatch(state, T0 + 50 * MIN);
}

// ─── A minimal fake Supabase client ──────────────────────────────────────────

let tables: Record<string, unknown[]>;

function query(table: string) {
  const rows = () => tables[table] ?? [];
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
  };
  for (const method of ["select", "eq", "in", "gte", "order", "limit", "returns"]) {
    builder[method] = () => builder;
  }
  return builder;
}

const supabase = { from: (table: string) => query(table) } as unknown as Parameters<typeof getSeasonStats>[0];

function storeMatch(state: LiveMatchState) {
  tables = {
    matches: [
      {
        id: "match-1",
        team_id: TEAM_ID,
        title: "Lyn – Skeid",
        opponent_name: "Skeid",
        starts_at: "2026-10-18T09:00:00.000Z",
        ended_at: "2026-10-18T10:00:00.000Z",
        location: null,
        format: "7v7",
        score_for: 2,
        score_against: 1,
        runtime_state: JSON.parse(JSON.stringify(state)) as unknown,
      },
    ],
    team_members: [{ team_id: TEAM_ID }],
    teams: [{ id: TEAM_ID, name: "Lyn G12" }],
    match_events: [],
    players: NAMES.map((name, index) => ({ id: IDS[index], name, number: index + 1, position: null })),
  };
}

beforeEach(() => {
  storeMatch(playedMatch());
});

describe("STATS-01: one match, the same minutes everywhere", () => {
  it("details page, season stats and AI input agree for every player who appears", async () => {
    const stored = (tables.matches[0] as { runtime_state: unknown }).runtime_state;
    const details = summarizeMatchPlayingTime(stored, { nowMs: Date.now(), completed: true });
    const detailsMinutes = Object.fromEntries(
      (details?.players ?? []).map((player) => [NAMES[IDS.indexOf(player.playerId)], player.minutes])
    );
    expect(detailsMinutes).toEqual({ Alma: 40, Bea: 40, Cora: 40, Dina: 40, Eli: 40, Fia: 12, Gro: 40, Hege: 28, Iben: 0 });

    const input = await buildMatchSummaryInput(supabase, "user-1", "match-1");
    const aiMinutes = Object.fromEntries(input.playersUsedList.map((player) => [player.name, player.minutesPlayed]));
    // Same minutes for everyone the report names; full-match starters are no longer missing.
    for (const [name, minutes] of Object.entries(aiMinutes)) expect(minutes).toBe(detailsMinutes[name]);
    expect(input.playerTimes.map((entry) => [entry.playerName, entry.minutesPlayed])).toEqual(
      input.playersUsedList.map((player) => [player.name, player.minutesPlayed]).sort((a, b) => (b[1] as number) - (a[1] as number))
    );

    const stats = await getSeasonStats(supabase, TEAM_ID);
    // Below 85 % of the squad average (31.1′): Iben (0′) and Fia (12′) only.
    expect(stats.needsMinutes.map((player) => [player.name, player.totalMinutes])).toEqual([
      ["Iben", 0],
      ["Fia", 12],
    ]);
    expect(stats.matchesPlayed).toBe(1);
    expect(stats.timedMatches).toBe(1);
  });

  it("sends the AI provider the same names as before, with corrected minutes", async () => {
    const input = await buildMatchSummaryInput(supabase, "user-1", "match-1");

    // Starters plus the substitute who came on; Iben never played and is not named (SEC-04).
    expect(input.playersUsedList.map((player) => player.name).sort()).toEqual(
      ["Alma", "Bea", "Cora", "Dina", "Eli", "Fia", "Gro", "Hege"].sort()
    );
    expect(input.playersUsedList.find((player) => player.name === "Alma")).toEqual({
      name: "Alma",
      minutesPlayed: 40,
      started: true,
      cameOn: false,
    });

    const { prompt } = buildMatchSummaryPrompt(input);
    expect(prompt).not.toContain("Iben");
    expect(prompt).toContain('"minutter": 40');
  });

  it("states no minutes to the AI when the clock was not stored, rather than too few", async () => {
    const state = JSON.parse(JSON.stringify(playedMatch())) as Record<string, unknown>;
    delete state.clock;
    storeMatch(state as unknown as LiveMatchState);

    const input = await buildMatchSummaryInput(supabase, "user-1", "match-1");
    const minutes = Object.fromEntries(input.playersUsedList.map((player) => [player.name, player.minutesPlayed]));

    // Fia's spell ended when she went off, so it is exact; the rest were still on.
    expect(minutes).toMatchObject({ Fia: 12, Alma: null, Hege: null });

    // Season stats leave the match out instead of crediting a partial one.
    const stats = await getSeasonStats(supabase, TEAM_ID);
    expect(stats.needsMinutes).toEqual([]);
    expect(stats.matchesPlayed).toBe(1);
    // Home shows "no data" instead of a perfect balance (UI-HOME-NODATA-01).
    expect(stats.timedMatches).toBe(0);
  });

  it("season stats report no measured time for a match ended at kick-off", async () => {
    storeMatch(endLiveMatch(startLiveMatch(createLiveMatchFromSetup(setup()), T0), T0));

    const stats = await getSeasonStats(supabase, TEAM_ID);
    // Everyone has 0 s: no "100 % balance" (UI-HOME-NODATA-01).
    expect(stats.matchesPlayed).toBe(1);
    expect(stats.timedMatches).toBe(0);
    expect(stats.needsMinutes).toEqual([]);
  });

  it("never tells the AI that a listed player played 0 minutes", async () => {
    // Hege comes on 30 seconds before the whistle: listed (she came on), no minutes stated.
    let state = startLiveMatch(createLiveMatchFromSetup(setup()), T0);
    const event = createSubstitutionEvent({ minute: 39, timestampMs: 39.5 * MIN, inPlayerId: "p8", inPlayerName: "Hege", outPlayerId: "p6", outPlayerName: "Fia" });
    state = applySubstitution(state, "p6", "p8", T0 + 39.5 * MIN, event)!.state;
    state = endLiveMatch(state, T0 + 40 * MIN);
    storeMatch(state);

    const input = await buildMatchSummaryInput(supabase, "user-1", "match-1");

    expect(input.playersUsedList.find((player) => player.name === "Hege")).toMatchObject({ cameOn: true, minutesPlayed: null });
    expect(buildMatchSummaryPrompt(input).prompt).not.toContain('"minutter": 0');
  });

  it("does not add a player the old selection would not have named (known limitation)", async () => {
    // Iben goes into an emptied slot without a substitution event, and is
    // still on at the whistle: her raw total is 0, so the report does not
    // list her, exactly as before STATS-01. Listing her would send one more
    // child's name to the AI provider (SEC-04).
    let state = startLiveMatch(createLiveMatchFromSetup(setup()), T0);
    state = removePlayerFromField(state, "7v7-6", T0 + 10 * MIN);
    state = moveBenchPlayerToSlot(state, "7v7-6", "p9", T0 + 10 * MIN);
    state = endLiveMatch(state, T0 + 40 * MIN);
    storeMatch(state);

    const input = await buildMatchSummaryInput(supabase, "user-1", "match-1");

    expect(input.playersUsedList.map((player) => player.name)).not.toContain("Iben");
    expect(summarizeMatchPlayingTime(state, { nowMs: T0, completed: true })?.players.find((p) => p.playerId === "p9")?.minutes).toBe(30);
  });
});
