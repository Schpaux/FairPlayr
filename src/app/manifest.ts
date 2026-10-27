import type { MetadataRoute } from "next";
import { BRAND_COLORS } from "@/lib/pwa/brandColors";

/**
 * Web app manifest (OFF-02, FP-OFF-01 §2.5), served at /manifest.webmanifest.
 * Next links it from every page automatically, so `metadata.manifest` is not
 * set in the layout.
 *
 * - `start_url` is "/" plus a marker; `src/proxy.ts` (next-intl, `as-needed`)
 *   serves English at "/" and redirects to "/no" by cookie or Accept-Language,
 *   keeping the query string. `id` and `scope` stay "/" so both locales are
 *   inside the installed app.
 * - Colours come from `brandColors.ts` (= `--fp-canvas` dark, DESIGN.md §2.1).
 *
 * - Icons (BRAND-01, BRAND.md §4): 192 and 512 `any`, a separate 512
 *   `maskable` (symbol inside the 80 % safe zone) and `src/app/apple-icon.png`
 *   (180×180, linked by Next), all from the brand package. Sources:
 *   `public/icons/icon-source.svg` and `icon-maskable-source.svg`. Never
 *   combine purposes as "maskable any".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FairPlayr",
    short_name: "FairPlayr",
    description: "Fair playtime tracking for grassroots football coaches.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BRAND_COLORS.canvasDark,
    theme_color: BRAND_COLORS.canvasDark,
    lang: "nb",
    dir: "ltr",
    categories: ["sports", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
