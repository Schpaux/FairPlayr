import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all routes except static files, API routes, and Next.js internals
  matcher: ["/((?!_next|_vercel|api|.*\\..*).*)"],
};
