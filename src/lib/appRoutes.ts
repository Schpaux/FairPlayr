/**
 * Where the coach app lives (WEB-01d, FP-WEB-01A §2). The website is at `/`,
 * the app's Home at `/play` (`/no/play`; the segment is not translated). Every
 * other app route is unchanged.
 *
 * No imports: the service worker (`src/sw/`), the proxy and the app all read
 * these, so the worker bundle never pulls in React or next-intl.
 */

/** The app's Home, without the locale prefix. Links go through `@/i18n/navigation`. */
export const APP_HOME_PATH = "/play";

/** Query marker an installed app starts with (manifest `start_url`, OFF-02). */
export const PWA_SOURCE_PARAM = "source";
export const PWA_SOURCE_VALUE = "pwa";

/**
 * The manifest's `start_url`, the same as before WEB-01d. A launch at `/` is
 * sent to the coach's Home in the coach's language: by the service worker
 * (last used locale) and offline too, or by `src/proxy.ts` (cookie,
 * Accept-Language). Not `/play?source=pwa`: the worker serves that as the
 * English Home from its cache, whatever the coach's language.
 */
export const PWA_START_URL = `/?${PWA_SOURCE_PARAM}=${PWA_SOURCE_VALUE}`;

/** True when the URL is an installed app's launch (`?source=pwa`). */
export function isPwaLaunch(searchParams: URLSearchParams): boolean {
  return searchParams.get(PWA_SOURCE_PARAM) === PWA_SOURCE_VALUE;
}
