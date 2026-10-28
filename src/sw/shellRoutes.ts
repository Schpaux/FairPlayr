/**
 * Shell routes (FP-OFF-01 §2.1, §S.5, §S.6).
 *
 * A shell is a page whose HTML is the same for every user (the data comes
 * from the device), so the service worker precaches it per build and serves
 * it cache-first. `src/lib/pwa/shellRouteSafety.test.ts` keeps those pages
 * user-agnostic.
 *
 * Locales mirror `src/i18n/routing.ts` (`as-needed`, default `en`): English is
 * unprefixed, Norwegian is under `/no`. They are repeated here instead of
 * imported so the worker bundle does not pull in next-intl; a unit test keeps
 * the two in step.
 *
 * `/` is special: the server picks the locale (cookie, Accept-Language) and
 * may redirect to `/no`, so it is never cache-first. It is network-first, and
 * offline it goes to the locale the page last told the worker about.
 *
 * WEB-01d (FP-WEB-01A §5): `/` and `/no` are the website, the app's Home is
 * `/play` (`APP_HOME_PATH`). The website pages are user-agnostic and built
 * with the app, so they are precached like the shells. An installed app's
 * launch (`/?source=pwa`, `/no?source=pwa`) opens the app's Home instead.
 */
import { APP_HOME_PATH } from "../lib/appRoutes";

export const SHELL_LOCALES = ["en", "no"] as const;
export type ShellLocale = (typeof SHELL_LOCALES)[number];
export const SHELL_DEFAULT_LOCALE: ShellLocale = "en";

/** Routes that open offline, without the locale prefix. The first is the app's Home. */
export const SHELL_SEGMENTS = [APP_HOME_PATH, "/match/setup", "/match/live", "/team"] as const;
export const OFFLINE_SEGMENT = "/offline";
/** The website's front page (`/`, `/no`). */
export const MARKETING_SEGMENT = "";

export type ShellKind = "home" | "shell" | "offline" | "marketing";

export interface ShellEntry {
  /** Pathname the page is served at, which is also its cache key. */
  url: string;
  locale: ShellLocale;
  kind: ShellKind;
}

export function isShellLocale(value: unknown): value is ShellLocale {
  return typeof value === "string" && (SHELL_LOCALES as readonly string[]).includes(value);
}

export function localizedPath(locale: ShellLocale, segment: string): string {
  if (locale === SHELL_DEFAULT_LOCALE) return segment === "" ? "/" : segment;
  return `/${locale}${segment}`;
}

/** Every page the worker precaches, in a stable order. */
export function shellPrecacheEntries(): ShellEntry[] {
  const entries: ShellEntry[] = [];
  for (const locale of SHELL_LOCALES) {
    entries.push({ url: localizedPath(locale, MARKETING_SEGMENT), locale, kind: "marketing" });
    for (const segment of SHELL_SEGMENTS) {
      entries.push({ url: localizedPath(locale, segment), locale, kind: segment === APP_HOME_PATH ? "home" : "shell" });
    }
    entries.push({ url: localizedPath(locale, OFFLINE_SEGMENT), locale, kind: "offline" });
  }
  return entries;
}

/** Drops a trailing slash (but keeps "/") and collapses repeated slashes. */
export function normalizePathname(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  return collapsed.length > 1 && collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

/** The locale a path belongs to by its prefix (unprefixed is the default). */
export function localeOfPath(pathname: string): ShellLocale {
  const path = normalizePathname(pathname);
  for (const locale of SHELL_LOCALES) {
    if (locale === SHELL_DEFAULT_LOCALE) continue;
    if (path === `/${locale}` || path.startsWith(`/${locale}/`)) return locale;
  }
  return SHELL_DEFAULT_LOCALE;
}

/** The root path "/" (with or without a query) that the server localises. */
export function isRootPath(pathname: string): boolean {
  return normalizePathname(pathname) === "/";
}

/**
 * The cache-first shell for a path, or null. `/` is not a cache-first shell
 * (see the file comment); `/no` is, because its locale is in the URL.
 */
export function matchShell(pathname: string): ShellEntry | null {
  const path = normalizePathname(pathname);
  if (path === "/") return null;
  return shellPrecacheEntries().find((entry) => entry.url === path) ?? null;
}

export function offlinePathFor(locale: ShellLocale): string {
  return localizedPath(locale, OFFLINE_SEGMENT);
}

/**
 * Where `/` goes when the network cannot answer: the English front page is
 * cached at "/" itself; any other locale is a redirect to its own front page.
 * Since WEB-01d that is the website; in a pinned build from before `/play` the
 * same keys hold that build's Home, so the old app opens as it did.
 */
export function rootFallback(lastLocale: ShellLocale | null): { type: "shell"; url: string } | { type: "redirect"; url: string } {
  const locale = lastLocale ?? SHELL_DEFAULT_LOCALE;
  if (locale === SHELL_DEFAULT_LOCALE) return { type: "shell", url: "/" };
  return { type: "redirect", url: localizedPath(locale, MARKETING_SEGMENT) };
}

/**
 * The locale of an installed app's launch path, before the marker is checked:
 * `/` is null (the locale is not in the URL), `/en` and `/no` are their own.
 * Undefined for any other path.
 */
export function launchLocaleOf(pathname: string): ShellLocale | null | undefined {
  const path = normalizePathname(pathname);
  if (path === "/") return null;
  return SHELL_LOCALES.find((locale) => path === `/${locale}`);
}

/** Where an installed app's launch opens: the app's Home in that locale. */
export function launchTarget(locale: ShellLocale): string {
  return localizedPath(locale, APP_HOME_PATH);
}

/**
 * The app's Home in a build from before `/play` (`/play` → `/`, `/no/play`
 * → `/no`), for a worker pinned to such a build mid-match. Null for any other
 * path.
 */
export function legacyHomeFor(pathname: string): string | null {
  const path = normalizePathname(pathname);
  const locale = SHELL_LOCALES.find((candidate) => path === localizedPath(candidate, APP_HOME_PATH));
  return locale === undefined ? null : localizedPath(locale, MARKETING_SEGMENT);
}

/**
 * `/en/...` is the default locale spelled out; the server redirects it to the
 * unprefixed path. Offline the worker does the same so that the redirect
 * lands on a cached shell. Returns null for any other path.
 */
export function defaultLocaleAlias(pathname: string): string | null {
  const path = normalizePathname(pathname);
  const prefix = `/${SHELL_DEFAULT_LOCALE}`;
  if (path === prefix) return "/";
  if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length);
  return null;
}
