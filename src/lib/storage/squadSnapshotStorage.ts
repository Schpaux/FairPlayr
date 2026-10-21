import type { Player } from "@/domain/team";
import {
  readMinimalPlayers,
  toMinimalPlayer,
  type MinimalPlayer,
} from "@/lib/storage/cloudTeamMirrorStorage";
import {
  classifyVersion,
  reportNewerStoredVersion,
  safeRemoveItem,
  safeSetItem,
} from "@/lib/storage/storageEnvelope";

/**
 * The started match's own squad (OFF-01a task 4): saved once the live screen
 * has the team for an active setup, so the match can be restored with names
 * even when the team list is unavailable (signed in offline without a mirror,
 * a team deleted elsewhere). Only the players in the match, with the minimal
 * fields (AGENTS.md §2). One snapshot at a time; a new match replaces it.
 */

export const SQUAD_SNAPSHOT_KEY = "fairplayr.squadSnapshot.v1";
const SNAPSHOT_VERSION = 1;

export interface SquadSnapshot {
  setupId: string;
  teamId: string;
  savedAt: string;
  players: MinimalPlayer[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRaw(): { snapshot: SquadSnapshot | null; newer: boolean } {
  if (typeof window === "undefined") return { snapshot: null, newer: false };

  try {
    const raw = window.localStorage.getItem(SQUAD_SNAPSHOT_KEY);
    if (!raw) return { snapshot: null, newer: false };
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return { snapshot: null, newer: false };

    const newer = classifyVersion(parsed.version, SNAPSHOT_VERSION) === "newer";
    if (newer) reportNewerStoredVersion(SQUAD_SNAPSHOT_KEY);

    if (typeof parsed.setupId !== "string" || typeof parsed.teamId !== "string") {
      return { snapshot: null, newer };
    }

    return {
      snapshot: {
        setupId: parsed.setupId,
        teamId: parsed.teamId,
        savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(0).toISOString(),
        players: readMinimalPlayers(parsed.players),
      },
      newer,
    };
  } catch {
    return { snapshot: null, newer: false };
  }
}

/** The snapshot for this setup, or null. */
export function getSquadSnapshot(setupId: string): SquadSnapshot | null {
  const { snapshot } = readRaw();
  return snapshot && snapshot.setupId === setupId ? snapshot : null;
}

function sameMinimalPlayers(a: MinimalPlayer[], b: MinimalPlayer[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Stores the squad of a started match: only `squadPlayerIds` from `players`.
 * Skips the write when nothing changed. Never throws.
 */
export function saveSquadSnapshot(input: {
  setupId: string;
  teamId: string;
  squadPlayerIds: readonly string[];
  players: readonly Player[];
}): boolean {
  if (typeof window === "undefined") return false;

  const squad = new Set(input.squadPlayerIds);
  const players = input.players.filter((player) => squad.has(player.id)).map(toMinimalPlayer);
  const { snapshot: existing, newer } = readRaw();
  if (newer) return false;

  if (
    existing &&
    existing.setupId === input.setupId &&
    existing.teamId === input.teamId &&
    sameMinimalPlayers(existing.players, players)
  ) {
    return true;
  }

  const payload = {
    version: SNAPSHOT_VERSION,
    setupId: input.setupId,
    teamId: input.teamId,
    savedAt: new Date().toISOString(),
    players,
  };

  return safeSetItem(SQUAD_SNAPSHOT_KEY, JSON.stringify(payload), SNAPSHOT_VERSION).ok;
}

export function clearSquadSnapshot(): void {
  safeRemoveItem(SQUAD_SNAPSHOT_KEY, SNAPSHOT_VERSION);
}
