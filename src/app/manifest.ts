import type { MetadataRoute } from "next";
import { BRAND_COLORS } from "@/lib/pwa/brandColors";
import { PWA_START_URL } from "@/lib/appRoutes";

/**
 * Web app manifest (OFF-02, FP-OFF-01 §2.5), served at /manifest.webmanifest.
 * Next links it from every page automatically, so `metadata.manifest` is not
 * set in the layout.
 *
 * - `start_url` is `/?source=pwa`, as before WEB-01d. The marker makes it a
 *   launch, not the website: the service worker sends it to the app's Home
 *   in the last used locale (`/play` or `/no/play`, also offline), and
 *   `src/proxy.ts` does the same by cookie or Accept-Language. It is not
 *   `/play?source=pwa`, which the worker serves as the English Home from its
 *   cache on a Norwegian device (WEB-01A regression). `id` and `scope` stay "/"
 *   (never change them: the browser would treat it as another app), so both
 *   locales and the website are inside the installed app.
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
    start_url: PWA_START_URL,
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
