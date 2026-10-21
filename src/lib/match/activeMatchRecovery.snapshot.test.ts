import { afterEach, describe, expect, it } from "vitest";
import type { MatchSetup } from "@/domain/match";
import type { Player } from "@/domain/team";
import {
  clearLocalActiveState,
  endLocalActiveMatch,
  startLocalMatch,
} from "@/lib/match/activeMatchRecovery";
import { getSquadSnapshot, saveSquadSnapshot, SQUAD_SNAPSHOT_KEY } from "@/lib/storage/squadSnapshotStorage";
import { resetStorageSignalsForTests } from "@/lib/storage/storageEnvelope";

// Squad snapshot lifecycle (children's data, AGENTS.md §2): saved when a match
// starts, gone when it ends, is discarded, or another match starts.

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

const PLAYERS = [player("p1", "Ida"), player("p2", "Frida"), player("p9", "Not selected")];

function setup(id: string): MatchSetup {
  return {
    id,
    teamId: "team-1",
    format: "5v5",
    reportEnabled: false,
    formationId: "5v5-2-2",
    duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
    selectedPlayerIds: ["p1", "p2"],
    startingPlayerIds: ["p1"],
    slotAssignments: { "5v5-1": "p1" },
    createdAt: "2026-04-15T10:00:00.000Z",
    updatedAt: "2026-04-15T10:00:00.000Z",
  };
}

describe("squad snapshot lifecycle", () => {
  afterEach(() => {
    window.localStorage.clear();
    resetStorageSignalsForTests();
  });

  it("is saved at match start with the selected players only", () => {
    expect(startLocalMatch(setup("setup-1"), null, { squadPlayers: PLAYERS }).ok).toBe(true);

    expect(getSquadSnapshot("setup-1")?.players.map((item) => item.name)).toEqual(["Ida", "Frida"]);
  });

  it("without players (today's callers) nothing is saved, and an older snapshot is still removed", () => {
    saveSquadSnapshot({ setupId: "setup-0", teamId: "team-1", squadPlayerIds: ["p1"], players: PLAYERS });

    startLocalMatch(setup("setup-1"), null);

    expect(window.localStorage.getItem(SQUAD_SNAPSHOT_KEY)).toBeNull();
  });

  it("is removed when the match ends", () => {
    startLocalMatch(setup("setup-1"), null, { squadPlayers: PLAYERS });

    expect(endLocalActiveMatch()).not.toBeNull();
    expect(window.localStorage.getItem(SQUAD_SNAPSHOT_KEY)).toBeNull();
  });

  it("is removed when the match is discarded", () => {
    startLocalMatch(setup("setup-1"), null, { squadPlayers: PLAYERS });

    clearLocalActiveState();
    expect(window.localStorage.getItem(SQUAD_SNAPSHOT_KEY)).toBeNull();
  });

  it("a new match replaces the previous match's snapshot", () => {
    startLocalMatch(setup("setup-1"), null, { squadPlayers: PLAYERS });
    endLocalActiveMatch();
    saveSquadSnapshot({ setupId: "setup-1", teamId: "team-1", squadPlayerIds: ["p1"], players: PLAYERS });

    startLocalMatch(setup("setup-2"), null, { squadPlayers: [player("p1", "Ida")] });

    expect(getSquadSnapshot("setup-1")).toBeNull();
    expect(getSquadSnapshot("setup-2")?.players.map((item) => item.id)).toEqual(["p1"]);
  });
});
