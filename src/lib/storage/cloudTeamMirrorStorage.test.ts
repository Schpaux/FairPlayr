import { afterEach, describe, expect, it } from "vitest";
import type { Team } from "@/domain/team";
import {
  clearCloudTeamMirror,
  CLOUD_TEAM_MIRROR_KEY,
  getCloudTeamMirror,
  getMirroredTeams,
  saveMirroredActiveTeamId,
  saveMirroredTeams,
  upsertMirroredTeam,
} from "@/lib/storage/cloudTeamMirrorStorage";
import { getSquadSnapshot, saveSquadSnapshot, SQUAD_SNAPSHOT_KEY } from "@/lib/storage/squadSnapshotStorage";

const TEAM: Team = {
  id: "team-1",
  name: "Lyn G9",
  players: [
    {
      id: "p1",
      name: "Ida Hansen",
      number: 7,
      preferredPosition: "FW",
      source: "spond",
      externalProvider: "spond",
      externalId: "spond-member-123",
      isManaged: true,
      createdAt: "2026-04-15T10:00:00.000Z",
      updatedAt: "2026-04-15T10:00:00.000Z",
    },
    {
      id: "p2",
      name: "Selma",
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

describe("cloudTeamMirrorStorage", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("stores only the minimal player fields (children's data)", () => {
    saveMirroredTeams("user-1", [TEAM]);

    const raw = JSON.parse(window.localStorage.getItem(CLOUD_TEAM_MIRROR_KEY)!);
    const stored = raw.byUser["user-1"].teams[0];

    expect(Object.keys(stored).sort()).toEqual(["id", "name", "players"]);
    expect(stored.players).toEqual([
      { id: "p1", name: "Ida Hansen", number: 7, preferredPosition: "FW" },
      { id: "p2", name: "Selma" },
    ]);
    expect(JSON.stringify(raw)).not.toContain("spond-member-123");
    expect(JSON.stringify(raw)).not.toContain("@");
  });

  it("reads the mirror back per user as read-only teams, offline", () => {
    saveMirroredTeams("user-1", [TEAM]);
    saveMirroredActiveTeamId("user-1", "team-1");

    const teams = getMirroredTeams("user-1");
    expect(teams?.[0].players.map((player) => player.name)).toEqual(["Ida Hansen", "Selma"]);
    expect(teams?.[0].players[0].number).toBe(7);
    expect(getCloudTeamMirror("user-1")?.activeTeamId).toBe("team-1");
    expect(getMirroredTeams("user-2")).toBeNull();
  });

  it("keeps an edited team in step and clears only the signed-out user", () => {
    saveMirroredTeams("user-1", [TEAM]);
    saveMirroredTeams("user-2", [{ ...TEAM, id: "team-2" }]);
    upsertMirroredTeam("user-1", { ...TEAM, name: "Lyn G10" });

    expect(getMirroredTeams("user-1")?.[0].name).toBe("Lyn G10");

    clearCloudTeamMirror("user-1");
    expect(getMirroredTeams("user-1")).toBeNull();
    expect(getMirroredTeams("user-2")).toHaveLength(1);

    clearCloudTeamMirror("user-2");
    expect(window.localStorage.getItem(CLOUD_TEAM_MIRROR_KEY)).toBeNull();
  });
});

describe("squadSnapshotStorage", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("stores only the match squad with minimal fields, for its setup only", () => {
    saveSquadSnapshot({ setupId: "setup-1", teamId: "team-1", squadPlayerIds: ["p1"], players: TEAM.players });

    const raw = JSON.parse(window.localStorage.getItem(SQUAD_SNAPSHOT_KEY)!);
    expect(raw.players).toEqual([{ id: "p1", name: "Ida Hansen", number: 7, preferredPosition: "FW" }]);
    expect(getSquadSnapshot("setup-1")?.players).toHaveLength(1);
    expect(getSquadSnapshot("setup-2")).toBeNull();
  });

  it("a new match replaces the previous snapshot", () => {
    saveSquadSnapshot({ setupId: "setup-1", teamId: "team-1", squadPlayerIds: ["p1"], players: TEAM.players });
    saveSquadSnapshot({ setupId: "setup-2", teamId: "team-1", squadPlayerIds: ["p2"], players: TEAM.players });

    expect(getSquadSnapshot("setup-1")).toBeNull();
    expect(getSquadSnapshot("setup-2")?.players.map((player) => player.id)).toEqual(["p2"]);
  });
});
