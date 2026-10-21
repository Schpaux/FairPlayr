import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Team } from "@/domain/team";
import { getMirroredTeams, saveMirroredTeams } from "@/lib/storage/cloudTeamMirrorStorage";
import { createMirroredTeamRepository, OFFLINE_READ_ONLY } from "@/lib/teamData/mirroredTeamRepository";
import type { TeamRepository } from "@/lib/teamData/types";

const TEAM: Team = {
  id: "team-1",
  name: "Lyn G9",
  players: [
    {
      id: "p1",
      name: "Ida",
      number: 7,
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

function innerRepository(overrides: Partial<TeamRepository> = {}): TeamRepository {
  return {
    mode: "cloud",
    getTeams: vi.fn().mockResolvedValue([TEAM]),
    getTeam: vi.fn().mockResolvedValue(TEAM),
    getActiveTeamId: vi.fn().mockResolvedValue("team-1"),
    setActiveTeam: vi.fn().mockResolvedValue("team-1"),
    createTeam: vi.fn(),
    deleteTeam: vi.fn(),
    renameTeam: vi.fn().mockResolvedValue({ ...TEAM, name: "Renamed" }),
    addPlayer: vi.fn(),
    renamePlayer: vi.fn(),
    deletePlayer: vi.fn(),
    reorderPlayer: vi.fn(),
    ...overrides,
  };
}

let online = true;

describe("mirroredTeamRepository", () => {
  beforeEach(() => {
    online = true;
    vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online);
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("refreshes the mirror on every successful read", async () => {
    const repository = createMirroredTeamRepository({ inner: innerRepository(), userId: "user-1" });

    await expect(repository.getTeams()).resolves.toEqual([TEAM]);
    await repository.getActiveTeamId();

    expect(getMirroredTeams("user-1")?.[0].players[0]).toMatchObject({ id: "p1", name: "Ida", number: 7 });
    expect(repository.getDataSource?.()).toBe("server");
  });

  it("falls back to the mirror when the server cannot be reached", async () => {
    saveMirroredTeams("user-1", [TEAM]);
    const inner = innerRepository({
      getTeams: vi.fn().mockRejectedValue(new Error("TypeError: Failed to fetch")),
      getActiveTeamId: vi.fn().mockRejectedValue(new Error("TypeError: Failed to fetch")),
      setActiveTeam: vi.fn().mockRejectedValue(new Error("TypeError: Failed to fetch")),
    });
    const repository = createMirroredTeamRepository({ inner, userId: "user-1" });

    const teams = await repository.getTeams();
    expect(teams.map((team) => team.id)).toEqual(["team-1"]);
    expect(repository.getDataSource?.()).toBe("mirror");
    await expect(repository.setActiveTeam("team-1")).resolves.toBe("team-1");
    await expect(repository.getActiveTeamId()).resolves.toBe("team-1");
  });

  it("reads the mirror without asking the server when the device is offline", async () => {
    saveMirroredTeams("user-1", [TEAM]);
    online = false;
    const inner = innerRepository();
    const repository = createMirroredTeamRepository({ inner, userId: "user-1" });

    await expect(repository.getTeams()).resolves.toHaveLength(1);
    expect(inner.getTeams).not.toHaveBeenCalled();
  });

  it("still surfaces server errors that are not about connectivity", async () => {
    saveMirroredTeams("user-1", [TEAM]);
    const inner = innerRepository({ getTeams: vi.fn().mockRejectedValue(new Error("permission denied")) });
    const repository = createMirroredTeamRepository({ inner, userId: "user-1" });

    await expect(repository.getTeams()).rejects.toThrow("permission denied");
  });

  it("without a session it never asks the server (no empty anonymous list over the mirror) and is read-only", async () => {
    saveMirroredTeams("user-1", [TEAM]);
    const inner = innerRepository({ getTeams: vi.fn().mockResolvedValue([]) });
    const repository = createMirroredTeamRepository({ inner, userId: "user-1", serverAvailable: false });

    await expect(repository.getTeams()).resolves.toHaveLength(1);
    expect(inner.getTeams).not.toHaveBeenCalled();
    expect(getMirroredTeams("user-1")).toHaveLength(1);
    await expect(repository.renameTeam("team-1", "X")).rejects.toThrow(OFFLINE_READ_ONLY);
    expect(inner.renameTeam).not.toHaveBeenCalled();
  });

  it("keeps the mirror in step with a successful edit", async () => {
    saveMirroredTeams("user-1", [TEAM]);
    const repository = createMirroredTeamRepository({ inner: innerRepository(), userId: "user-1" });

    await repository.renameTeam("team-1", "Renamed");
    expect(getMirroredTeams("user-1")?.[0].name).toBe("Renamed");
  });

  describe("lie-fi (requests that hang)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("falls back to the mirror after the read timeout, and a late answer still refreshes the mirror", async () => {
      vi.useFakeTimers();
      saveMirroredTeams("user-1", [TEAM]);
      let answer: (teams: Team[]) => void = () => undefined;
      const inner = innerRepository({
        getTeams: vi.fn(() => new Promise<Team[]>((resolve) => (answer = resolve))),
        getActiveTeamId: vi.fn(() => new Promise<string | null>(() => undefined)),
      });
      const repository = createMirroredTeamRepository({ inner, userId: "user-1", readTimeoutMs: 4_000 });

      const teams = repository.getTeams();
      const activeTeamId = repository.getActiveTeamId();
      await vi.advanceTimersByTimeAsync(4_000);

      await expect(teams).resolves.toHaveLength(1);
      await expect(activeTeamId).resolves.toBeNull();
      expect(repository.getDataSource?.()).toBe("mirror");

      answer([{ ...TEAM, name: "Fresh" }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(getMirroredTeams("user-1")?.[0].name).toBe("Fresh");
    });

    it("without a mirror it waits for the server as before (no timeout)", async () => {
      vi.useFakeTimers();
      let answer: (teams: Team[]) => void = () => undefined;
      const inner = innerRepository({
        getTeams: vi.fn(() => new Promise<Team[]>((resolve) => (answer = resolve))),
      });
      const repository = createMirroredTeamRepository({ inner, userId: "user-1", readTimeoutMs: 4_000 });

      let settled = false;
      const teams = repository.getTeams().then((value) => {
        settled = true;
        return value;
      });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(settled).toBe(false);

      answer([TEAM]);
      await expect(teams).resolves.toEqual([TEAM]);
      expect(repository.getDataSource?.()).toBe("server");
    });

    it("a server that answers in time is used as before", async () => {
      saveMirroredTeams("user-1", [{ ...TEAM, name: "Old" }]);
      const repository = createMirroredTeamRepository({ inner: innerRepository(), userId: "user-1" });

      await expect(repository.getTeams()).resolves.toEqual([TEAM]);
      expect(repository.getDataSource?.()).toBe("server");
      expect(getMirroredTeams("user-1")?.[0].name).toBe("Lyn G9");
    });
  });
});
