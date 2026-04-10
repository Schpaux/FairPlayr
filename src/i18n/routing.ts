import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Supported locales
  locales: ["en", "no"],

  // Default locale — served without prefix (e.g. /team not /en/team)
  defaultLocale: "en",

  // No prefix for default locale, prefix for others (e.g. /no/team)
  localePrefix: "as-needed",
});
