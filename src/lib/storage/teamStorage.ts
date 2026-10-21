import type { Team, Player } from "@/domain/team";
import {
  classifyVersion,
  reportNewerStoredVersion,
  safeRemoveItem,
  setItemOrThrow,
} from "@/lib/storage/storageEnvelope";

const LEGACY_TEAM_STORAGE_KEY = "fairplayr.team.v1";
export const TEAM_STORAGE_KEY = "fairplayr.teams.v2";
const TEAM_STORAGE_VERSION = 2;

interface LegacyTeamStorageEnvelope {
  version: number;
  team: Team;
}

interface TeamWorkspaceStorageEnvelope {
  version: number;
  teams: Team[];
  activeTeamId: string | null;
}

function isLegacyStorageEnvelope(value: unknown): value is LegacyTeamStorageEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.version === "number" && "team" in value;
}

function isWorkspaceEnvelope(value: unknown): value is TeamWorkspaceStorageEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.version === "number" &&
    Array.isArray(value.teams) &&
    (typeof value.activeTeamId === "string" || value.activeTeamId === null)
  );
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

  const source = value.source === "spond" ? "spond" : "manual";
  const externalProvider = typeof value.externalProvider === "string" ? value.externalProvider : null;
  const externalId = typeof value.externalId === "string" ? value.externalId : null;
  const isManaged =
    typeof value.isManaged === "boolean" ? value.isManaged : source === "spond";

  return {
    id,
    name,
    number: typeof value.number === "number" ? value.number : undefined,
    preferredPosition:
      typeof value.preferredPosition === "string"
        ? value.preferredPosition
        : undefined,
    source,
    externalProvider,
    externalId,
    isManaged,
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

function toValidTeams(value: unknown): Team[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((team) => toValidTeam(team))
    .filter((team): team is Team => team !== null);
}

function toWorkspace(
  teams: Team[],
  activeTeamId: string | null
): TeamWorkspaceStorageEnvelope {
  const hasActiveTeam = activeTeamId
    ? teams.some((team) => team.id === activeTeamId)
    : false;

  return {
    version: TEAM_STORAGE_VERSION,
    teams,
    activeTeamId: hasActiveTeam ? activeTeamId : teams[0]?.id ?? null,
  };
}

function readLegacySingleTeam(): Team | null {
  const rawLegacy = window.localStorage.getItem(LEGACY_TEAM_STORAGE_KEY);

  if (!rawLegacy) {
    return null;
  }

  try {
    const parsedLegacy = JSON.parse(rawLegacy) as unknown;

    if (isLegacyStorageEnvelope(parsedLegacy)) {
      if (parsedLegacy.version !== 1) {
        return null;
      }

      return toValidTeam(parsedLegacy.team);
    }

    return toValidTeam(parsedLegacy);
  } catch {
    return null;
  }
}

function migrateLegacyIfNeeded(): TeamWorkspaceStorageEnvelope | null {
  const legacyTeam = readLegacySingleTeam();

  if (!legacyTeam) {
    return null;
  }

  const workspace = toWorkspace([legacyTeam], legacyTeam.id);

  try {
    saveStoredTeamWorkspace(workspace);
  } catch {
    // Not saved (a full device, or a newer build's teams): keep the legacy
    // copy and use the team from memory; a later read retries.
    return workspace;
  }

  window.localStorage.removeItem(LEGACY_TEAM_STORAGE_KEY);

  return workspace;
}

export function getStoredTeamWorkspace(): TeamWorkspaceStorageEnvelope {
  if (typeof window === "undefined") {
    return {
      version: TEAM_STORAGE_VERSION,
      teams: [],
      activeTeamId: null,
    };
  }

  try {
    const raw = window.localStorage.getItem(TEAM_STORAGE_KEY);

    if (!raw) {
      return (
        migrateLegacyIfNeeded() ?? {
          version: TEAM_STORAGE_VERSION,
          teams: [],
          activeTeamId: null,
        }
      );
    }

    const parsed = JSON.parse(raw) as unknown;
    const versionClass = isRecord(parsed)
      ? classifyVersion(parsed.version, TEAM_STORAGE_VERSION)
      : "invalid";

    // A newer build's teams are read tolerantly and never replaced here: an
    // empty workspace would let this build write over them.
    if (versionClass === "newer" && isRecord(parsed) && Array.isArray(parsed.teams)) {
      reportNewerStoredVersion(TEAM_STORAGE_KEY);
      const activeTeamId = typeof parsed.activeTeamId === "string" ? parsed.activeTeamId : null;
      return toWorkspace(toValidTeams(parsed.teams), activeTeamId);
    }

    if (versionClass === "older" && isWorkspaceEnvelope(parsed)) {
      const migrated = toWorkspace(toValidTeams(parsed.teams), parsed.activeTeamId ?? null);
      try {
        saveStoredTeamWorkspace(migrated);
      } catch {
        // Still usable from memory; the next write retries.
      }
      return migrated;
    }

    if (!isWorkspaceEnvelope(parsed) || versionClass !== "current") {
      return (
        migrateLegacyIfNeeded() ?? {
          version: TEAM_STORAGE_VERSION,
          teams: [],
          activeTeamId: null,
        }
      );
    }

    return toWorkspace(toValidTeams(parsed.teams), parsed.activeTeamId ?? null);
  } catch {
    return (
      migrateLegacyIfNeeded() ?? {
        version: TEAM_STORAGE_VERSION,
        teams: [],
        activeTeamId: null,
      }
    );
  }
}

export function saveStoredTeamWorkspace(workspace: {
  teams: Team[];
  activeTeamId: string | null;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload = toWorkspace(workspace.teams, workspace.activeTeamId);
  // Throws on a failed write, as before; refuses to replace a newer build's teams.
  setItemOrThrow(TEAM_STORAGE_KEY, JSON.stringify(payload), TEAM_STORAGE_VERSION);
}

export function getStoredTeams(): Team[] {
  return getStoredTeamWorkspace().teams;
}

export function getStoredActiveTeamId(): string | null {
  return getStoredTeamWorkspace().activeTeamId;
}

export function setStoredActiveTeamId(teamId: string | null): string | null {
  const workspace = getStoredTeamWorkspace();
  const nextWorkspace = toWorkspace(workspace.teams, teamId);
  saveStoredTeamWorkspace(nextWorkspace);
  return nextWorkspace.activeTeamId;
}

export function getStoredTeamById(teamId: string): Team | null {
  const workspace = getStoredTeamWorkspace();
  return workspace.teams.find((team) => team.id === teamId) ?? null;
}

export function getStoredTeam(): Team | null {
  const workspace = getStoredTeamWorkspace();

  if (!workspace.activeTeamId) {
    return null;
  }

  return workspace.teams.find((team) => team.id === workspace.activeTeamId) ?? null;
}

export function saveStoredTeam(team: Team): void {
  const workspace = getStoredTeamWorkspace();
  const existingIndex = workspace.teams.findIndex((item) => item.id === team.id);
  const nextTeams = [...workspace.teams];

  if (existingIndex >= 0) {
    nextTeams[existingIndex] = team;
  } else {
    nextTeams.push(team);
  }

  saveStoredTeamWorkspace({
    teams: nextTeams,
    activeTeamId: workspace.activeTeamId ?? team.id,
  });
}

export function clearStoredTeam(): void {
  if (typeof window === "undefined") {
    return;
  }

  const workspace = getStoredTeamWorkspace();

  if (!workspace.activeTeamId) {
    safeRemoveItem(TEAM_STORAGE_KEY, TEAM_STORAGE_VERSION);
    window.localStorage.removeItem(LEGACY_TEAM_STORAGE_KEY);
    return;
  }

  const remainingTeams = workspace.teams.filter((team) => team.id !== workspace.activeTeamId);

  if (remainingTeams.length === 0) {
    safeRemoveItem(TEAM_STORAGE_KEY, TEAM_STORAGE_VERSION);
    window.localStorage.removeItem(LEGACY_TEAM_STORAGE_KEY);
    return;
  }

  saveStoredTeamWorkspace({
    teams: remainingTeams,
    activeTeamId: remainingTeams[0].id,
  });
}
