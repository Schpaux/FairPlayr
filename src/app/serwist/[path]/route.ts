import { readFileSync } from "node:fs";
import path from "node:path";
import { createSerwistRoute } from "@serwist/turbopack";
import { resolveSwMode } from "@/lib/pwa/contracts";
import { sanitizeBuildId } from "@/sw/cacheNames";
import { swConfigBanner } from "@/sw/protocol";

/**
 * Serves the service worker at /serwist/sw.js (FP-OFF-01a stream B, §S).
 * Prerendered at build time: esbuild bundles `src/sw/sw.ts` with the precache
 * manifest of this build's `/_next/static` files. Response headers
 * (`no-cache, no-store`, `Service-Worker-Allowed: /`) are set in
 * next.config.ts so the browser always checks for a new worker.
 *
 * - The build id is Next's own (`.next/BUILD_ID`, written before static
 *   generation, which is when GET runs). It names the worker's caches, so
 *   every build gets fresh shells and chunks together.
 * - `NEXT_PUBLIC_FP_SW=off` builds the kill-switch worker.
 * - Source maps are off (§S.4); fonts (`woff2`) are added to the glob (§S.3).
 */

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = false;

function readBuildId(): string {
  try {
    return sanitizeBuildId(readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim());
  } catch {
    return sanitizeBuildId(`dev${Date.now().toString(36)}`);
  }
}

let route: ReturnType<typeof createSerwistRoute> | null = null;

// Created on the first GET, not at import: generateStaticParams runs before
// Next has written BUILD_ID, GET runs after.
function getRoute() {
  if (!route) {
    const buildId = readBuildId();
    route = createSerwistRoute({
      swSrc: "src/sw/sw.ts",
      useNativeEsbuild: true,
      globPatterns: [".next/static/**/*.{js,css,woff2,woff,ico,png,svg,webp,json,webmanifest}"],
      additionalPrecacheEntries: [
        { url: "/manifest.webmanifest", revision: buildId },
        { url: "/favicon.ico", revision: buildId },
        { url: "/apple-icon.png", revision: buildId },
        { url: "/icons/icon-192.png", revision: buildId },
        { url: "/icons/icon-512.png", revision: buildId },
        { url: "/icons/icon-maskable-512.png", revision: buildId },
      ],
      esbuildOptions: {
        sourcemap: false,
        banner: { js: swConfigBanner({ buildId, mode: resolveSwMode(process.env.NEXT_PUBLIC_FP_SW) }) },
      },
    });
  }
  return route;
}

export function generateStaticParams() {
  return [{ path: "sw.js" }];
}

export function GET(request: Request, context: { params: Promise<{ path: string }> }) {
  return getRoute().GET(request, context);
}
