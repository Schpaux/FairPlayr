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
import { getPendingMatchCompletion } from "@/lib/storage/pendingMatchCompletionStorage";

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

/**
 * How a signed-in coach's match reaches the server (MATCH-13). The server
 * match id is chosen on the device when the match starts, so a match whose
 * row could not be created yet still has one stable identity.
 */
export interface StoredMatchServerLink {
  /** Signed-in coach who started the match; only that account syncs it. */
  ownerUserId: string;
  /**
   * Set until the server confirms the match row exists. The row is created
   * with the stored server match id, so a repeat never makes a second one.
   */
  pendingCreate: { title: string; startsAt: string } | null;
}

/**
 * MATCH-13-F4: kept with an ended server-backed match until the server
 * confirms its completion. Written in the same write as "ended", so the device
 * knows after a reload that the completion may exist nowhere else, and can
 * rebuild it from this setup and the stored live match.
 */
export interface StoredEndedCompletion {
  endedAt: string;
  reportEnabled: boolean;
}

export interface StoredMatchConfig {
  config: MatchConfig;
  status: MatchStatus;
  /** See `StoredEndedCompletion`; null once confirmed or for any other match. */
  endedCompletion: StoredEndedCompletion | null;
  /** Null for guest/local-only matches and setups stored before it existed. */
  serverLink: StoredMatchServerLink | null;
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
  serverLink?: StoredMatchServerLink | null;
  endedCompletion?: StoredEndedCompletion | null;
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

function toValidServerLink(v: unknown): StoredMatchServerLink | null {
  if (!isRecord(v) || typeof v.ownerUserId !== "string" || !v.ownerUserId) return null;

  const create = isRecord(v.pendingCreate) ? v.pendingCreate : null;
  const title = create ? readString(create.title) : null;
  const startsAt = create ? readString(create.startsAt) : null;

  return {
    ownerUserId: v.ownerUserId,
    pendingCreate: title && startsAt ? { title, startsAt } : null,
  };
}

function toValidEndedCompletion(v: unknown): StoredEndedCompletion | null {
  if (!isRecord(v) || typeof v.endedAt !== "string" || typeof v.reportEnabled !== "boolean") return null;
  return { endedAt: v.endedAt, reportEnabled: v.reportEnabled };
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

      const serverLink = toValidServerLink(parsed.serverLink);
      const endedCompletion =
        parsed.status === "ended" ? toValidEndedCompletion(parsed.endedCompletion) : null;

      if (versionClass === "older" || versionClass === "invalid") {
        try {
          writeEnvelope(config, parsed.status, serverMatchId, serverLink, endedCompletion);
        } catch {
          // Still usable from memory; the next write retries.
        }
      }

      return { config, status: parsed.status, serverMatchId, serverLink, endedCompletion };
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
      serverLink: null,
      endedCompletion: null,
    };

    try {
      writeEnvelope(config, parsed.status, null, null, null);
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
 * MATCH-13-F4: true while the stored setup is an ended match whose completion
 * is neither confirmed by the server nor stored as pending. The setup and the
 * stored live match are then its last copy on the device and must not be
 * replaced. Read from storage, so it holds across reloads.
 */
export function hasUnsecuredMatchEnd(): boolean {
  const stored = getStoredMatchSetup();

  return Boolean(
    stored &&
      stored.status === "ended" &&
      stored.endedCompletion &&
      stored.serverMatchId &&
      !getPendingMatchCompletion(stored.serverMatchId)
  );
}

/**
 * Save the current setup as a draft (coach is still configuring).
 *
 * Refused (returns false) while a match is active: writing a draft over it
 * would demote the running match and hide it from the live screen. Likewise
 * while an ended match's completion is not secured (`hasUnsecuredMatchEnd`).
 */
export function saveMatchSetupDraft(config: MatchConfig): boolean {
  if (hasActiveStoredMatch() || hasUnsecuredMatchEnd()) return false;
  writeDraftEnvelope(config, "draft");
  return true;
}

/**
 * Mark the match as active (coach tapped "Start Match").
 * The live match screen reads this to know a match is in progress.
 *
 * `serverMatchId` is the server record the match was started for, or null for
 * a guest/local-only match. It is always set explicitly here, so a new start
 * never inherits the server id of a previous match. `serverLink` likewise.
 */
export function activateMatch(
  config: MatchConfig,
  serverMatchId: string | null = null,
  serverLink: StoredMatchServerLink | null = null
): void {
  writeEnvelope(config, "active", serverMatchId, serverLink, null);
}

/**
 * Records that the server now has the row for this match. Only touches the
 * stored setup when it is still that same match (a late answer for match A
 * never changes match B). Returns whether anything was written.
 */
export function markServerMatchCreated(setupId: string, serverMatchId: string): boolean {
  const stored = getStoredMatchSetup();

  if (
    !stored ||
    stored.config.id !== setupId ||
    stored.serverMatchId !== serverMatchId ||
    !stored.serverLink?.pendingCreate
  ) {
    return false;
  }

  try {
    writeEnvelope(stored.config, stored.status, serverMatchId, { ...stored.serverLink, pendingCreate: null });
    return true;
  } catch {
    // Kept as pending: the next attempt creates idempotently again.
    return false;
  }
}

/**
 * Mark the match as ended. `endedCompletion` is given for a server-backed
 * match whose completion is still to be confirmed (MATCH-13-F4).
 */
export function endMatch(config: MatchConfig, endedCompletion: StoredEndedCompletion | null = null): void {
  writeEnvelope(config, "ended", undefined, undefined, endedCompletion);
}

/**
 * Drops `endedCompletion` once the server confirmed the completion, only while
 * the stored setup is still that match. Returns whether it is gone.
 */
export function markMatchCompletionConfirmed(serverMatchId: string): boolean {
  const stored = getStoredMatchSetup();

  if (!stored || stored.serverMatchId !== serverMatchId || !stored.endedCompletion) {
    return true;
  }

  try {
    writeEnvelope(stored.config, stored.status, stored.serverMatchId, stored.serverLink, null);
    return true;
  } catch {
    return false;
  }
}

/** Refused (returns false) like `saveMatchSetupDraft`. */
export function updateMatchConfig(config: MatchConfig): boolean {
  const stored = getStoredMatchSetup();

  if (stored?.status === "active" || hasUnsecuredMatchEnd()) return false;

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

/** Server link of the stored setup, kept only while it is the same setup. */
function storedServerLinkFor(configId: string): StoredMatchServerLink | null {
  const stored = getStoredMatchSetup();
  return stored && stored.config.id === configId ? stored.serverLink : null;
}

/** Ended completion of the stored setup, kept only while it is the same ended setup. */
function storedEndedCompletionFor(configId: string, status: MatchStatus): StoredEndedCompletion | null {
  const stored = getStoredMatchSetup();
  return stored && stored.config.id === configId && status === "ended" ? stored.endedCompletion : null;
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
  serverMatchId: string | null | undefined = storedServerMatchIdFor(config.id),
  serverLink: StoredMatchServerLink | null = storedServerLinkFor(config.id),
  endedCompletion: StoredEndedCompletion | null = storedEndedCompletionFor(config.id, status)
): void {
  if (typeof window === "undefined") return;
  const envelope: StorageEnvelope = {
    version: STORAGE_VERSION,
    config,
    status,
    serverMatchId,
    ...(serverLink ? { serverLink } : {}),
    ...(endedCompletion ? { endedCompletion } : {}),
  };
  // Throws on a failed write, as before, and when refusing to replace a newer
  // build's setup (StorageNewerVersionError): lifecycle callers treat both as
  // "not saved".
  setItemOrThrow(MATCH_SETUP_KEY, JSON.stringify(envelope), STORAGE_VERSION);
  notifyMatchSetupChanged();
}
