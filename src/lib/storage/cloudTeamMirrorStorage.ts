import type { Player, Team } from "@/domain/team";
import {
  classifyVersion,
  reportNewerStoredVersion,
  safeRemoveItem,
  safeSetItem,
} from "@/lib/storage/storageEnvelope";

/**
 * Local read-only mirror of a signed-in coach's cloud teams (FP-OFF-01 §2.3,
 * OFF-01a task 2). Written after every successful fetch, read when the server
 * cannot be reached, cleared on an explicit sign-out.
 *
 * Children's data (AGENTS.md §2): only what the match screen needs is kept,
 * per player `{ id, name, number?, preferredPosition? }`. `name` is the one
 * name field the model has (first name, optionally with surname). No Spond
 * ids, provider data, timestamps or e-mail addresses are stored.
 */

export const CLOUD_TEAM_MIRROR_KEY = "fairplayr.cloudTeamMirror.v1";
const MIRROR_VERSION = 1;

export interface MinimalPlayer {
  id: string;
  name: string;
  number?: number;
  preferredPosition?: string;
}

export interface MirroredTeam {
  id: string;
  name: string;
  players: MinimalPlayer[];
}

export interface CloudTeamMirror {
  userId: string;
  savedAt: string;
  activeTeamId: string | null;
  teams: MirroredTeam[];
}

interface MirrorEnvelope {
  version: number;
  byUser: Record<string, CloudTeamMirror>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function toMinimalPlayer(player: Pick<Player, "id" | "name" | "number" | "preferredPosition">): MinimalPlayer {
  const minimal: MinimalPlayer = { id: player.id, name: player.name };
  if (typeof player.number === "number") minimal.number = player.number;
  if (typeof player.preferredPosition === "string") minimal.preferredPosition = player.preferredPosition;
  return minimal;
}

export function readMinimalPlayer(value: unknown): MinimalPlayer | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id || typeof value.name !== "string") return null;
  return toMinimalPlayer({
    id: value.id,
    name: value.name,
    number: typeof value.number === "number" && Number.isFinite(value.number) ? value.number : undefined,
    preferredPosition: typeof value.preferredPosition === "string" ? value.preferredPosition : undefined,
  });
}

export function readMinimalPlayers(value: unknown): MinimalPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.map(readMinimalPlayer).filter((player): player is MinimalPlayer => player !== null);
}

/**
 * A full `Player` for the UI, built from the minimal fields. The rest is
 * neutral: mirrored data is read-only, so source and management flags only
 * matter for editing, which needs the server anyway.
 */
export function fromMinimalPlayer(player: MinimalPlayer, timestamp: string): Player {
  return {
    id: player.id,
    name: player.name,
    number: player.number,
    preferredPosition: player.preferredPosition,
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function mirroredTeamToTeam(team: MirroredTeam, savedAt: string): Team {
  return {
    id: team.id,
    name: team.name,
    players: team.players.map((player) => fromMinimalPlayer(player, savedAt)),
    createdAt: savedAt,
    updatedAt: savedAt,
  };
}

function readMirroredTeam(value: unknown): MirroredTeam | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || typeof value.name !== "string") {
    return null;
  }
  return { id: value.id, name: value.name, players: readMinimalPlayers(value.players) };
}

function readMirror(value: unknown, userId: string): CloudTeamMirror | null {
  if (!isRecord(value)) return null;
  const teams = Array.isArray(value.teams)
    ? value.teams.map(readMirroredTeam).filter((team): team is MirroredTeam => team !== null)
    : [];
  return {
    userId,
    savedAt: typeof value.savedAt === "string" ? value.savedAt : new Date(0).toISOString(),
    activeTeamId: typeof value.activeTeamId === "string" ? value.activeTeamId : null,
    teams,
  };
}

function readEnvelope(): { envelope: MirrorEnvelope; writable: boolean } {
  const empty = { envelope: { version: MIRROR_VERSION, byUser: {} }, writable: true };
  if (typeof window === "undefined") return empty;

  try {
    const raw = window.localStorage.getItem(CLOUD_TEAM_MIRROR_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.byUser)) return empty;

    const versionClass = classifyVersion(parsed.version, MIRROR_VERSION);
    if (versionClass === "newer") reportNewerStoredVersion(CLOUD_TEAM_MIRROR_KEY);

    const byUser: Record<string, CloudTeamMirror> = {};
    for (const [userId, entry] of Object.entries(parsed.byUser)) {
      const mirror = readMirror(entry, userId);
      if (mirror) byUser[userId] = mirror;
    }

    return { envelope: { version: MIRROR_VERSION, byUser }, writable: versionClass !== "newer" };
  } catch {
    return empty;
  }
}

export function getCloudTeamMirror(userId: string): CloudTeamMirror | null {
  if (!userId) return null;
  return readEnvelope().envelope.byUser[userId] ?? null;
}

/** Mirrored teams as full `Team`s for the workspace, or null without a mirror. */
export function getMirroredTeams(userId: string): Team[] | null {
  const mirror = getCloudTeamMirror(userId);
  if (!mirror) return null;
  return mirror.teams.map((team) => mirroredTeamToTeam(team, mirror.savedAt));
}

function writeMirror(userId: string, update: (previous: CloudTeamMirror | null) => CloudTeamMirror): boolean {
  if (typeof window === "undefined" || !userId) return false;
  const { envelope, writable } = readEnvelope();
  if (!writable) return false;
  const next: MirrorEnvelope = {
    version: MIRROR_VERSION,
    byUser: { ...envelope.byUser, [userId]: update(envelope.byUser[userId] ?? null) },
  };
  return safeSetItem(CLOUD_TEAM_MIRROR_KEY, JSON.stringify(next), MIRROR_VERSION).ok;
}

/** Replaces the mirrored team list after a successful fetch. Never throws. */
export function saveMirroredTeams(userId: string, teams: Team[]): boolean {
  return writeMirror(userId, (previous) => ({
    userId,
    savedAt: new Date().toISOString(),
    activeTeamId:
      previous?.activeTeamId && teams.some((team) => team.id === previous.activeTeamId)
        ? previous.activeTeamId
        : null,
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      players: team.players.map(toMinimalPlayer),
    })),
  }));
}

/** Updates one mirrored team (after a successful edit). Never throws. */
export function upsertMirroredTeam(userId: string, team: Team): boolean {
  const minimal: MirroredTeam = { id: team.id, name: team.name, players: team.players.map(toMinimalPlayer) };
  return writeMirror(userId, (previous) => {
    const teams = previous?.teams ?? [];
    const index = teams.findIndex((item) => item.id === team.id);
    const nextTeams = index >= 0 ? teams.map((item, i) => (i === index ? minimal : item)) : [...teams, minimal];
    return {
      userId,
      savedAt: previous?.savedAt ?? new Date().toISOString(),
      activeTeamId: previous?.activeTeamId ?? null,
      teams: nextTeams,
    };
  });
}

export function saveMirroredActiveTeamId(userId: string, activeTeamId: string | null): boolean {
  return writeMirror(userId, (previous) => ({
    userId,
    savedAt: previous?.savedAt ?? new Date().toISOString(),
    activeTeamId,
    teams: previous?.teams ?? [],
  }));
}

/** Removes one user's mirror (explicit sign-out). Never throws. */
export function clearCloudTeamMirror(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  const { envelope, writable } = readEnvelope();
  if (!writable || !(userId in envelope.byUser)) return;
  const byUser = { ...envelope.byUser };
  delete byUser[userId];

  if (Object.keys(byUser).length === 0) {
    safeRemoveItem(CLOUD_TEAM_MIRROR_KEY, MIRROR_VERSION);
    return;
  }

  safeSetItem(CLOUD_TEAM_MIRROR_KEY, JSON.stringify({ version: MIRROR_VERSION, byUser }), MIRROR_VERSION);
}
