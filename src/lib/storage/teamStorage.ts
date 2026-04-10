import type { Team, Player } from "@/domain/team";

const TEAM_STORAGE_KEY = "fairplayr.team.v1";
const TEAM_STORAGE_VERSION = 1;

interface TeamStorageEnvelope {
  version: number;
  team: Team;
}

function isStorageEnvelope(value: unknown): value is TeamStorageEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.version === "number" && "team" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toValidPlayer(value: unknown): Player | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const name = readString(value.name);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);

  if (!id || !name || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    name,
    number: typeof value.number === "number" ? value.number : undefined,
    preferredPosition:
      typeof value.preferredPosition === "string"
        ? value.preferredPosition
        : undefined,
    createdAt,
    updatedAt,
  };
}

function toValidTeam(value: unknown): Team | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const name = readString(value.name);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);

  if (!id || !name || !createdAt || !updatedAt) {
    return null;
  }

  const rawPlayers = Array.isArray(value.players) ? value.players : [];
  const players = rawPlayers
    .map((player) => toValidPlayer(player))
    .filter((player): player is Player => player !== null);

  return {
    id,
    name,
    players,
    createdAt,
    updatedAt,
  };
}

export function getStoredTeam(): Team | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(TEAM_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (isStorageEnvelope(parsed)) {
      if (parsed.version !== TEAM_STORAGE_VERSION) {
        return null;
      }

      return toValidTeam(parsed.team);
    }

    // Backward compatibility for early MVP payloads that stored Team directly.
    return toValidTeam(parsed);
  } catch {
    return null;
  }
}

export function saveStoredTeam(team: Team): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload: TeamStorageEnvelope = {
    version: TEAM_STORAGE_VERSION,
    team,
  };

  window.localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(payload));
}

export function clearStoredTeam(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(TEAM_STORAGE_KEY);
}
