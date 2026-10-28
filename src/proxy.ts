import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { pwaLaunchRedirect } from "@/lib/pwa/launchRedirect";
import { isWebsitePath } from "@/lib/marketing/routes";

const intlMiddleware = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  // An installed app's launch at `/` opens the app's Home (WEB-01d).
  const response = pwaLaunchRedirect(request) ?? intlMiddleware(request);
  // The website never reads the session (shellRouteSafety.test.ts), so it
  // needs no Supabase round trip (WEB-01 phase 0). App paths refresh as before.
  if (isWebsitePath(request.nextUrl.pathname)) return response;
  return updateSupabaseSession(request, response);
}

export const config = {
  // Match all routes except static files, API routes, and Next.js internals
  matcher: ["/((?!_next|_vercel|api|.*\\..*).*)"],
};
