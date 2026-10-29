/**
 * Service worker routing rules (FP-OFF-01 §2.1), as pure functions.
 *
 * | Request                                              | Decision      |
 * | ---------------------------------------------------- | ------------- |
 * | not GET (HEAD, POST, Server Actions), cross-origin   | passthrough   |
 * | `Range`, RSC (`RSC: 1`, `_rsc`, router headers)      | passthrough   |
 * | `/api/*`, any `auth` segment, `/_vercel/*`, worker   | passthrough   |
 * | navigation to `/`, `/en`, `/no` with `?source=pwa`   | launch        |
 * | navigation to `/no`                                | marketing     |
 * | navigation to `/`                                    | root          |
 * | navigation to a shell (`/play`, `/match/live`, ...)    | shell         |
 * | any other navigation                                 | navigate      |
 * | `/_next/static/*`, fonts, manifest, icons            | asset         |
 * | anything else                                        | passthrough   |
 *
 * "passthrough" means the worker does not call `respondWith`: the browser
 * goes to the network exactly as without a worker, and nothing is cached or
 * served from a cache. Only `asset`, `shell`, `launch`, `root` and `navigate`
 * are answered by the worker (see `engine.ts` for the strategies).
 */
import { isPwaLaunch } from "../lib/appRoutes";
import { isRootPath, launchLocaleOf, matchShell, normalizePathname, type ShellEntry, type ShellLocale } from "./shellRoutes";

export interface RequestLike {
  url: string;
  method: string;
  mode?: string;
  headers: { get(name: string): string | null; has?(name: string): boolean };
}

export type PassthroughReason =
  | "method"
  | "cross-origin"
  | "range"
  | "rsc"
  | "api"
  | "auth"
  | "vercel"
  | "worker"
  | "next-internal"
  | "unhandled";

export type RouteDecision =
  | { kind: "passthrough"; reason: PassthroughReason }
  | { kind: "asset"; cacheKey: string }
  | { kind: "shell"; entry: ShellEntry }
  /** An installed app's launch (WEB-01d); `locale` is null for `/`. */
  | { kind: "launch"; locale: ShellLocale | null }
  | { kind: "root" }
  | { kind: "marketing"; pathname: string }
  | { kind: "navigate"; pathname: string };

const RSC_HEADERS = ["rsc", "next-router-prefetch", "next-router-state-tree", "next-router-segment-prefetch"];

function hasHeader(request: RequestLike, name: string): boolean {
  if (typeof request.headers.has === "function") return request.headers.has(name);
  return request.headers.get(name) !== null;
}

/** RSC payload or router prefetch: never cached, never served by the worker. */
export function isRscRequest(request: RequestLike, url: URL): boolean {
  if (url.searchParams.has("_rsc")) return true;
  if (request.headers.get("rsc") === "1") return true;
  return RSC_HEADERS.some((name) => name !== "rsc" && hasHeader(request, name));
}

/** `/auth`, `/no/auth/...`, `/auth/callback`: any path segment named auth. */
export function isAuthPath(pathname: string): boolean {
  return /(^|\/)auth(\/|$)/.test(pathname);
}

/**
 * The path as the server will route it: percent-decoded (`/%61uth` is
 * `/auth`), repeated slashes collapsed and the trailing slash dropped. Used
 * for every passthrough rule, so no spelling of an `/api` or auth path can
 * reach a cache. Null when the path cannot be decoded (left to the network).
 */
export function canonicalPathname(pathname: string): string | null {
  let decoded = pathname;
  try {
    // Twice: `%2561uth` is `%61uth` after one pass.
    for (let pass = 0; pass < 2 && /%[0-9a-f]{2}/i.test(decoded); pass += 1) decoded = decodeURIComponent(decoded);
  } catch {
    return null;
  }
  return normalizePathname(decoded.replace(/\\/g, "/"));
}

const ASSET_PATHS = new Set([
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
]);
const FONT_EXTENSION = /\.(?:woff2?|ttf|otf)$/i;

export function classifyRequest(request: RequestLike, origin: string): RouteDecision {
  if (request.method !== "GET") return { kind: "passthrough", reason: "method" };

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return { kind: "passthrough", reason: "unhandled" };
  }

  if (url.origin !== origin) return { kind: "passthrough", reason: "cross-origin" };
  if (hasHeader(request, "range")) return { kind: "passthrough", reason: "range" };
  if (isRscRequest(request, url)) return { kind: "passthrough", reason: "rsc" };

  const { pathname } = url;
  const canonical = canonicalPathname(pathname);
  if (canonical === null) return { kind: "passthrough", reason: "unhandled" };
  if (canonical === "/api" || canonical.startsWith("/api/")) return { kind: "passthrough", reason: "api" };
  if (canonical === "/_vercel" || canonical.startsWith("/_vercel/")) return { kind: "passthrough", reason: "vercel" };
  if (canonical === "/serwist" || canonical.startsWith("/serwist/")) return { kind: "passthrough", reason: "worker" };
  if (isAuthPath(canonical)) return { kind: "passthrough", reason: "auth" };
  if (
    canonical.startsWith("/_next/image") ||
    canonical.startsWith("/_next/data/") ||
    canonical.startsWith("/__nextjs") ||
    canonical.startsWith("/_next/webpack-hmr")
  ) {
    return { kind: "passthrough", reason: "next-internal" };
  }

  if (request.mode === "navigate") {
    // Before root and shell: `/no?source=pwa` is the app, `/no` the website.
    const launchLocale = pathname === canonical || pathname === `${canonical}/` ? launchLocaleOf(pathname) : undefined;
    if (launchLocale !== undefined && isPwaLaunch(url.searchParams)) return { kind: "launch", locale: launchLocale };
    if (isRootPath(pathname)) return { kind: "root" };
    // Only the plain spelling of a shell is served from the cache.
    const entry = pathname === canonical || pathname === `${canonical}/` ? matchShell(pathname) : null;
    if (entry?.kind === "marketing") return { kind: "marketing", pathname: entry.url };
    if (entry) return { kind: "shell", entry };
    return { kind: "navigate", pathname };
  }

  if (pathname !== canonical) return { kind: "passthrough", reason: "unhandled" };
  if (pathname.startsWith("/_next/static/") || ASSET_PATHS.has(pathname) || FONT_EXTENSION.test(pathname)) {
    // Static files are content-hashed; the query never selects a different file.
    return { kind: "asset", cacheKey: pathname };
  }

  return { kind: "passthrough", reason: "unhandled" };
}

export interface ResponseLike {
  status: number;
  type: string;
  redirected: boolean;
  headers: { get(name: string): string | null };
}

/**
 * Only a plain, same-origin 200 is ever put in a cache: no redirect, no
 * opaque or error response, no partial content, nothing marked `Vary: *`.
 */
export function isStorableResponse(response: ResponseLike): boolean {
  if (response.status !== 200) return false;
  if (response.type !== "basic" && response.type !== "default") return false;
  if (response.redirected) return false;
  if (response.headers.get("content-range") !== null) return false;
  if ((response.headers.get("vary") ?? "").split(",").some((value) => value.trim() === "*")) return false;
  return true;
}
