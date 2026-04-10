/**
 * Match domain — types and pure functions.
 *
 * This module is the single source of truth for all match-related
 * business logic. No UI concerns, no storage concerns, no side effects.
 */

// ─── Core types ───────────────────────────────────────────────────────────────

export type MatchFormat = "3v3" | "5v5" | "7v7" | "9v9" | "11v11";

/** Number of players on the field per team for each format */
export const FORMAT_FIELD_COUNT: Record<MatchFormat, number> = {
  "3v3": 3,
  "5v5": 5,
  "7v7": 7,
  "9v9": 9,
  "11v11": 11,
};

export const ALL_FORMATS: readonly MatchFormat[] = [
  "3v3",
  "5v5",
  "7v7",
  "9v9",
  "11v11",
];

/** Sensible default duration (total minutes) for each format */
export const FORMAT_DEFAULT_DURATION: Record<MatchFormat, number> = {
  "3v3": 30,
  "5v5": 40,
  "7v7": 50,
  "9v9": 60,
  "11v11": 90,
};

/** Pre-set duration options shown in the picker for each format */
export const FORMAT_DURATION_PRESETS: Record<MatchFormat, readonly number[]> = {
  "3v3": [20, 30, 40],
  "5v5": [30, 40, 50],
  "7v7": [40, 50, 60],
  "9v9": [50, 60, 70],
  "11v11": [60, 75, 80, 90],
};

/**
 * All configuration needed to start a match.
 *
 * Status ("draft" / "active") is deliberately kept out of this type —
 * it belongs to the storage envelope, not the domain object.
 */
export interface MatchSetup {
  id: string;
  teamId: string;
  format: MatchFormat;
  /** Total match duration in minutes (both halves combined for future use) */
  durationMinutes: number;
  /** Ordered list of all player IDs included in this match */
  squadPlayerIds: string[];
  /**
   * IDs of players who start on the field.
   * Must be a subset of squadPlayerIds.
   * Must have exactly FORMAT_FIELD_COUNT[format] entries to start.
   */
  startingPlayerIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function createMatchSetup(
  teamId: string,
  format: MatchFormat = "5v5"
): MatchSetup {
  const now = nowIso();
  return {
    id: generateId(),
    teamId,
    format,
    durationMinutes: FORMAT_DEFAULT_DURATION[format],
    squadPlayerIds: [],
    startingPlayerIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Setters ──────────────────────────────────────────────────────────────────

/**
 * Change the match format.
 * Resets duration to the new default.
 * Trims startingPlayerIds if the new format needs fewer starters.
 */
export function setMatchFormat(
  setup: MatchSetup,
  format: MatchFormat
): MatchSetup {
  const newFieldCount = FORMAT_FIELD_COUNT[format];
  return {
    ...setup,
    format,
    durationMinutes: FORMAT_DEFAULT_DURATION[format],
    startingPlayerIds: setup.startingPlayerIds.slice(0, newFieldCount),
    updatedAt: nowIso(),
  };
}

export function setMatchDuration(
  setup: MatchSetup,
  durationMinutes: number
): MatchSetup {
  return { ...setup, durationMinutes, updatedAt: nowIso() };
}

// ─── Squad management ─────────────────────────────────────────────────────────

/** Add or remove a player from the match squad. */
export function toggleSquadPlayer(
  setup: MatchSetup,
  playerId: string
): MatchSetup {
  if (setup.squadPlayerIds.includes(playerId)) {
    return {
      ...setup,
      squadPlayerIds: setup.squadPlayerIds.filter((id) => id !== playerId),
      startingPlayerIds: setup.startingPlayerIds.filter((id) => id !== playerId),
      updatedAt: nowIso(),
    };
  }
  return {
    ...setup,
    squadPlayerIds: [...setup.squadPlayerIds, playerId],
    updatedAt: nowIso(),
  };
}

// ─── Lineup management ────────────────────────────────────────────────────────

/**
 * Move a squad player to the starting lineup.
 * Noop if: already starting, not in squad, or starting lineup is full.
 */
export function promoteToStarter(
  setup: MatchSetup,
  playerId: string
): MatchSetup {
  const fieldCount = FORMAT_FIELD_COUNT[setup.format];
  if (
    setup.startingPlayerIds.includes(playerId) ||
    !setup.squadPlayerIds.includes(playerId) ||
    setup.startingPlayerIds.length >= fieldCount
  ) {
    return setup;
  }
  return {
    ...setup,
    startingPlayerIds: [...setup.startingPlayerIds, playerId],
    updatedAt: nowIso(),
  };
}

/** Move a starting player to the bench. Noop if not currently a starter. */
export function demoteToBench(setup: MatchSetup, playerId: string): MatchSetup {
  if (!setup.startingPlayerIds.includes(playerId)) return setup;
  return {
    ...setup,
    startingPlayerIds: setup.startingPlayerIds.filter((id) => id !== playerId),
    updatedAt: nowIso(),
  };
}

// ─── Derived data ─────────────────────────────────────────────────────────────

/** Players in the squad who are not in the starting lineup. */
export function getBenchPlayerIds(setup: MatchSetup): string[] {
  return setup.squadPlayerIds.filter(
    (id) => !setup.startingPlayerIds.includes(id)
  );
}

/** How many starters this format requires. */
export function getRequiredStarters(setup: MatchSetup): number {
  return FORMAT_FIELD_COUNT[setup.format];
}

/** How many more starters need to be assigned. Negative = too many (shouldn't happen). */
export function getStarterDeficit(setup: MatchSetup): number {
  return FORMAT_FIELD_COUNT[setup.format] - setup.startingPlayerIds.length;
}

/** Returns true when the setup is complete and a match can be started. */
export function canStartMatch(setup: MatchSetup): boolean {
  return (
    setup.durationMinutes > 0 &&
    setup.startingPlayerIds.length === FORMAT_FIELD_COUNT[setup.format] &&
    setup.startingPlayerIds.every((id) => setup.squadPlayerIds.includes(id))
  );
}

// ─── Reconciliation ───────────────────────────────────────────────────────────

/**
 * Remove any player IDs from the setup that are no longer in the team.
 * Call this after loading a stored setup to guard against deleted players.
 * Returns the same object reference if nothing changed (cheap equality check).
 */
export function reconcileWithTeam(
  setup: MatchSetup,
  currentPlayerIds: string[]
): MatchSetup {
  const idSet = new Set(currentPlayerIds);
  const validSquad = setup.squadPlayerIds.filter((id) => idSet.has(id));
  const validStarters = setup.startingPlayerIds.filter((id) =>
    validSquad.includes(id)
  );

  if (
    validSquad.length === setup.squadPlayerIds.length &&
    validStarters.length === setup.startingPlayerIds.length
  ) {
    return setup;
  }

  return {
    ...setup,
    squadPlayerIds: validSquad,
    startingPlayerIds: validStarters,
    updatedAt: nowIso(),
  };
}
