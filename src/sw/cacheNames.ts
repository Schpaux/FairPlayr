/**
 * Cache names (FP-OFF-01 §2.2). Every cache the worker owns starts with
 * `fp-`. Build-scoped caches carry the build id, so a new build never reads
 * an older build's files and `activate` can remove exactly the old ones.
 * `fp-meta` is not build-scoped: it holds the last used locale and the
 * update gate's state (match active, one-shot override).
 *
 * The worker has no access to localStorage, so clearing caches can never
 * touch match data.
 */

export const CACHE_PREFIX = "fp-";
const PRECACHE_PREFIX = `${CACHE_PREFIX}precache-`;
export const META_CACHE = `${CACHE_PREFIX}meta`;

/** Cache keys inside META_CACHE (same-origin URLs nobody serves). */
export const META_KEYS = {
  lastLocale: "/__fp-sw/meta/last-locale",
  matchActive: "/__fp-sw/meta/match-active",
  allowUpdateOnce: "/__fp-sw/meta/allow-update-once",
  /** The build whose precache the worker serves (written on activate). */
  servedBuild: "/__fp-sw/meta/served-build",
  /** Set while an update that activated mid-match keeps serving the old build. */
  pinnedBuild: "/__fp-sw/meta/pinned-build",
  /** A build no longer served whose files open pages may still load. */
  retiredBuild: "/__fp-sw/meta/retired-build",
  firstInstall: (buildId: string) => `/__fp-sw/meta/first-install/${buildId}`,
} as const;

/** Build ids end up in cache names and URLs: keep them to a safe alphabet. */
export function sanitizeBuildId(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return cleaned.length > 0 ? cleaned : "unknown";
}

export function precacheName(buildId: string): string {
  return `${PRECACHE_PREFIX}${sanitizeBuildId(buildId)}`;
}

export function isOwnCache(name: string): boolean {
  return name.startsWith(CACHE_PREFIX);
}

/** The build id of one of our build-scoped caches, or null. */
export function cacheBuildId(name: string): string | null {
  return name.startsWith(PRECACHE_PREFIX) ? name.slice(PRECACHE_PREFIX.length) : null;
}

/**
 * On activate: our build-scoped caches from any other build (except a build
 * still being served, `keep`). Nothing else.
 */
export function cachesToDeleteOnActivate(names: readonly string[], buildId: string, keep: string | null = null): string[] {
  const current = sanitizeBuildId(buildId);
  const kept = keep === null ? null : sanitizeBuildId(keep);
  return names.filter((name) => {
    const id = cacheBuildId(name);
    return id !== null && id !== current && id !== kept;
  });
}

/** Kill switch: every cache we own (precaches and meta), nothing else. */
export function cachesToDeleteOnKill(names: readonly string[]): string[] {
  return names.filter(isOwnCache);
}
