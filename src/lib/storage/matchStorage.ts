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
  /**
   * Server match this setup was started for, or null for a guest/local-only
   * match. Undefined for setups stored before this field existed: their
   * server match is unknown and must be verified, never guessed.
   */
  serverMatchId: string | null | undefined;
}

// ─── Envelope ─────────────────────────────────────────────────────────────────

interface StorageEnvelope {
  version: number;
  config: MatchConfig;
  status: MatchStatus;
  // Optional so setups written before it existed stay valid (read as unknown).
  serverMatchId?: string | null;
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
  const reportEnabled = typeof v.reportEnabled === "boolean" ? v.reportEnabled : false;
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
    reportEnabled,
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
    reportEnabled: false,
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

      const serverMatchId =
        parsed.serverMatchId === undefined
          ? undefined
          : typeof parsed.serverMatchId === "string" && parsed.serverMatchId.length > 0
            ? parsed.serverMatchId
            : null;

      return { config, status: parsed.status, serverMatchId };
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
      serverMatchId: null,
    };

    writeEnvelope(config, parsed.status, null);

    return migrated;
  } catch {
    return null;
  }
}

/**
 * True while a started match owns the stored setup. Only the match lifecycle
 * (`endMatch`, or clearing it through an explicit end/discard) may replace it;
 * navigation and setup editors must leave it alone.
 */
export function hasActiveStoredMatch(): boolean {
  return getStoredMatchSetup()?.status === "active";
}

/**
 * Save the current setup as a draft (coach is still configuring).
 *
 * Refused (returns false) while a match is active: writing a draft over it
 * would demote the running match and hide it from the live screen.
 */
export function saveMatchSetupDraft(config: MatchConfig): boolean {
  if (hasActiveStoredMatch()) return false;
  writeEnvelope(config, "draft");
  return true;
}

/**
 * Mark the match as active (coach tapped "Start Match").
 * The live match screen reads this to know a match is in progress.
 *
 * `serverMatchId` is the server record the match was started for, or null for
 * a guest/local-only match. It is always set explicitly here, so a new start
 * never inherits the server id of a previous match.
 */
export function activateMatch(config: MatchConfig, serverMatchId: string | null = null): void {
  writeEnvelope(config, "active", serverMatchId);
}

/** Mark the match as ended. */
export function endMatch(config: MatchConfig): void {
  writeEnvelope(config, "ended");
}

/** Refused (returns false) while a match is active, like `saveMatchSetupDraft`. */
export function updateMatchConfig(config: MatchConfig): boolean {
  const stored = getStoredMatchSetup();

  if (stored?.status === "active") return false;

  if (stored) {
    writeEnvelope(config, stored.status);
    return true;
  }

  writeEnvelope(config, "draft");
  return true;
}

export function clearStoredMatchSetup(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MATCH_SETUP_KEY);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/** Server match id of the stored setup, kept only while it is the same setup. */
function storedServerMatchIdFor(configId: string): string | null | undefined {
  const stored = getStoredMatchSetup();
  return stored && stored.config.id === configId ? stored.serverMatchId : null;
}

function writeEnvelope(
  config: MatchConfig,
  status: MatchStatus,
  serverMatchId: string | null | undefined = storedServerMatchIdFor(config.id)
): void {
  if (typeof window === "undefined") return;
  const envelope: StorageEnvelope = {
    version: STORAGE_VERSION,
    config,
    status,
    serverMatchId,
  };
  window.localStorage.setItem(MATCH_SETUP_KEY, JSON.stringify(envelope));
}
