import type { MatchFormat, MatchSetup } from "@/domain/match";

const MATCH_SETUP_KEY = "fairplayr.matchSetup.v1";
const STORAGE_VERSION = 1;

// ─── Status ───────────────────────────────────────────────────────────────────

/**
 * "draft"  — coach is configuring; setup may be incomplete.
 * "active" — match has been started; live match screen should be shown.
 * "ended"  — match is over (reserved for future use).
 */
export type MatchStatus = "draft" | "active" | "ended";

export interface StoredMatchSetup {
  setup: MatchSetup;
  status: MatchStatus;
}

// ─── Envelope ─────────────────────────────────────────────────────────────────

interface StorageEnvelope {
  version: number;
  setup: MatchSetup;
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

function toValidMatchSetup(v: unknown): MatchSetup | null {
  if (!isRecord(v)) return null;

  const id = readString(v.id);
  const teamId = readString(v.teamId);
  const format = readString(v.format);
  const durationMinutes = readNumber(v.durationMinutes);
  const createdAt = readString(v.createdAt);
  const updatedAt = readString(v.updatedAt);

  if (!id || !teamId || !format || !durationMinutes || !createdAt || !updatedAt) {
    return null;
  }

  if (!VALID_FORMATS.includes(format as MatchFormat)) return null;

  const rawSquad = Array.isArray(v.squadPlayerIds) ? v.squadPlayerIds : [];
  const rawStarters = Array.isArray(v.startingPlayerIds)
    ? v.startingPlayerIds
    : [];

  const squadPlayerIds = rawSquad.filter(
    (x): x is string => typeof x === "string"
  );
  const startingPlayerIds = rawStarters.filter(
    (x): x is string => typeof x === "string" && squadPlayerIds.includes(x)
  );

  return {
    id,
    teamId,
    format: format as MatchFormat,
    durationMinutes,
    squadPlayerIds,
    startingPlayerIds,
    createdAt,
    updatedAt,
  };
}

function isValidEnvelope(v: unknown): v is StorageEnvelope {
  if (!isRecord(v)) return false;
  return (
    typeof v.version === "number" &&
    isRecord(v.setup) &&
    typeof v.status === "string" &&
    VALID_STATUSES.includes(v.status as MatchStatus)
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getStoredMatchSetup(): StoredMatchSetup | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(MATCH_SETUP_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isValidEnvelope(parsed)) return null;
    if (parsed.version !== STORAGE_VERSION) return null;

    const setup = toValidMatchSetup(parsed.setup);
    if (!setup) return null;

    return { setup, status: parsed.status };
  } catch {
    return null;
  }
}

/** Save the current setup as a draft (coach is still configuring). */
export function saveMatchSetupDraft(setup: MatchSetup): void {
  writeEnvelope(setup, "draft");
}

/**
 * Mark the match as active (coach tapped "Start Match").
 * The live match screen reads this to know a match is in progress.
 */
export function activateMatch(setup: MatchSetup): void {
  writeEnvelope(setup, "active");
}

/** Mark the match as ended. */
export function endMatch(setup: MatchSetup): void {
  writeEnvelope(setup, "ended");
}

export function clearStoredMatchSetup(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MATCH_SETUP_KEY);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function writeEnvelope(setup: MatchSetup, status: MatchStatus): void {
  if (typeof window === "undefined") return;
  const envelope: StorageEnvelope = {
    version: STORAGE_VERSION,
    setup,
    status,
  };
  window.localStorage.setItem(MATCH_SETUP_KEY, JSON.stringify(envelope));
}
