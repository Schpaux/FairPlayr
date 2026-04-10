/**
 * Single source of truth for locale metadata.
 * Used by LanguageSwitcher, Settings, and any future locale-aware UI.
 *
 * Keep this in sync with src/i18n/routing.ts — the locales listed there
 * are the authoritative list; this file adds display metadata only.
 */
export const localeConfig = {
  en: { short: "EN", full: "English" },
  no: { short: "NO", full: "Norsk (Bokmål)" },
} as const satisfies Record<string, { short: string; full: string }>;

export type SupportedLocale = keyof typeof localeConfig;
