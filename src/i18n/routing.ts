import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Supported locales
  locales: ["en", "no"],

  // Default locale — served without prefix (e.g. /team not /en/team)
  defaultLocale: "en",

  // No prefix for default locale, prefix for others (e.g. /no/team)
  localePrefix: "as-needed",

  // No `Link` hreflang header: it would name the request's host and `no`.
  // The website's alternates (hreflang `nb`, canonical fairplayr.app) are in
  // its metadata (src/lib/marketing/seo.ts, WEB-01g).
  alternateLinks: false,
});
