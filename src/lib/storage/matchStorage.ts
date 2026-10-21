import {
  assignStarterToSlot,
  createMatchSetup,
  setDurationFromLegacy,
  setSelectedSquad,
  type MatchFormat,
  type MatchConfig,
} from "@/domain/match";
import {
  classifyVersion,
  isStorageNewerVersionError,
  reportNewerStoredVersion,
  safeRemoveItem,
  setItemOrThrow,
} from "@/lib/storage/storageEnvelope";

export const MATCH_SETUP_KEY = "fairplayr.matchSetup.v1";

/**
 * Dispatched on `window` after this tab wrote or removed the stored setup (a
 * match started, ended or was discarded). Other tabs see the `storage` event
 * for MATCH_SETUP_KEY instead. Used to re-check a deferred session once no
 * match is active any more (B10).
 */
export const MATCH_SETUP_CHANGED_EVENT = "fairplayr:match-setup-changed";

function notifyMatchSetupChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(MATCH_SETUP_CHANGED_EVENT));
}
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
      // Migrate forward only. A setup from a newer build is still read (the
      // reader ignores unknown fields), so its active match is never hidden
      // or replaced; this build just never writes over it.
      const versionClass = classifyVersion(parsed.version, STORAGE_VERSION);

      if (versionClass === "newer") {
        reportNewerStoredVersion(MATCH_SETUP_KEY);
      }

      const config = toValidMatchConfig(parsed.config);
      if (!config) return null;

      const serverMatchId =
        parsed.serverMatchId === undefined
          ? undefined
          : typeof parsed.serverMatchId === "string" && parsed.serverMatchId.length > 0
            ? parsed.serverMatchId
            : null;

      if (versionClass === "older" || versionClass === "invalid") {
        try {
          writeEnvelope(config, parsed.status, serverMatchId);
        } catch {
          // Still usable from memory; the next write retries.
        }
      }

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

    try {
      writeEnvelope(config, parsed.status, null);
    } catch {
      // Still usable from memory; the next write retries.
    }

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
  writeDraftEnvelope(config, "draft");
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
    writeDraftEnvelope(config, stored.status);
    return true;
  }

  writeDraftEnvelope(config, "draft");
  return true;
}

/**
 * Discard an unfinished draft so the next setup starts from team defaults.
 * Refused (returns false) while a match is active; an ended setup is left as is.
 */
export function discardMatchSetupDraft(): boolean {
  const stored = getStoredMatchSetup();
  if (stored?.status === "active") return false;
  if (stored?.status === "draft") clearStoredMatchSetup();
  return true;
}

export function clearStoredMatchSetup(): void {
  if (typeof window === "undefined") return;
  if (safeRemoveItem(MATCH_SETUP_KEY, STORAGE_VERSION)) notifyMatchSetupChanged();
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/** Server match id of the stored setup, kept only while it is the same setup. */
function storedServerMatchIdFor(configId: string): string | null | undefined {
  const stored = getStoredMatchSetup();
  return stored && stored.config.id === configId ? stored.serverMatchId : null;
}

/**
 * Draft writes run from effects in the setup editors, which have no catch: a
 * newer build's setup is left alone without throwing (the update-required
 * signal asks for a reload). Other failures (a full device) throw as before.
 */
function writeDraftEnvelope(config: MatchConfig, status: MatchStatus): void {
  try {
    writeEnvelope(config, status);
  } catch (error) {
    if (!isStorageNewerVersionError(error)) throw error;
  }
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
  // Throws on a failed write, as before, and when refusing to replace a newer
  // build's setup (StorageNewerVersionError): lifecycle callers treat both as
  // "not saved".
  setItemOrThrow(MATCH_SETUP_KEY, JSON.stringify(envelope), STORAGE_VERSION);
  notifyMatchSetupChanged();
}
