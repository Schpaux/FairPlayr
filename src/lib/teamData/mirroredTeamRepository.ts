import type { Team } from "@/domain/team";
import {
  getCloudTeamMirror,
  getMirroredTeams,
  mirroredTeamToTeam,
  saveMirroredActiveTeamId,
  saveMirroredTeams,
  upsertMirroredTeam,
} from "@/lib/storage/cloudTeamMirrorStorage";
import type { TeamDataSource, TeamRepository } from "@/lib/teamData/types";

/**
 * Cloud repository with a local read-only mirror (FP-OFF-01 §2.3, OFF-01a
 * task 2).
 *
 * - Every successful read refreshes the mirror (minimal fields only).
 * - A read that fails because the server cannot be reached falls back to the
 *   mirror, so a signed-in coach keeps the team (and the live match its
 *   players) offline. Server errors that are not about connectivity (access
 *   denied, policy errors) still surface as errors.
 * - With `serverAvailable: false` (offline, or a deferred session without a
 *   token) the server is not asked at all: an anonymous request would return
 *   an empty list and replace the mirror.
 * - Writes always need the server; offline they fail with OFFLINE_READ_ONLY.
 * - Lie-fi (online in name, but requests hang): when a mirror exists, a read
 *   that has not answered within `readTimeoutMs` (default 4 s) falls back to
 *   the mirror instead of waiting. A late answer still refreshes the mirror.
 *   Without a mirror the read waits for the server as before.
 */

export const DEFAULT_MIRROR_READ_TIMEOUT_MS = 4_000;

export class MirrorReadTimeoutError extends Error {
  constructor() {
    super("Team read timed out.");
    this.name = "TimeoutError";
  }
}

export const OFFLINE_READ_ONLY = "OFFLINE_READ_ONLY";

export function isConnectivityError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (
    name === "TypeError" ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "AuthRetryableFetchError"
  ) {
    return true;
  }
  return typeof message === "string" && /failed to fetch|load failed|network|fetch failed|timed? ?out/i.test(message);
}

export function createMirroredTeamRepository({
  inner,
  userId,
  serverAvailable = true,
  readTimeoutMs = DEFAULT_MIRROR_READ_TIMEOUT_MS,
}: {
  inner: TeamRepository;
  userId: string;
  serverAvailable?: boolean;
  /** Reads fall back to an existing mirror after this long (≤ 0: never). */
  readTimeoutMs?: number;
}): TeamRepository {
  let source: TeamDataSource = serverAvailable ? "server" : "mirror";

  const readMirrorTeams = (cause: unknown): Team[] => {
    const teams = getMirroredTeams(userId);
    if (!teams) throw cause;
    source = "mirror";
    return teams;
  };

  const shouldFallBack = (cause: unknown) => !serverAvailable || isConnectivityError(cause);

  // Without a session, or offline with a mirror, reads go straight to the
  // mirror instead of waiting for a request that cannot succeed.
  const preferMirror = () =>
    !serverAvailable ||
    (typeof navigator !== "undefined" && navigator.onLine === false && getCloudTeamMirror(userId) !== null);

  // A server read, bounded by the timeout only when there is a mirror to fall
  // back to; the mirror is refreshed by `onResult` even when it answers late.
  const serverRead = <T,>(read: () => Promise<T>, onResult: (value: T) => void): Promise<T> => {
    const request = read().then((value) => {
      onResult(value);
      return value;
    });

    if (readTimeoutMs <= 0 || typeof window === "undefined" || getCloudTeamMirror(userId) === null) {
      return request;
    }

    // A late failure has nobody waiting for it.
    request.catch(() => undefined);

    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new MirrorReadTimeoutError()), readTimeoutMs);
      request.then(
        (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        (cause: unknown) => {
          window.clearTimeout(timer);
          reject(cause);
        }
      );
    });
  };

  const requireServer = () => {
    if (!serverAvailable) throw new Error(OFFLINE_READ_ONLY);
  };

  // Keep the mirror in step with successful edits.
  const mirrorTeam = async (operation: Promise<Team>): Promise<Team> => {
    const team = await operation;
    upsertMirroredTeam(userId, team);
    return team;
  };

  return {
    mode: inner.mode,
    getDataSource: () => source,
    async getTeams() {
      if (preferMirror()) return readMirrorTeams(new Error(OFFLINE_READ_ONLY));

      try {
        const teams = await serverRead(
          () => inner.getTeams(),
          (value) => saveMirroredTeams(userId, value)
        );
        source = "server";
        return teams;
      } catch (cause) {
        if (!shouldFallBack(cause)) throw cause;
        return readMirrorTeams(cause);
      }
    },
    async getTeam(teamId) {
      const fromMirror = () => {
        const mirror = getCloudTeamMirror(userId);
        const team = mirror?.teams.find((item) => item.id === teamId);
        return mirror && team ? mirroredTeamToTeam(team, mirror.savedAt) : null;
      };

      if (preferMirror()) return fromMirror();

      try {
        return await serverRead(
          () => inner.getTeam(teamId),
          (team) => {
            if (team) upsertMirroredTeam(userId, team);
          }
        );
      } catch (cause) {
        if (!shouldFallBack(cause)) throw cause;
        const team = fromMirror();
        if (!team) throw cause;
        return team;
      }
    },
    async getActiveTeamId() {
      if (preferMirror()) {
        const mirror = getCloudTeamMirror(userId);
        if (!mirror) throw new Error(OFFLINE_READ_ONLY);
        return mirror.activeTeamId;
      }

      try {
        return await serverRead(
          () => inner.getActiveTeamId(),
          (activeTeamId) => saveMirroredActiveTeamId(userId, activeTeamId)
        );
      } catch (cause) {
        if (!shouldFallBack(cause)) throw cause;
        const mirror = getCloudTeamMirror(userId);
        if (!mirror) throw cause;
        return mirror.activeTeamId;
      }
    },
    async setActiveTeam(teamId) {
      // Choosing the active team is a device preference too, so it also works
      // offline on the mirror; the server learns it on the next online choice.
      const setOnMirror = (cause: unknown) => {
        const mirror = getCloudTeamMirror(userId);
        if (!mirror || !mirror.teams.some((team) => team.id === teamId)) throw cause;
        saveMirroredActiveTeamId(userId, teamId);
        return teamId;
      };

      if (preferMirror()) return setOnMirror(new Error(OFFLINE_READ_ONLY));

      try {
        const activeTeamId = await inner.setActiveTeam(teamId);
        saveMirroredActiveTeamId(userId, activeTeamId);
        return activeTeamId;
      } catch (cause) {
        if (!shouldFallBack(cause)) throw cause;
        return setOnMirror(cause);
      }
    },
    async createTeam(name) {
      requireServer();
      return mirrorTeam(inner.createTeam(name));
    },
    async deleteTeam(teamId) {
      requireServer();
      const result = await inner.deleteTeam(teamId);
      const remaining = (getMirroredTeams(userId) ?? []).filter((team) => team.id !== result.deletedTeamId);
      saveMirroredTeams(userId, remaining);
      saveMirroredActiveTeamId(userId, result.nextActiveTeamId);
      return result;
    },
    async renameTeam(teamId, name) {
      requireServer();
      return mirrorTeam(inner.renameTeam(teamId, name));
    },
    async addPlayer(teamId, name) {
      requireServer();
      return mirrorTeam(inner.addPlayer(teamId, name));
    },
    async renamePlayer(teamId, playerId, name) {
      requireServer();
      return mirrorTeam(inner.renamePlayer(teamId, playerId, name));
    },
    async deletePlayer(teamId, playerId) {
      requireServer();
      return mirrorTeam(inner.deletePlayer(teamId, playerId));
    },
    async reorderPlayer(teamId, playerId, direction) {
      requireServer();
      return mirrorTeam(inner.reorderPlayer(teamId, playerId, direction));
    },
  };
}
