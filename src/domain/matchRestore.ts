import type { LiveMatchState } from "@/domain/liveMatch";
import type { Player } from "@/domain/team";

/**
 * Pure rules for restoring a match on this device (OFF-01a). localStorage is
 * the authoritative source for a match in progress; the server is a sync
 * target and never replaces newer local data.
 */

// ─── Which live state wins ────────────────────────────────────────────────────

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isSameMatch(a: LiveMatchState, b: LiveMatchState): boolean {
  return a.id === b.id || a.setupId === b.setupId;
}

/**
 * Whether a server snapshot (`runtimeState`) may replace the local live
 * state:
 * - no local state: yes;
 * - a different local match: only when that one has ended (a match still in
 *   progress here always wins; the device is authoritative, FP-P0-F2);
 * - the same match: only when the server copy is strictly newer and the
 *   local one has not ended (an ended match is never revived).
 */
export function mayServerReplaceLocal(
  local: LiveMatchState | null,
  server: LiveMatchState | null
): boolean {
  if (!server) return false;
  if (!local) return true;
  if (!isSameMatch(local, server)) return local.status === "ended";
  if (local.status === "ended") return false;

  const localMs = parseIsoMs(local.updatedAt);
  const serverMs = parseIsoMs(server.updatedAt);
  if (localMs === null || serverMs === null) return false;
  return serverMs > localMs;
}

/**
 * The live state to keep when the restore runs again in a session (the team
 * list reloaded, the session was re-authenticated). The in-memory state of
 * the same match is never replaced by what was read from storage: every
 * in-memory change is saved, so storage is at best as new, and older when a
 * save failed (a full device).
 */
export function keepInMemoryLiveMatch(
  inMemory: LiveMatchState | null,
  restored: LiveMatchState | null
): LiveMatchState | null {
  if (inMemory && restored && isSameMatch(inMemory, restored)) return inMemory;
  return restored;
}

// ─── Squad ────────────────────────────────────────────────────────────────────

export interface RestoreSquadSnapshot {
  setupId: string;
  teamId: string;
  players: ReadonlyArray<Pick<Player, "id" | "name" | "number" | "preferredPosition">>;
}

export type RestoreSquadSource = "team" | "snapshot" | "placeholder";

export interface RestoreSquad {
  /** Where most names came from: the team, else the snapshot, else placeholders. */
  source: RestoreSquadSource;
  players: Player[];
  /**
   * Players whose name is a placeholder («Spiller 3»). Their names are for
   * this screen only: never stored in events or sent to the server.
   */
  placeholderPlayerIds: string[];
}

const PLACEHOLDER_TIMESTAMP = new Date(0).toISOString();

function toPlayer(
  player: Pick<Player, "id" | "name" | "number" | "preferredPosition">
): Player {
  return {
    id: player.id,
    name: player.name,
    number: player.number,
    preferredPosition: player.preferredPosition,
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: PLACEHOLDER_TIMESTAMP,
    updatedAt: PLACEHOLDER_TIMESTAMP,
  };
}

/**
 * Players for a stored match, merged per player:
 * 1. the team from the workspace (live server data or the local mirror),
 * 2. for match players missing from the team (deleted or renamed away
 *    elsewhere, or no team at all), the squad snapshot saved when the match
 *    was started,
 * 3. when a local match exists, placeholders built from the match's own
 *    player ids for anyone still missing, so the match (score, minutes,
 *    events) is never dropped for lack of names and no raw id is shown.
 *
 * Returns null only when there is no team, no snapshot and no local match to
 * restore (today's behaviour: nothing to show).
 */
export function resolveRestoreSquad(input: {
  setupId: string;
  teamId: string;
  squadPlayerIds: readonly string[];
  team: { id: string; players: Player[] } | null;
  snapshot: RestoreSquadSnapshot | null;
  liveMatch: LiveMatchState | null;
  hasLocalMatch: boolean;
  placeholderName: (index: number) => string;
}): RestoreSquad | null {
  const team = input.team && input.team.id === input.teamId ? input.team : null;
  const snapshot =
    input.snapshot && input.snapshot.setupId === input.setupId && input.snapshot.players.length > 0
      ? input.snapshot
      : null;

  if (!team && !snapshot && !input.hasLocalMatch) {
    return null;
  }

  // The match's own players, in squad order.
  const matchIds: string[] = [];
  const add = (id: string) => {
    if (!matchIds.includes(id)) matchIds.push(id);
  };
  input.squadPlayerIds.forEach(add);
  input.liveMatch?.onFieldPlayerIds.forEach(add);
  input.liveMatch?.benchPlayerIds.forEach(add);

  const players: Player[] = team ? [...team.players] : [];
  const known = new Set(players.map((player) => player.id));

  if (snapshot) {
    const wanted = team ? new Set(matchIds) : null;
    for (const player of snapshot.players) {
      if (known.has(player.id) || (wanted && !wanted.has(player.id))) continue;
      players.push(toPlayer(player));
      known.add(player.id);
    }
  }

  const placeholderPlayerIds: string[] = [];
  if (input.hasLocalMatch) {
    matchIds.forEach((id, index) => {
      if (known.has(id)) return;
      players.push(toPlayer({ id, name: input.placeholderName(index + 1) }));
      known.add(id);
      placeholderPlayerIds.push(id);
    });
  }

  return {
    source: team ? "team" : snapshot ? "snapshot" : "placeholder",
    players,
    placeholderPlayerIds,
  };
}

// ─── Closed-app gap (B9) ──────────────────────────────────────────────────────

export const CLOSED_GAP_THRESHOLD_MS = 60_000;

export interface ClosedGap {
  closedMs: number;
  /** Whole minutes for the notice, at least 1. */
  minutes: number;
}

/**
 * How long the app was closed while this match's clock was running, from the
 * last heartbeat. Null when there is no heartbeat for this match, the clock
 * is not running, or the gap is at most the threshold (a quick reload).
 * Informational only: the clock is wall-clock based and is never adjusted.
 */
export function detectClosedGap(input: {
  heartbeat: { matchId: string; atMs: number } | null;
  liveMatch: LiveMatchState | null;
  nowMs: number;
  thresholdMs?: number;
}): ClosedGap | null {
  const { heartbeat, liveMatch, nowMs } = input;
  const thresholdMs = input.thresholdMs ?? CLOSED_GAP_THRESHOLD_MS;

  if (!heartbeat || !liveMatch || heartbeat.matchId !== liveMatch.id) return null;
  if (!liveMatch.clock.isRunning || liveMatch.status !== "running") return null;

  const closedMs = nowMs - heartbeat.atMs;
  if (!Number.isFinite(closedMs) || closedMs <= thresholdMs) return null;

  return { closedMs, minutes: Math.max(1, Math.round(closedMs / 60_000)) };
}
