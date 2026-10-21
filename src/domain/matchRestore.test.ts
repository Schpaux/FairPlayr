import { describe, expect, it } from "vitest";
import {
  createLiveMatchFromSetup,
  endLiveMatch,
  pauseLiveMatch,
  startLiveMatch,
  type LiveMatchState,
} from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import type { Player } from "@/domain/team";
import {
  CLOSED_GAP_THRESHOLD_MS,
  detectClosedGap,
  keepInMemoryLiveMatch,
  mayServerReplaceLocal,
  resolveRestoreSquad,
} from "@/domain/matchRestore";

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

const KICKOFF = 1_000_000;

function running(): LiveMatchState {
  return startLiveMatch(createLiveMatchFromSetup(SETUP), KICKOFF);
}

function at(state: LiveMatchState, iso: string): LiveMatchState {
  return { ...state, updatedAt: iso };
}

function player(id: string, name: string): Player {
  return {
    id,
    name,
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: "2026-04-15T10:00:00.000Z",
    updatedAt: "2026-04-15T10:00:00.000Z",
  };
}

describe("mayServerReplaceLocal", () => {
  const local = at({ ...running(), teamScore: 3 }, "2026-10-20T12:10:00.000Z");

  it("never replaces newer (or equally new) local data of the same match", () => {
    expect(mayServerReplaceLocal(local, at({ ...local, teamScore: 1 }, "2026-10-20T12:05:00.000Z"))).toBe(false);
    expect(mayServerReplaceLocal(local, at({ ...local, teamScore: 1 }, "2026-10-20T12:10:00.000Z"))).toBe(false);
  });

  it("takes a strictly newer server copy of the same match that is still in progress", () => {
    expect(mayServerReplaceLocal(local, at(local, "2026-10-20T12:11:00.000Z"))).toBe(true);
  });

  it("never revives a match that ended on this device", () => {
    const ended = at(endLiveMatch(local, KICKOFF + 60_000), "2026-10-20T12:10:00.000Z");
    expect(mayServerReplaceLocal(ended, at(local, "2026-10-20T13:00:00.000Z"))).toBe(false);
  });

  it("a different match in progress here always wins; an ended one does not block", () => {
    const other = at({ ...running(), id: "other", setupId: "setup-2" }, "2026-10-20T13:00:00.000Z");
    expect(mayServerReplaceLocal(local, other)).toBe(false);
    expect(mayServerReplaceLocal(endLiveMatch(local, KICKOFF + 1), other)).toBe(true);
    expect(mayServerReplaceLocal(null, other)).toBe(true);
    expect(mayServerReplaceLocal(local, null)).toBe(false);
  });
});

describe("keepInMemoryLiveMatch", () => {
  it("keeps the on-screen state of the same match over what storage holds", () => {
    const inMemory = { ...running(), teamScore: 2 };
    const fromStorage = { ...inMemory, teamScore: 1 };
    expect(keepInMemoryLiveMatch(inMemory, fromStorage)).toBe(inMemory);
  });

  it("takes the restored state for another match or when nothing is on screen", () => {
    const restored = running();
    expect(keepInMemoryLiveMatch(null, restored)).toBe(restored);
    expect(keepInMemoryLiveMatch({ ...restored, id: "x", setupId: "y" }, restored)).toBe(restored);
    expect(keepInMemoryLiveMatch(restored, null)).toBeNull();
  });
});

describe("resolveRestoreSquad", () => {
  const base = {
    setupId: "setup-1",
    teamId: "team-1",
    squadPlayerIds: SETUP.selectedPlayerIds,
    liveMatch: running(),
    hasLocalMatch: true,
    placeholderName: (index: number) => `Spiller ${index}`,
  };

  const fullTeam = {
    id: "team-1",
    players: [
      player("p1", "Ida"),
      player("p2", "Frida"),
      player("p3", "Selma"),
      player("p4", "Vilde"),
      player("p5", "Nora"),
      player("p6", "Emma"),
    ],
  };

  it("prefers the team (live data or mirror)", () => {
    expect(resolveRestoreSquad({ ...base, team: fullTeam, snapshot: null })).toEqual({
      source: "team",
      players: fullTeam.players,
      placeholderPlayerIds: [],
    });
  });

  it("a match player deleted from the team keeps the snapshot name, never a raw id", () => {
    const team = { id: "team-1", players: fullTeam.players.filter((item) => item.id !== "p6") };
    const squad = resolveRestoreSquad({
      ...base,
      team,
      snapshot: {
        setupId: "setup-1",
        teamId: "team-1",
        players: [
          { id: "p1", name: "Ida (old)" },
          { id: "p6", name: "Emma", number: 6 },
          { id: "p9", name: "Not in this match" },
        ],
      },
    });

    expect(squad?.source).toBe("team");
    // The team wins where it has the player; the snapshot only fills gaps.
    expect(squad?.players.find((item) => item.id === "p1")?.name).toBe("Ida");
    expect(squad?.players.find((item) => item.id === "p6")).toMatchObject({ name: "Emma", number: 6 });
    expect(squad?.players.some((item) => item.id === "p9")).toBe(false);
    expect(squad?.placeholderPlayerIds).toEqual([]);
  });

  it("uses placeholders only for players neither the team nor the snapshot has", () => {
    const team = { id: "team-1", players: fullTeam.players.filter((item) => item.id !== "p5" && item.id !== "p6") };
    const squad = resolveRestoreSquad({
      ...base,
      team,
      snapshot: { setupId: "setup-1", teamId: "team-1", players: [{ id: "p6", name: "Emma" }] },
    });

    expect(squad?.players.find((item) => item.id === "p6")?.name).toBe("Emma");
    expect(squad?.players.find((item) => item.id === "p5")?.name).toBe("Spiller 5");
    expect(squad?.placeholderPlayerIds).toEqual(["p5"]);
  });

  it("restores without a team from the squad snapshot", () => {
    const squad = resolveRestoreSquad({
      ...base,
      team: null,
      snapshot: { setupId: "setup-1", teamId: "team-1", players: [{ id: "p1", name: "Ida", number: 7 }] },
    });
    expect(squad?.source).toBe("snapshot");
    expect(squad?.players[0]).toMatchObject({ id: "p1", name: "Ida", number: 7 });
    // The rest of the match squad gets placeholders, flagged as such.
    expect(squad?.placeholderPlayerIds).toEqual(["p2", "p3", "p4", "p5", "p6"]);
  });

  it("ignores a snapshot of another match and falls back to placeholders, never to nothing", () => {
    const squad = resolveRestoreSquad({
      ...base,
      team: { id: "other-team", players: [] },
      snapshot: { setupId: "setup-0", teamId: "team-1", players: [{ id: "p1", name: "Old" }] },
    });
    expect(squad?.source).toBe("placeholder");
    expect(squad?.players.map((item) => item.id)).toEqual(SETUP.selectedPlayerIds);
    expect(squad?.players[0].name).toBe("Spiller 1");
    expect(squad?.placeholderPlayerIds).toEqual(SETUP.selectedPlayerIds);
  });

  it("returns null only when there is no local match", () => {
    expect(resolveRestoreSquad({ ...base, team: null, snapshot: null, liveMatch: null, hasLocalMatch: false })).toBeNull();
  });
});

describe("detectClosedGap (B9)", () => {
  const liveMatch = running();

  it("reports the minutes the app was closed while the clock ran", () => {
    const gap = detectClosedGap({
      heartbeat: { matchId: liveMatch.id, atMs: KICKOFF + 60_000 },
      liveMatch,
      nowMs: KICKOFF + 60_000 + 7 * 60_000,
    });
    expect(gap).toEqual({ closedMs: 7 * 60_000, minutes: 7 });
  });

  it("is silent for a quick reload, a paused clock, another match or no heartbeat", () => {
    const heartbeat = { matchId: liveMatch.id, atMs: KICKOFF };
    expect(detectClosedGap({ heartbeat, liveMatch, nowMs: KICKOFF + CLOSED_GAP_THRESHOLD_MS })).toBeNull();
    expect(
      detectClosedGap({ heartbeat, liveMatch: pauseLiveMatch(liveMatch, KICKOFF + 1), nowMs: KICKOFF + 600_000 })
    ).toBeNull();
    expect(detectClosedGap({ heartbeat: { ...heartbeat, matchId: "x" }, liveMatch, nowMs: KICKOFF + 600_000 })).toBeNull();
    expect(detectClosedGap({ heartbeat: null, liveMatch, nowMs: KICKOFF + 600_000 })).toBeNull();
  });

  it("rounds to at least one minute", () => {
    const gap = detectClosedGap({ heartbeat: { matchId: liveMatch.id, atMs: 0 }, liveMatch, nowMs: 61_000 });
    expect(gap?.minutes).toBe(1);
  });
});
