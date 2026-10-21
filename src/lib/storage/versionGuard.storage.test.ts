import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchSetup } from "@/domain/match";
import {
  activateMatch,
  endMatch,
  getStoredMatchSetup,
  hasActiveStoredMatch,
  MATCH_SETUP_KEY,
  saveMatchSetupDraft,
  updateMatchConfig,
} from "@/lib/storage/matchStorage";
import {
  getStoredTeamWorkspace,
  saveStoredTeamWorkspace,
  TEAM_STORAGE_KEY,
} from "@/lib/storage/teamStorage";
import {
  getStoredLineupDraft,
  LINEUP_STORAGE_KEY,
  saveStoredLineupDraft,
} from "@/lib/storage/lineupStorage";
import {
  getStorageSignalSnapshot,
  resetStorageSignalsForTests,
  StorageNewerVersionError,
} from "@/lib/storage/storageEnvelope";

const CONFIG: MatchSetup = {
  id: "setup-1",
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

const TEAM = {
  id: "team-1",
  name: "Lyn G9",
  players: [
    {
      id: "p1",
      name: "Ida",
      source: "manual",
      externalProvider: null,
      externalId: null,
      isManaged: false,
      createdAt: "2026-04-15T10:00:00.000Z",
      updatedAt: "2026-04-15T10:00:00.000Z",
    },
  ],
  createdAt: "2026-04-15T10:00:00.000Z",
  updatedAt: "2026-04-15T10:00:00.000Z",
};

describe("version guard on the other stored keys (OFF-01a)", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    resetStorageSignalsForTests();
  });

  describe("matchStorage", () => {
    it("reads a newer build's active setup (instead of null) and never writes over it", () => {
      const newer = JSON.stringify({
        version: 3,
        config: { ...CONFIG, futureField: "x" },
        status: "active",
        serverMatchId: null,
        futureEnvelope: true,
      });
      window.localStorage.setItem(MATCH_SETUP_KEY, newer);

      const stored = getStoredMatchSetup();
      expect(stored?.status).toBe("active");
      expect(stored?.config.id).toBe("setup-1");
      expect(hasActiveStoredMatch()).toBe(true);
      expect(getStorageSignalSnapshot().newerVersionKeys).toContain(MATCH_SETUP_KEY);

      // Neither a draft nor a new activation replaces it; an activation is a
      // failed write for its caller.
      expect(saveMatchSetupDraft({ ...CONFIG, id: "setup-2" })).toBe(false);
      expect(() => activateMatch({ ...CONFIG, id: "setup-3" }, null)).toThrow(StorageNewerVersionError);
      expect(() => endMatch({ ...CONFIG, id: "setup-1" })).toThrow(StorageNewerVersionError);
      expect(window.localStorage.getItem(MATCH_SETUP_KEY)).toBe(newer);
    });

    it("a draft write over a newer build's draft is refused without throwing (no caller catch)", () => {
      const newer = JSON.stringify({ version: 3, config: CONFIG, status: "draft", serverMatchId: null });
      window.localStorage.setItem(MATCH_SETUP_KEY, newer);

      expect(saveMatchSetupDraft({ ...CONFIG, id: "setup-2" })).toBe(true);
      expect(updateMatchConfig({ ...CONFIG, id: "setup-2" })).toBe(true);
      expect(window.localStorage.getItem(MATCH_SETUP_KEY)).toBe(newer);
    });

    it("migrates an older config envelope forward", () => {
      window.localStorage.setItem(
        MATCH_SETUP_KEY,
        JSON.stringify({ version: 1, config: CONFIG, status: "draft" })
      );

      expect(getStoredMatchSetup()?.config.id).toBe("setup-1");
      expect(JSON.parse(window.localStorage.getItem(MATCH_SETUP_KEY)!).version).toBe(2);
    });
  });

  describe("teamStorage", () => {
    it("reads a newer build's teams tolerantly and refuses to write over them", () => {
      const newer = JSON.stringify({
        version: 3,
        teams: [{ ...TEAM, futureField: 1 }],
        activeTeamId: "team-1",
      });
      window.localStorage.setItem(TEAM_STORAGE_KEY, newer);

      const workspace = getStoredTeamWorkspace();
      expect(workspace.teams.map((team) => team.id)).toEqual(["team-1"]);
      expect(workspace.activeTeamId).toBe("team-1");

      expect(() => saveStoredTeamWorkspace({ teams: [], activeTeamId: null })).toThrow(StorageNewerVersionError);
      expect(window.localStorage.getItem(TEAM_STORAGE_KEY)).toBe(newer);
      expect(getStorageSignalSnapshot().newerVersionKeys).toContain(TEAM_STORAGE_KEY);
    });

    it("migrates an older workspace envelope forward", () => {
      window.localStorage.setItem(
        TEAM_STORAGE_KEY,
        JSON.stringify({ version: 1, teams: [TEAM], activeTeamId: "team-1" })
      );

      expect(getStoredTeamWorkspace().teams).toHaveLength(1);
      expect(JSON.parse(window.localStorage.getItem(TEAM_STORAGE_KEY)!).version).toBe(2);
    });
  });

  describe("lineupStorage", () => {
    const LINEUP = {
      id: "lineup-1",
      teamId: "team-1",
      format: "5v5",
      selectedPlayerIds: ["p1"],
      slotAssignments: { "5v5-1": "p1" },
      createdAt: "2026-04-15T10:00:00.000Z",
      updatedAt: "2026-04-15T10:00:00.000Z",
    };

    it("reads a newer build's draft tolerantly and refuses to write over it", () => {
      const newer = JSON.stringify({ version: 2, lineup: { ...LINEUP, futureField: [] } });
      window.localStorage.setItem(LINEUP_STORAGE_KEY, newer);

      expect(getStoredLineupDraft()?.id).toBe("lineup-1");

      expect(() =>
        saveStoredLineupDraft({ ...LINEUP, id: "lineup-2" } as Parameters<typeof saveStoredLineupDraft>[0])
      ).toThrow(StorageNewerVersionError);
      expect(window.localStorage.getItem(LINEUP_STORAGE_KEY)).toBe(newer);
    });
  });
});
