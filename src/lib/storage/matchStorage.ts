import {
  assignStarterToSlot,
  createMatchSetup,
  setDurationFromLegacy,
  setSelectedSquad,
  type MatchFormat,
  type MatchConfig,
} from "@/domain/match";

const MATCH_SETUP_KEY = "fairplayr.matchSetup.v1";
const STORAGE_VERSION = 2;

// ─── Status ───────────────────────────────────────────────────────────────────

/**
 * "draft"  — coach is configuring; setup may be incomplete.
 * "active" — match has been started; live match screen should be shown.
 * "ended"  — match is over (reserved for future use).
 */
export type MatchStatus = "draft" | "active" | "ended";

export interface StoredMatchConfig {
  config: MatchConfig;
  status: MatchStatus;
}

// ─── Envelope ─────────────────────────────────────────────────────────────────

interface StorageEnvelope {
  version: number;
  config: MatchConfig;
  status: MatchStatus;
}

interface LegacyEnvelope {
  version: number;
  setup: {
    id: string;
    teamId: string;
    format: MatchFormat;
    durationMinutes: number;
    squadPlayerIds: string[];
    startingPlayerIds: string[];
    createdAt: string;
    updatedAt: string;
  };
  status: MatchStatus;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function readNumber(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

const VALID_FORMATS: MatchFormat[] = ["3v3", "5v5", "7v7", "9v9", "11v11"];
const VALID_STATUSES: MatchStatus[] = ["draft", "active", "ended"];

function toValidMatchConfig(v: unknown): MatchConfig | null {
  if (!isRecord(v)) return null;

  const id = readString(v.id);
  const teamId = readString(v.teamId);
  const format = readString(v.format);
  const formationId = readString(v.formationId);
  const duration = isRecord(v.duration) ? v.duration : null;
  const durationMinutes = duration ? readNumber(duration.totalMinutes) : null;
  const createdAt = readString(v.createdAt);
  const updatedAt = readString(v.updatedAt);

  if (
    !id ||
    !teamId ||
    !format ||
    !formationId ||
    durationMinutes === null ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  if (!VALID_FORMATS.includes(format as MatchFormat)) return null;

  const rawSquad = Array.isArray(v.selectedPlayerIds) ? v.selectedPlayerIds : [];
  const rawStarters = Array.isArray(v.startingPlayerIds)
    ? v.startingPlayerIds
    : [];
  const rawAssignments = isRecord(v.slotAssignments) ? v.slotAssignments : {};

  const selectedPlayerIds = rawSquad.filter(
    (x): x is string => typeof x === "string"
  );
  const startingPlayerIds = rawStarters.filter(
    (x): x is string => typeof x === "string" && selectedPlayerIds.includes(x)
  );

  const slotAssignments: Record<string, string | null> = {};

  for (const [slotId, playerId] of Object.entries(rawAssignments)) {
    slotAssignments[slotId] =
      typeof playerId === "string" && selectedPlayerIds.includes(playerId)
        ? playerId
        : null;
  }

  return {
    id,
    teamId,
    format: format as MatchFormat,
    formationId,
    duration: {
      mode:
        duration && duration.mode === "custom"
          ? "custom"
          : "preset",
      presetId:
        duration && typeof duration.presetId === "string"
          ? (duration.presetId as MatchConfig["duration"]["presetId"])
          : null,
      halves:
        duration && typeof duration.halves === "number"
          ? duration.halves
          : 2,
      minutesPerHalf:
        duration && typeof duration.minutesPerHalf === "number"
          ? duration.minutesPerHalf
          : Math.max(1, Math.round(durationMinutes / 2)),
      totalMinutes: durationMinutes,
    },
    selectedPlayerIds,
    startingPlayerIds,
    slotAssignments,
    createdAt,
    updatedAt,
  };
}

function isValidEnvelope(v: unknown): v is StorageEnvelope {
  if (!isRecord(v)) return false;
  return (
    typeof v.version === "number" &&
    isRecord(v.config) &&
    typeof v.status === "string" &&
    VALID_STATUSES.includes(v.status as MatchStatus)
  );
}

function isLegacyEnvelope(v: unknown): v is LegacyEnvelope {
  if (!isRecord(v)) {
    return false;
  }

  return (
    typeof v.version === "number" &&
    isRecord(v.setup) &&
    typeof v.status === "string" &&
    VALID_STATUSES.includes(v.status as MatchStatus)
  );
}

function migrateLegacySetup(legacy: LegacyEnvelope["setup"]): MatchConfig | null {
  if (!legacy || !VALID_FORMATS.includes(legacy.format)) {
    return null;
  }

  let config = createMatchSetup(legacy.teamId, legacy.format);
  config = setDurationFromLegacy(config, legacy.durationMinutes);
  config = setSelectedSquad(config, legacy.squadPlayerIds);

  legacy.startingPlayerIds.forEach((playerId, index) => {
    const slotId = Object.keys(config.slotAssignments)[index];

    if (!slotId) {
      return;
    }

    config = assignStarterToSlot(config, slotId, playerId);
  });

  return {
    ...config,
    id: legacy.id,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getStoredMatchSetup(): StoredMatchConfig | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(MATCH_SETUP_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (isValidEnvelope(parsed)) {
      if (parsed.version !== STORAGE_VERSION) return null;

      const config = toValidMatchConfig(parsed.config);
      if (!config) return null;

      return { config, status: parsed.status };
    }

    if (!isLegacyEnvelope(parsed)) {
      return null;
    }

    const config = migrateLegacySetup(parsed.setup);
    if (!config) {
      return null;
    }

    const migrated: StoredMatchConfig = {
      config,
      status: parsed.status,
    };

    writeEnvelope(config, parsed.status);

    return migrated;
  } catch {
    return null;
  }
}

/** Save the current setup as a draft (coach is still configuring). */
export function saveMatchSetupDraft(config: MatchConfig): void {
  writeEnvelope(config, "draft");
}

/**
 * Mark the match as active (coach tapped "Start Match").
 * The live match screen reads this to know a match is in progress.
 */
export function activateMatch(config: MatchConfig): void {
  writeEnvelope(config, "active");
}

/** Mark the match as ended. */
export function endMatch(config: MatchConfig): void {
  writeEnvelope(config, "ended");
}

export function updateMatchConfig(config: MatchConfig): void {
  const stored = getStoredMatchSetup();

  if (stored) {
    writeEnvelope(config, stored.status);
    return;
  }

  writeEnvelope(config, "draft");
}

export function clearStoredMatchSetup(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MATCH_SETUP_KEY);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function writeEnvelope(config: MatchConfig, status: MatchStatus): void {
  if (typeof window === "undefined") return;
  const envelope: StorageEnvelope = {
    version: STORAGE_VERSION,
    config,
    status,
  };
  window.localStorage.setItem(MATCH_SETUP_KEY, JSON.stringify(envelope));
}
