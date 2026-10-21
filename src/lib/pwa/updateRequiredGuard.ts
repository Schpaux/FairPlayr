/**
 * Loop guard for the D4 "update required" sheet (FP-OFF-01a). The sheet's
 * action reloads into a newer build. If, after that reload, the page still
 * runs the same build and still finds newer data on the device (no newer
 * build is reachable: offline, or a rollback deploy), reloading again would
 * only loop. The attempts are counted per build in sessionStorage, which
 * lives exactly as long as the tab.
 */

export const UPDATE_ATTEMPTS_KEY = "fairplayr.pwa.updateRequiredAttempts";
/** One reload per build; after it the sheet says how to get out. */
export const MAX_UPDATE_ATTEMPTS = 1;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Identifies the build this page runs: its content-hashed `/_next/static`
 * scripts change with every build that changes code.
 */
export function clientBuildFingerprint(doc: Pick<Document, "scripts"> | null = typeof document === "undefined" ? null : document): string {
  if (!doc) return "unknown";
  const sources = Array.from(doc.scripts)
    .map((script) => {
      try {
        return new URL(script.src).pathname;
      } catch {
        return "";
      }
    })
    .filter((path) => path.startsWith("/_next/static/"))
    .sort();
  if (sources.length === 0) return "unknown";
  // FNV-1a: short and stable, not a security measure.
  let hash = 0x811c9dc5;
  for (const char of sources.join("|")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function read(storage: StorageLike | null): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(UPDATE_ATTEMPTS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function updateAttempts(build: string, storage: StorageLike | null = defaultStorage()): number {
  const value = read(storage)[build];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function recordUpdateAttempt(build: string, storage: StorageLike | null = defaultStorage()): number {
  const all = read(storage);
  const next = updateAttempts(build, storage) + 1;
  try {
    storage?.setItem(UPDATE_ATTEMPTS_KEY, JSON.stringify({ ...all, [build]: next }));
  } catch {
    // Without sessionStorage the guard cannot count; the action still needs a tap each time.
  }
  return next;
}

export function isUpdateLoop(build: string, storage: StorageLike | null = defaultStorage()): boolean {
  return updateAttempts(build, storage) >= MAX_UPDATE_ATTEMPTS;
}
