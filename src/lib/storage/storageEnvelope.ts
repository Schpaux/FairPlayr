/**
 * Version guard and safe writes for every versioned localStorage key
 * (FP-OFF-01 §2.2, OFF-01a task 1).
 *
 * Rules:
 * - Migrate forward only. Data written by an older build (`stored < current`)
 *   is read, migrated and may be written back in the current version.
 * - Data written by a NEWER build (`stored > current`, for example after a new
 *   deploy ran in another tab or before a rollback) is read tolerantly and is
 *   never overwritten by this build. The "update required" signal is raised so
 *   the UI can ask for a reload (D4); after the reload the newer build owns it.
 * - A failed write (a full device, `QuotaExceededError`, or storage that is
 *   blocked) never throws out of `safeSetItem`. It is reported in the result
 *   and through the storage signal, so the live screen can keep the match in
 *   memory and say that saving failed.
 *
 * Readers must tolerate unknown fields: newer builds may add fields, and an
 * older build only ever reads what it knows.
 */

export type VersionClass = "current" | "older" | "newer" | "invalid";

export function classifyVersion(stored: unknown, current: number): VersionClass {
  if (typeof stored !== "number" || !Number.isFinite(stored)) {
    return "invalid";
  }

  if (stored === current) return "current";
  return stored < current ? "older" : "newer";
}

export type SafeSetFailure = "newer_version" | "quota" | "unavailable" | "error";

export type SafeSetResult = { ok: true } | { ok: false; reason: SafeSetFailure };

export interface StorageWriteError {
  key: string;
  reason: Exclude<SafeSetFailure, "newer_version">;
  atMs: number;
}

export interface StorageSignalSnapshot {
  /** Keys that hold data from a newer build than this one (D4). */
  newerVersionKeys: readonly string[];
  /** Keys whose most recent write failed, with the reason. */
  writeErrors: Readonly<Record<string, StorageWriteError>>;
}

const EMPTY_SNAPSHOT: StorageSignalSnapshot = { newerVersionKeys: [], writeErrors: {} };

let snapshot: StorageSignalSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

function emit(next: StorageSignalSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function subscribeStorageSignals(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStorageSignalSnapshot(): StorageSignalSnapshot {
  return snapshot;
}

export function getServerStorageSignalSnapshot(): StorageSignalSnapshot {
  return EMPTY_SNAPSHOT;
}

/** Records that `key` holds data from a newer build (idempotent). */
export function reportNewerStoredVersion(key: string): void {
  if (snapshot.newerVersionKeys.includes(key)) return;
  emit({ ...snapshot, newerVersionKeys: [...snapshot.newerVersionKeys, key] });
}

function reportWriteError(key: string, reason: StorageWriteError["reason"]): void {
  emit({
    ...snapshot,
    writeErrors: { ...snapshot.writeErrors, [key]: { key, reason, atMs: Date.now() } },
  });
}

function clearWriteError(key: string): void {
  if (!(key in snapshot.writeErrors)) return;
  const writeErrors = { ...snapshot.writeErrors };
  delete writeErrors[key];
  emit({ ...snapshot, writeErrors });
}

/** Test helper: forget every signal. */
export function resetStorageSignalsForTests(): void {
  snapshot = EMPTY_SNAPSHOT;
  for (const listener of listeners) listener();
}

export function isQuotaExceededError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return (
    name === "QuotaExceededError" ||
    // Firefox
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    // Legacy WebKit/Chromium codes
    code === 22 ||
    code === 1014
  );
}

// Envelopes written by this app start with `{"version":N` (the serialisers put
// the version first), so the common case is read without parsing the whole
// record (a live match can be large and is written on every change).
const LEADING_VERSION = /^\{"version":(-?\d+(?:\.\d+)?)[,}]/;

/** The `version` field of a stored JSON envelope, or null. Never throws. */
export function readStoredEnvelopeVersion(raw: string | null): number | null {
  if (!raw) return null;

  const leading = LEADING_VERSION.exec(raw);
  if (leading) {
    const version = Number(leading[1]);
    if (Number.isFinite(version)) return version;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      const version = (parsed as { version?: unknown }).version;
      return typeof version === "number" && Number.isFinite(version) ? version : null;
    }
  } catch {
    // Unparseable data has no version; it may be replaced.
  }

  return null;
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Writes `value` under `key` unless the stored envelope has a newer version
 * than `version`. Never throws.
 */
export function safeSetItem(key: string, value: string, version: number): SafeSetResult {
  const storage = getLocalStorage();

  if (!storage) {
    if (typeof window === "undefined") return { ok: false, reason: "unavailable" };
    reportWriteError(key, "unavailable");
    return { ok: false, reason: "unavailable" };
  }

  let existingRaw: string | null = null;

  try {
    existingRaw = storage.getItem(key);
  } catch {
    existingRaw = null;
  }

  const existingVersion = readStoredEnvelopeVersion(existingRaw);

  if (existingVersion !== null && classifyVersion(existingVersion, version) === "newer") {
    reportNewerStoredVersion(key);
    return { ok: false, reason: "newer_version" };
  }

  try {
    storage.setItem(key, value);
  } catch (error) {
    const reason = isQuotaExceededError(error) ? "quota" : "error";
    reportWriteError(key, reason);
    return { ok: false, reason };
  }

  clearWriteError(key);
  return { ok: true };
}

/**
 * Thrown by `setItemOrThrow` when `key` holds data from a newer build: the
 * write was refused, so for the caller it is a failed write like a full
 * device (the update-required signal has been raised as well).
 */
export class StorageNewerVersionError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`Could not save ${key} (newer_version).`);
    this.name = "StorageNewerVersionError";
    this.key = key;
  }
}

export function isStorageNewerVersionError(error: unknown): error is StorageNewerVersionError {
  return error instanceof StorageNewerVersionError;
}

/**
 * `safeSetItem` for callers that have always thrown on a failed write. Every
 * failure throws (after it is reported): a quota or other storage error, and
 * a refusal to overwrite a newer build's data (`StorageNewerVersionError`), so
 * the caller's existing catch treats it as "not saved".
 */
export function setItemOrThrow(key: string, value: string, version: number): void {
  const result = safeSetItem(key, value, version);

  if (result.ok) return;

  if (result.reason === "newer_version") {
    throw new StorageNewerVersionError(key);
  }

  const error = new Error(`Could not save ${key} (${result.reason}).`);
  error.name = result.reason === "quota" ? "QuotaExceededError" : "StorageWriteError";
  throw error;
}

/**
 * Removes `key` unless it holds data from a newer build. Never throws.
 * Returns whether the key is gone.
 */
export function safeRemoveItem(key: string, version: number): boolean {
  const storage = getLocalStorage();
  if (!storage) return false;

  try {
    const existingVersion = readStoredEnvelopeVersion(storage.getItem(key));

    if (existingVersion !== null && classifyVersion(existingVersion, version) === "newer") {
      reportNewerStoredVersion(key);
      return false;
    }

    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
