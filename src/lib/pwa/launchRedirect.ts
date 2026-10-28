import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { APP_HOME_PATH, isPwaLaunch } from "@/lib/appRoutes";

/**
 * An installed app started at the website's front page (`/?source=pwa`, the
 * manifest's start_url before WEB-01d, also `/no?source=pwa`): 307 to the
 * app's Home, keeping the whole query. Unprefixed `/play` then gets its
 * locale from next-intl (cookie, Accept-Language), like `/team` does. Used by
 * `src/proxy.ts`; the service worker does the same offline (`src/sw/engine.ts`).
 * Null for every other request.
 */
export function pwaLaunchRedirect(request: NextRequest): NextResponse | null {
  const url = request.nextUrl;
  if (!isPwaLaunch(url.searchParams)) return null;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  const locale = routing.locales.find((candidate) => path === `/${candidate}`);
  if (path !== "/" && locale === undefined) return null;

  const pathname = locale === undefined ? APP_HOME_PATH : `/${locale}${APP_HOME_PATH}`;
  return NextResponse.redirect(new URL(`${pathname}${url.search}`, url.origin), 307);
}
