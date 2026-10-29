/**
 * Where the public website lives (WEB-01, FP-WEB-01 phase 0). Phase 0 has
 * the front page only (`/`, `/no`); later pages (`/roadmap`, `/privacy`, …)
 * are added to `WEBSITE_SEGMENTS` and nowhere else.
 *
 * No imports, like `src/lib/appRoutes.ts`: the proxy reads this on every
 * request. Locales mirror `src/i18n/routing.ts` (a test keeps them in step).
 */

/** Website pages without the locale prefix; "" is the front page. */
export const WEBSITE_SEGMENTS = ["", "/roadmap"] as const;

/** `""` is English (unprefixed), `/en` the alias next-intl redirects, `/no` Norwegian. */
const LOCALE_PREFIXES = ["", "/en", "/no"] as const;

const WEBSITE_PATHS: ReadonlySet<string> = new Set(
  LOCALE_PREFIXES.flatMap((prefix) =>
    WEBSITE_SEGMENTS.flatMap((segment) => {
      const path = `${prefix}${segment}` || "/";
      return path === "/" ? [path] : [path, `${path}/`];
    }),
  ),
);

/**
 * True for a website page, spelled exactly (one trailing slash allowed). The
 * proxy skips the Supabase session refresh there, because the website never
 * reads the session. Any other spelling (`//`, `/%6Eo`, `/NO`, `/no/play`)
 * is false, so a mistake can only keep today's behaviour: the refresh runs.
 */
export function isWebsitePath(pathname: string): boolean {
  return WEBSITE_PATHS.has(pathname);
}
