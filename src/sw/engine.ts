/**
 * The service worker's behaviour (FP-OFF-01a stream B, §2.1, §2.2, §S), with
 * its browser dependencies injected so Vitest can run it. `sw.ts` only wires
 * these functions to the worker's events.
 *
 * Strategies, by `classifyRequest` decision:
 * - asset:    this build's precache, else network (not stored).
 * - shell:    cache-first from this build's precache (§S.5), else network.
 * - launch:   an installed app's start (`/?source=pwa`, `/no?source=pwa`,
 *             WEB-01d): a redirect to the app's Home (`/play`, `/no/play`) in
 *             the URL's locale, else the last used one, without waiting for
 *             the network. Only without either does the server pick (short
 *             timeout), and offline it is the English Home.
 * - root and marketing: network-first, bypassing HTTP cache; build-scoped
 *   precache only on failure, timeout or server error.
 * - navigate: network-first with a generous timeout (weak 3G), then the
 *             offline page for the path's locale. Navigation responses are
 *             never stored at runtime.
 * - passthrough: not answered (`null`), so the browser uses the network.
 *
 * Lifecycle (§2.2, §S.7):
 * - install precaches everything for this build; except the one-time website
 *   migration below, it never calls skipWaiting:
 *   a new build waits until every page has closed, or until the coach agrees
 *   to update (`SKIP_WAITING`, only offered when no match is active).
 * - update gate: an update (a worker is already active) fails its install
 *   while the page has reported an active match (`FP_SET_MATCH_ACTIVE`), so
 *   it goes redundant and can never activate at a cold start mid-match. The
 *   browser retries on the next update check; the page checks again right
 *   after the match ends. `FP_ALLOW_UPDATE_ONCE` (D4 only) lets one update
 *   through. The first install is never gated.
 * - pin: a build that installed before the match started (it was waiting)
 *   still activates when every page closes. If a match is active then and
 *   nobody asked for it (no SKIP_WAITING), the new worker keeps serving the
 *   previous build's precache, so the app the coach reopens is the same
 *   version. The pin ends when the page reports the match has ended; the old
 *   build's files stay available to pages still running it (lazy chunks)
 *   until the next activation. A pinned build from before `/play` (WEB-01d)
 *   has its Home at `/` and `/no`: while it is served, a launch and `/play`
 *   open that Home, so the coach sees one version for the whole match.
 * - WEB-01m: one-time migration skips waiting only outside a match and
 *   navigates website clients. App clients use their existing guarded
 *   controllerchange handling; old chunks are retained for open pages.
 * - activate deletes our caches from other builds only, and claims clients
 *   only on the very first install (no worker was active before).
 * - kill switch (`mode: "off"`): skipWaiting, delete every `fp-` cache,
 *   unregister. It never reloads or navigates a page.
 */
import {
  META_CACHE,
  META_KEYS,
  cachesToDeleteOnActivate,
  cachesToDeleteOnKill,
  precacheName,
  sanitizeBuildId,
} from "./cacheNames";
import { MESSAGE, parseClientMessage, type SwBuildConfig, type SwStatus } from "./protocol";
import { APP_HOME_PATH } from "../lib/appRoutes";
import { classifyRequest, isStorableResponse } from "./routes";
import {
  SHELL_DEFAULT_LOCALE,
  defaultLocaleAlias,
  isShellLocale,
  launchTarget,
  legacyHomeFor,
  localeOfPath,
  matchShell,
  normalizePathname,
  offlinePathFor,
  rootFallback,
  shellPrecacheEntries,
  type ShellEntry,
  type ShellLocale,
} from "./shellRoutes";

export type ManifestEntry = string | { url: string; revision?: string | null };

export interface EngineDeps {
  config: SwBuildConfig;
  manifest: readonly ManifestEntry[] | undefined;
  origin: string;
  caches: CacheStorage;
  fetch: (request: Request) => Promise<Response>;
  /** `self.registration`: `active` is read at install time. */
  registration: { readonly active: unknown; unregister(): Promise<boolean> };
  clients: {
    claim(): Promise<void>;
    matchAll(options: { type: "window"; includeUncontrolled: true }): Promise<readonly { url: string; navigate(url: string): Promise<unknown> }[]>;
  };
  skipWaiting(): Promise<void>;
  /** Timeout for navigations other than `/` (default NAVIGATION_TIMEOUT_MS). */
  networkTimeoutMs?: number;
  /** Timeout for website `/` (default ROOT_TIMEOUT_MS). */
  rootTimeoutMs?: number;
  /** Parallel precache requests. */
  concurrency?: number;
  now?: () => number;
}

/** Non-shell navigations: long enough for a slow 3G page, then the offline page. */
export const NAVIGATION_TIMEOUT_MS = 8000;
/** Website `/`: a short wait before the offline front page. */
export const ROOT_TIMEOUT_MS = 3000;
/** How long a D4 override (FP_ALLOW_UPDATE_ONCE) stays valid. */
export const UPDATE_OVERRIDE_TTL_MS = 5 * 60 * 1000;
/** Header on every precache request, so a test proxy can tell them apart. */
export const PRECACHE_HEADER = "x-fp-sw-precache";

const ACCEPT_LANGUAGE: Record<ShellLocale, string> = { en: "en", no: "nb,no;q=0.9" };

export class PrecacheError extends Error {}
/** Thrown by install to defer an update while a match is active. */
export class UpdateDeferredError extends Error {}

async function inBatches<T>(items: readonly T[], size: number, run: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(run));
  }
}

export function createEngine(deps: EngineDeps) {
  const { config, origin } = deps;
  const cacheName = precacheName(config.buildId);
  const ownBuild = sanitizeBuildId(config.buildId);
  const timeoutMs = deps.networkTimeoutMs ?? NAVIGATION_TIMEOUT_MS;
  const rootTimeoutMs = deps.rootTimeoutMs ?? ROOT_TIMEOUT_MS;
  const now = deps.now ?? (() => Date.now());
  /** Build being served instead of ours while pinned; undefined = not read yet. */
  let pinned: string | null | undefined;
  /** Previous build kept for open pages after a pin ended; undefined = not read yet. */
  let retired: string | null | undefined;
  /** SKIP_WAITING arrived: this activation was asked for (consent or D4). */
  let activationRequested = false;
  const absolute = (path: string) => new URL(path, origin).toString();

  function staticUrls(): string[] {
    const urls = (deps.manifest ?? []).map((entry) => (typeof entry === "string" ? entry : entry.url));
    return [...new Set(urls.map((url) => new URL(url, origin).pathname))];
  }

  /**
   * Shell HTML is fetched without credentials: no session cookie goes out,
   * so the server cannot render (or set cookies for) a user, and whatever it
   * sends back is the anonymous page every user gets. The locale is fixed per
   * entry, because unprefixed paths are localised by Accept-Language.
   */
  function shellRequest(entry: ShellEntry): Request {
    return new Request(absolute(entry.url), {
      credentials: "omit",
      cache: "reload",
      headers: { "Accept-Language": ACCEPT_LANGUAGE[entry.locale], [PRECACHE_HEADER]: config.buildId },
    });
  }

  function assetRequest(pathname: string): Request {
    return new Request(absolute(pathname), {
      credentials: "same-origin",
      cache: "reload",
      headers: { [PRECACHE_HEADER]: config.buildId },
    });
  }

  async function precacheOne(cache: Cache, key: string, request: Request) {
    if (await cache.match(absolute(key))) return; // install restarted: keep what this build already has
    const response = await deps.fetch(request);
    if (!isStorableResponse(response)) {
      throw new PrecacheError(`precache ${key}: status ${response.status}${response.redirected ? " (redirected)" : ""}`);
    }
    await cache.put(absolute(key), response);
  }

  async function install(): Promise<void> {
    if (config.mode === "off") {
      await deps.skipWaiting();
      return;
    }

    const firstInstall = !deps.registration.active;
    if (!firstInstall && (await readMatchActive()) && !(await consumeUpdateOverride())) {
      // Never activate a new build at a cold start mid-match (§2.2): the
      // update goes redundant and is retried on the next update check.
      throw new UpdateDeferredError("update deferred: a match is active on this device");
    }
    const cache = await deps.caches.open(cacheName);
    const concurrency = deps.concurrency ?? 8;

    await inBatches(staticUrls(), concurrency, (pathname) => precacheOne(cache, pathname, assetRequest(pathname)));
    await inBatches(shellPrecacheEntries(), concurrency, (entry) => precacheOne(cache, entry.url, shellRequest(entry)));

    if (firstInstall) {
      const meta = await deps.caches.open(META_CACHE);
      await meta.put(absolute(META_KEYS.firstInstall(config.buildId)), new Response("1"));
    } else if ((await needsMarketingMigration()) && !(await readMatchActive())) {
      // Old website HTML has no registrar/update prompt. Browser update checks
      // still fetch this same script URL: finish the migration without new JS.
      // Do not set activationRequested: a match starting now must still pin.
      await deps.skipWaiting();
    }
  }

  async function needsMarketingMigration(): Promise<boolean> {
    return (await readMeta(META_KEYS.marketingNetworkFirst)) !== "1" &&
      (await readMeta(META_KEYS.servedBuild)) !== null;
  }

  async function kill(): Promise<void> {
    const names = await deps.caches.keys();
    await Promise.all(cachesToDeleteOnKill(names).map((name) => deps.caches.delete(name)));
    await deps.registration.unregister();
  }

  async function activate(): Promise<void> {
    if (config.mode === "off") {
      await kill();
      return;
    }

    const meta = await deps.caches.open(META_CACHE);
    const flag = absolute(META_KEYS.firstInstall(config.buildId));
    const firstInstall = Boolean(await meta.match(flag));
    const requested = activationRequested;
    activationRequested = false;

    // Activated by the browser (all pages closed) during a match: keep
    // serving the build the match was started with.
    const previous = await readMeta(META_KEYS.servedBuild);
    const pin =
      !firstInstall &&
      !requested &&
      previous !== null &&
      previous !== ownBuild &&
      (await readMatchActive()) &&
      (await deps.caches.has(precacheName(previous)))
        ? previous
        : null;

    const migrating = !firstInstall && (await needsMarketingMigration());
    // Existing app tabs may still need old chunks if they defer their reload.
    const keep = pin ?? (migrating ? previous : null);
    const names = await deps.caches.keys();
    await Promise.all(cachesToDeleteOnActivate(names, config.buildId, keep).map((name) => deps.caches.delete(name)));
    retired = pin === null && migrating && previous !== ownBuild ? previous : null;
    if (retired !== null) await meta.put(absolute(META_KEYS.retiredBuild), new Response(retired));
    else await meta.delete(absolute(META_KEYS.retiredBuild));
    if (pin !== null) {
      await meta.put(absolute(META_KEYS.pinnedBuild), new Response(pin));
    } else {
      await meta.delete(absolute(META_KEYS.pinnedBuild));
      await meta.put(absolute(META_KEYS.servedBuild), new Response(ownBuild));
    }
    pinned = pin;

    if (firstInstall) {
      await meta.delete(flag);
      // First install only: the page that installed us is controlled without
      // a reload. Never on an update (§S.7).
      await deps.clients.claim();
    }
    if (pin === null) {
      await writeMeta(META_KEYS.marketingNetworkFirst, "1");
      if (migrating && !(await readMatchActive())) {
        // Only website documents are explicitly navigated. App clients retain
        // their existing guarded controllerchange handling. Website pages are
        // navigated; this also works when their old HTML has no client JS.
        for (const client of await deps.clients.matchAll({ type: "window", includeUncontrolled: true })) {
          const url = new URL(client.url);
          const path = normalizePathname(url.pathname);
          if (url.origin === origin && (path === "/" || path === "/no") &&
              url.searchParams.get("source") !== "pwa" && !(await readMatchActive())) {
            // Navigation waits for activation; awaiting it here would deadlock
            // the activate event. Only dispatch it within the lifetime promise.
            void client.navigate(client.url).catch(() => undefined);
          }
        }
      }
    }
  }

  async function existingBuild(key: string): Promise<string | null> {
    const value = await readMeta(key);
    return value !== null && value.length > 0 && value !== ownBuild && (await deps.caches.has(precacheName(value))) ? value : null;
  }

  async function pinnedBuild(): Promise<string | null> {
    if (pinned === undefined) pinned = await existingBuild(META_KEYS.pinnedBuild);
    return pinned;
  }

  async function retiredBuild(): Promise<string | null> {
    if (retired === undefined) retired = await existingBuild(META_KEYS.retiredBuild);
    return retired;
  }

  /**
   * The match has ended: shells come from our own build from now on. The old
   * build's files stay as a fallback for pages still running it.
   */
  async function unpin(): Promise<void> {
    const previous = await pinnedBuild();
    if (previous === null) return;
    pinned = null;
    retired = previous;
    const meta = await deps.caches.open(META_CACHE);
    await meta.put(absolute(META_KEYS.retiredBuild), new Response(previous));
    await meta.delete(absolute(META_KEYS.pinnedBuild));
    await meta.put(absolute(META_KEYS.servedBuild), new Response(ownBuild));
  }

  async function readLastLocale(): Promise<ShellLocale | null> {
    try {
      // Reading never creates a cache (the kill switch must leave none behind).
      if (!(await deps.caches.has(META_CACHE))) return null;
      const meta = await deps.caches.open(META_CACHE);
      const value = (await (await meta.match(absolute(META_KEYS.lastLocale)))?.text())?.trim();
      return isShellLocale(value) ? value : null;
    } catch {
      return null;
    }
  }

  async function readMeta(key: string): Promise<string | null> {
    try {
      if (!(await deps.caches.has(META_CACHE))) return null;
      const meta = await deps.caches.open(META_CACHE);
      return (await (await meta.match(absolute(key)))?.text())?.trim() ?? null;
    } catch {
      return null;
    }
  }

  async function readMatchActive(): Promise<boolean> {
    return (await readMeta(META_KEYS.matchActive)) === "1";
  }

  /** True (and spent) when a fresh D4 override is stored. */
  async function consumeUpdateOverride(): Promise<boolean> {
    const value = await readMeta(META_KEYS.allowUpdateOnce);
    if (value === null) return false;
    try {
      const meta = await deps.caches.open(META_CACHE);
      await meta.delete(absolute(META_KEYS.allowUpdateOnce));
    } catch {
      // Could not spend it: refuse rather than risk a reusable override.
      return false;
    }
    const at = Number(value);
    return Number.isFinite(at) && now() - at >= 0 && now() - at <= UPDATE_OVERRIDE_TTL_MS;
  }

  async function writeMeta(key: string, value: string): Promise<void> {
    const meta = await deps.caches.open(META_CACHE);
    await meta.put(absolute(key), new Response(value));
  }

  async function fromPrecache(path: string): Promise<Response | undefined> {
    const pin = await pinnedBuild();
    const cache = await deps.caches.open(pin === null ? cacheName : precacheName(pin));
    return cache.match(absolute(path));
  }

  /** Static files: the served build first, then the other build we still hold. */
  async function assetFromPrecache(path: string): Promise<Response | undefined> {
    const served = await fromPrecache(path);
    if (served) return served;
    const other = (await pinnedBuild()) !== null ? ownBuild : await retiredBuild();
    if (other === null) return undefined;
    return (await deps.caches.open(precacheName(other))).match(absolute(path));
  }

  function networkWithTimeout(request: Request, ms: number = timeoutMs): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("network timeout")), ms);
      deps.fetch(request).then(
        (response) => {
          clearTimeout(timer);
          resolve(response);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  function redirectTo(path: string): Response {
    return Response.redirect(absolute(path), 302);
  }

  /**
   * Pinned to a build from before WEB-01d: it has no `/play`; its Home is `/`
   * and `/no`. Inferred from that build's precache on purpose (old workers
   * wrote no marker). A precache that lacks `/play` for another reason lands
   * on the same network fallback as before WEB-01d, never in a loop.
   */
  async function servesLegacyBuild(): Promise<boolean> {
    const pin = await pinnedBuild();
    if (pin === null) return false;
    return !(await (await deps.caches.open(precacheName(pin))).match(absolute(APP_HOME_PATH)));
  }

  async function offlineFallback(pathname: string): Promise<Response> {
    const alias = defaultLocaleAlias(pathname);
    if (alias !== null && (alias === "/" || matchShell(alias))) return redirectTo(alias);
    return (await fromPrecache(offlinePathFor(localeOfPath(pathname)))) ?? Response.error();
  }

  async function rootFromCache(locale: ShellLocale | null): Promise<Response | undefined> {
    const target = rootFallback(locale);
    if (target.type === "redirect") return matchShell(target.url) && (await fromPrecache(target.url)) ? redirectTo(target.url) : undefined;
    return fromPrecache(target.url);
  }

  async function handleRoot(request: Request): Promise<Response> {
    const lastLocale = await readLastLocale();
    // A pinned pre-/play build uses the website paths as its live app Home.
    if (await servesLegacyBuild()) {
      const cached = await rootFromCache(lastLocale);
      if (cached) return cached;
    }
    try {
      return await marketingNetwork(request, rootTimeoutMs);
    } catch {
      return (await rootFromCache(lastLocale)) ?? (await fromPrecache(offlinePathFor("en"))) ?? Response.error();
    }
  }

  async function marketingNetwork(request: Request, ms: number = timeoutMs): Promise<Response> {
    const response = await networkWithTimeout(new Request(request, { cache: "no-store" }), ms);
    if (response.status >= 500) throw new Error("website unavailable");
    return response;
  }

  async function handleMarketing(request: Request, pathname: string): Promise<Response> {
    if (await servesLegacyBuild()) {
      const cached = await fromPrecache(pathname);
      if (cached) return cached;
    }
    try {
      return await marketingNetwork(request);
    } catch {
      return (await fromPrecache(pathname)) ?? offlineFallback(pathname);
    }
  }

  /**
   * An installed app's launch (WEB-01d). The query (the marker) is kept on
   * every redirect. A legacy build's Home is served at its own path rather
   * than redirected to, so `/?source=pwa` never loops back into a launch.
   */
  async function handleLaunch(request: Request, pathLocale: ShellLocale | null): Promise<Response> {
    const { pathname, search } = new URL(request.url);
    const locale = pathLocale ?? (await readLastLocale());
    if (await servesLegacyBuild()) {
      const home = legacyHomeFor(launchTarget(locale ?? SHELL_DEFAULT_LOCALE)) ?? "/";
      if (normalizePathname(pathname) !== home) return redirectTo(`${home}${search}`);
      return (await fromPrecache(home)) ?? handleNavigate(request, home);
    }
    if (locale !== null) return redirectTo(`${launchTarget(locale)}${search}`);
    try {
      // The server redirects by cookie or Accept-Language (src/proxy.ts).
      return await networkWithTimeout(request, rootTimeoutMs);
    } catch {
      return redirectTo(`${launchTarget(SHELL_DEFAULT_LOCALE)}${search}`);
    }
  }

  async function handleShell(request: Request, entry: ShellEntry): Promise<Response> {
    const legacyHome = legacyHomeFor(entry.url);
    if (legacyHome !== null && (await servesLegacyBuild())) {
      return redirectTo(`${legacyHome}${new URL(request.url).search}`);
    }
    return (await fromPrecache(entry.url)) ?? handleNavigate(request, entry.url);
  }

  async function handleNavigate(request: Request, pathname: string): Promise<Response> {
    try {
      return await networkWithTimeout(request);
    } catch {
      return offlineFallback(pathname);
    }
  }

  /** The response for a fetch event, or null to leave it to the browser. */
  function handleFetch(request: Request): Promise<Response> | null {
    if (config.mode === "off") return null;
    const decision = classifyRequest(request, origin);

    switch (decision.kind) {
      case "passthrough":
        return null;
      case "asset":
        return assetFromPrecache(decision.cacheKey).then((cached) => cached ?? deps.fetch(request));
      case "shell":
        return handleShell(request, decision.entry);
      case "marketing":
        return handleMarketing(request, decision.pathname);
      case "launch":
        return handleLaunch(request, decision.locale);
      case "root":
        return handleRoot(request);
      case "navigate":
        return handleNavigate(request, decision.pathname);
    }
  }

  async function status(): Promise<SwStatus> {
    let precachedCount = 0;
    try {
      if (await deps.caches.has(cacheName)) {
        precachedCount = (await (await deps.caches.open(cacheName)).keys()).length;
      }
    } catch {
      // A count is diagnostic only.
    }
    return {
      type: MESSAGE.status,
      buildId: config.buildId,
      mode: config.mode,
      precacheName: cacheName,
      precachedCount,
      lastLocale: await readLastLocale(),
      matchActive: await readMatchActive(),
      servedBuildId: (await pinnedBuild()) ?? ownBuild,
    };
  }

  async function handleMessage(data: unknown, reply?: { postMessage(message: unknown): void }): Promise<void> {
    const message = parseClientMessage(data);
    if (!message) return;

    if (message.type === MESSAGE.skipWaiting) {
      activationRequested = true;
      await deps.skipWaiting();
    } else if (message.type === MESSAGE.setLocale && config.mode === "on") {
      await writeMeta(META_KEYS.lastLocale, message.locale);
    } else if (message.type === MESSAGE.setMatchActive) {
      // The kill switch never creates a cache again; it has nothing to gate.
      if (config.mode === "on") {
        await writeMeta(META_KEYS.matchActive, message.active ? "1" : "0");
        if (!message.active) await unpin();
      }
      reply?.postMessage({ type: MESSAGE.ack, of: message.type });
    } else if (message.type === MESSAGE.allowUpdateOnce) {
      if (config.mode === "on") await writeMeta(META_KEYS.allowUpdateOnce, String(now()));
      reply?.postMessage({ type: MESSAGE.ack, of: message.type });
    } else if (message.type === MESSAGE.getStatus) {
      reply?.postMessage(await status());
    }
  }

  return { cacheName, install, activate, handleFetch, handleMessage, status };
}

export type Engine = ReturnType<typeof createEngine>;
