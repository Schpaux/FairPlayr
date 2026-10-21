/**
 * Asks the browser to keep this origin's storage (OFF-01a task 4,
 * FP-OFF-01 G6), so an active match is not evicted under storage pressure.
 * Best effort: unsupported browsers, a refusal or an error all resolve to
 * false or null and never affect the match.
 */

let requested: Promise<boolean | null> | null = null;

export function requestPersistentStorage(): Promise<boolean | null> {
  if (requested) return requested;

  requested = (async () => {
    try {
      if (typeof navigator === "undefined") return null;
      const storage = navigator.storage as (StorageManager & {
        persist?: () => Promise<boolean>;
        persisted?: () => Promise<boolean>;
      }) | undefined;
      if (!storage || typeof storage.persist !== "function") return null;
      if (typeof storage.persisted === "function" && (await storage.persisted())) return true;
      return await storage.persist();
    } catch {
      return null;
    }
  })();

  return requested;
}

/** Test helper: allow another request. */
export function resetPersistentStorageRequestForTests(): void {
  requested = null;
}
