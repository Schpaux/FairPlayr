import type { LineupDraft } from "@/domain/lineup";
import { ALL_FORMATS } from "@/domain/match";

const LINEUP_STORAGE_KEY = "fairplayr.lineup.v1";
const STORAGE_VERSION = 1;

interface LineupStorageEnvelope {
  version: number;
  lineup: LineupDraft;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toValidLineup(value: unknown): LineupDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const teamId = readString(value.teamId);
  const format = readString(value.format);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);

  if (!id || !teamId || !format || !createdAt || !updatedAt) {
    return null;
  }

  if (!ALL_FORMATS.includes(format as LineupDraft["format"])) {
    return null;
  }

  if (!Array.isArray(value.selectedPlayerIds) || !isRecord(value.slotAssignments)) {
    return null;
  }

  const selectedPlayerIds = value.selectedPlayerIds.filter(
    (item): item is string => typeof item === "string"
  );

  const slotAssignments: Record<string, string | null> = {};

  for (const [slotId, assigned] of Object.entries(value.slotAssignments)) {
    if (typeof assigned === "string") {
      slotAssignments[slotId] = assigned;
      continue;
    }

    slotAssignments[slotId] = null;
  }

  return {
    id,
    teamId,
    format: format as LineupDraft["format"],
    selectedPlayerIds,
    slotAssignments,
    createdAt,
    updatedAt,
  };
}

function isEnvelope(value: unknown): value is LineupStorageEnvelope {
  return isRecord(value) && typeof value.version === "number" && "lineup" in value;
}

export function getStoredLineupDraft(): LineupDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LINEUP_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!isEnvelope(parsed)) {
      return null;
    }

    if (parsed.version !== STORAGE_VERSION) {
      return null;
    }

    return toValidLineup(parsed.lineup);
  } catch {
    return null;
  }
}

export function saveStoredLineupDraft(lineup: LineupDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload: LineupStorageEnvelope = {
    version: STORAGE_VERSION,
    lineup,
  };

  window.localStorage.setItem(LINEUP_STORAGE_KEY, JSON.stringify(payload));
}

export function clearStoredLineupDraft(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(LINEUP_STORAGE_KEY);
}
