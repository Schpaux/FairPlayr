// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { META_CACHE, precacheName } from "./cacheNames";
import {
  NAVIGATION_TIMEOUT_MS,
  PRECACHE_HEADER,
  ROOT_TIMEOUT_MS,
  UPDATE_OVERRIDE_TTL_MS,
  UpdateDeferredError,
  createEngine,
  type EngineDeps,
} from "./engine";
import { MESSAGE } from "./protocol";
import { shellPrecacheEntries } from "./shellRoutes";

const ORIGIN = "https://fairplayr.app";

class FakeCache {
  store = new Map<string, Response>();
  async match(key: string | Request) {
    const hit = this.store.get(typeof key === "string" ? key : key.url);
    return hit?.clone();
  }
  async put(key: string, response: Response) {
    this.store.set(key, response);
  }
  async delete(key: string) {
    return this.store.delete(key);
  }
  async keys() {
    return [...this.store.keys()].map((url) => new Request(url));
  }
}

class FakeCacheStorage {
  map = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.map.has(name)) this.map.set(name, new FakeCache());
    return this.map.get(name)! as unknown as Cache;
  }
  async keys() {
    return [...this.map.keys()];
  }
  async delete(name: string) {
    return this.map.delete(name);
  }
  async has(name: string) {
    return this.map.has(name);
  }
  async match() {
    return undefined;
  }
}

function html(body: string, init: ResponseInit = {}) {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init });
}

type FetchImpl = (request: Request) => Promise<Response>;

function setup(overrides: Partial<EngineDeps> & { fetchImpl?: FetchImpl; store?: FakeCacheStorage } = {}) {
  const caches = overrides.store ?? new FakeCacheStorage();
  const requests: Request[] = [];
  const fetchImpl: FetchImpl =
    overrides.fetchImpl ?? (async (request) => html(`network ${new URL(request.url).pathname}`));
  const { store: _store, ...rest } = overrides;
  void _store;
  const deps: EngineDeps = {
    config: { buildId: "b2", mode: "on" },
    manifest: [{ url: "/_next/static/chunks/a.js", revision: null }, "/_next/static/media/inter.woff2"],
    origin: ORIGIN,
    caches: caches as unknown as CacheStorage,
    fetch: async (request) => {
      requests.push(request);
      return fetchImpl(request);
    },
    registration: { active: null, unregister: vi.fn(async () => true) },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(async () => undefined),
    networkTimeoutMs: 50,
    ...rest,
  };
  return { engine: createEngine(deps), caches, requests, deps };
}

const navigation = (path: string, init: RequestInit = {}) => {
  const request = new Request(`${ORIGIN}${path}`, init);
  Object.defineProperty(request, "mode", { value: "navigate" });
  return request;
};
const offline: FetchImpl = async () => {
  throw new TypeError("Failed to fetch");
};

describe("install", () => {
  it("precaches static files and every shell, shells without credentials and with a fixed locale", async () => {
    const { engine, caches, requests, deps } = setup();
    await engine.install();

    const cache = caches.map.get(precacheName("b2"))!;
    const keys = [...cache.store.keys()].map((url) => new URL(url).pathname);
    expect(keys).toEqual(expect.arrayContaining(["/_next/static/chunks/a.js", "/_next/static/media/inter.woff2"]));
    expect(keys).toEqual(expect.arrayContaining(shellPrecacheEntries().map((entry) => entry.url)));

    const shell = requests.find((request) => new URL(request.url).pathname === "/match/live")!;
    expect(shell.credentials).toBe("omit");
    expect(shell.headers.get("accept-language")).toBe("en");
    expect(shell.headers.get(PRECACHE_HEADER)).toBe("b2");
    const no = requests.find((request) => new URL(request.url).pathname === "/no/match/live")!;
    expect(no.headers.get("accept-language")).toMatch(/^nb/);
    expect(deps.skipWaiting).not.toHaveBeenCalled();
  });

  it("fails (and so never activates) when a shell redirects or errors", async () => {
    const { engine } = setup({
      fetchImpl: async (request) =>
        new URL(request.url).pathname === "/match/setup" ? new Response("", { status: 500 }) : html("ok"),
    });
    await expect(engine.install()).rejects.toThrow(/precache \/match\/setup: status 500/);
  });

  it("claims clients on the first install only", async () => {
    const first = setup();
    await first.engine.install();
    await first.engine.activate();
    expect(first.deps.clients.claim).toHaveBeenCalledTimes(1);

    const update = setup({ registration: { active: {}, unregister: vi.fn(async () => true) } });
    await update.engine.install();
    await update.engine.activate();
    expect(update.deps.clients.claim).not.toHaveBeenCalled();
    expect(update.deps.skipWaiting).not.toHaveBeenCalled();
  });
});

describe("update gate (no new build mid-match)", () => {
  const asUpdate = () => ({ registration: { active: {}, unregister: vi.fn(async () => true) } });

  it("an update fails its install while a match is active, without fetching anything", async () => {
    const { engine, requests, caches } = setup(asUpdate());
    await engine.handleMessage({ type: MESSAGE.setMatchActive, active: true });
    await expect(engine.install()).rejects.toBeInstanceOf(UpdateDeferredError);
    expect(requests).toHaveLength(0);
    expect(caches.map.has(precacheName("b2"))).toBe(false);
  });

  it("installs once the match has ended", async () => {
    const { engine, caches } = setup(asUpdate());
    await engine.handleMessage({ type: MESSAGE.setMatchActive, active: true });
    await expect(engine.install()).rejects.toBeInstanceOf(UpdateDeferredError);
    await engine.handleMessage({ type: MESSAGE.setMatchActive, active: false });
    await engine.install();
    expect(caches.map.get(precacheName("b2"))!.store.size).toBeGreaterThan(0);
  });

  it("never gates the first install", async () => {
    const { engine } = setup();
    await engine.handleMessage({ type: MESSAGE.setMatchActive, active: true });
    await expect(engine.install()).resolves.toBeUndefined();
  });

  it("the D4 override lets exactly one update through, and expires", async () => {
    let clock = 1_000_000;
    const { engine } = setup({ ...asUpdate(), now: () => clock });
    await engine.handleMessage({ type: MESSAGE.setMatchActive, active: true });
    await engine.handleMessage({ type: MESSAGE.allowUpdateOnce });
    await expect(engine.install()).resolves.toBeUndefined();
    await expect(engine.install()).rejects.toBeInstanceOf(UpdateDeferredError);

    await engine.handleMessage({ type: MESSAGE.allowUpdateOnce });
    clock += UPDATE_OVERRIDE_TTL_MS + 1;
    await expect(engine.install()).rejects.toBeInstanceOf(UpdateDeferredError);
  });

  it("acknowledges gate messages and reports the state", async () => {
    const { engine } = setup();
    const reply = { postMessage: vi.fn() };
    await engine.handleMessage({ type: MESSAGE.setMatchActive, active: true }, reply);
    expect(reply.postMessage).toHaveBeenCalledWith({ type: MESSAGE.ack, of: MESSAGE.setMatchActive });
    const status = { postMessage: vi.fn() };
    await engine.handleMessage({ type: MESSAGE.getStatus }, status);
    expect(status.postMessage).toHaveBeenCalledWith(expect.objectContaining({ matchActive: true }));
  });

  it("the kill switch is never gated", async () => {
    const { engine, deps } = setup({ ...asUpdate(), config: { buildId: "k", mode: "off" } });
    await engine.handleMessage({ type: MESSAGE.setMatchActive, active: true });
    await expect(engine.install()).resolves.toBeUndefined();
    expect(deps.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

describe("pin: an update that activates by itself mid-match keeps serving the old build", () => {
  /** b1 installed and active; b2 waiting (it installed before the match started). */
  async function twoBuilds() {
    const store = new FakeCacheStorage();
    const build = (id: string) => (request: Request) =>
      Promise.resolve(html(`${id} ${new URL(request.url).pathname}`));
    const old = setup({ store, config: { buildId: "b1", mode: "on" }, fetchImpl: build("b1") });
    await old.engine.install();
    await old.engine.activate();
    const next = setup({
      store,
      config: { buildId: "b2", mode: "on" },
      fetchImpl: build("b2"),
      registration: { active: {}, unregister: vi.fn(async () => true) },
    });
    await next.engine.install();
    return { store, old, next };
  }

  it("all pages closed during a match: b2 activates but serves b1's shells, and keeps b1's cache", async () => {
    const { store, old, next } = await twoBuilds();
    await old.engine.handleMessage({ type: MESSAGE.setMatchActive, active: true });
    await next.engine.activate();
    expect(await (await next.engine.handleFetch(navigation("/no/match/live"))!).text()).toBe("b1 /no/match/live");
    expect(await store.keys()).toEqual(expect.arrayContaining([precacheName("b1"), precacheName("b2")]));
    const reply = { postMessage: vi.fn() };
    await next.engine.handleMessage({ type: MESSAGE.getStatus }, reply);
    expect(reply.postMessage).toHaveBeenCalledWith(expect.objectContaining({ buildId: "b2", servedBuildId: "b1" }));
  });

  it("the pin survives a worker restart and ends when the match ends", async () => {
    const { store, old, next } = await twoBuilds();
    await old.engine.handleMessage({ type: MESSAGE.setMatchActive, active: true });
    await next.engine.activate();

    const restarted = setup({ store, config: { buildId: "b2", mode: "on" }, registration: { active: {}, unregister: vi.fn(async () => true) } });
    expect(await (await restarted.engine.handleFetch(navigation("/no/team"))!).text()).toBe("b1 /no/team");

    await restarted.engine.handleMessage({ type: MESSAGE.setMatchActive, active: false });
    expect(await (await restarted.engine.handleFetch(navigation("/no/team"))!).text()).toBe("b2 /no/team");

    // A page still running b1 can load b1's files until the next activation.
    await store.map.get(precacheName("b1"))!.put(`${ORIGIN}/_next/static/chunks/old-only.js`, html("b1 chunk"));
    expect(await (await restarted.engine.handleFetch(new Request(`${ORIGIN}/_next/static/chunks/old-only.js`))!).text()).toBe("b1 chunk");
    const third = setup({ store, config: { buildId: "b3", mode: "on" }, registration: { active: {}, unregister: vi.fn(async () => true) } });
    await third.engine.install();
    await third.engine.activate();
    expect(store.map.has(precacheName("b1"))).toBe(false);
    expect(store.map.has(precacheName("b2"))).toBe(false);
  });

  it("while pinned, files only the new build has still come from its cache", async () => {
    const { store, old, next } = await twoBuilds();
    await old.engine.handleMessage({ type: MESSAGE.setMatchActive, active: true });
    await next.engine.activate();
    await store.map.get(precacheName("b2"))!.put(`${ORIGIN}/_next/static/chunks/new-only.js`, html("b2 chunk"));
    expect(await (await next.engine.handleFetch(new Request(`${ORIGIN}/_next/static/chunks/new-only.js`))!).text()).toBe("b2 chunk");
  });

  it("no pin without a match, or when the activation was asked for (consent, D4)", async () => {
    const plain = await twoBuilds();
    await plain.next.engine.activate();
    expect(await (await plain.next.engine.handleFetch(navigation("/no/team"))!).text()).toBe("b2 /no/team");
    expect(plain.store.map.has(precacheName("b1"))).toBe(false);

    const asked = await twoBuilds();
    await asked.old.engine.handleMessage({ type: MESSAGE.setMatchActive, active: true });
    await asked.next.engine.handleMessage({ type: MESSAGE.skipWaiting });
    await asked.next.engine.activate();
    expect(await (await asked.next.engine.handleFetch(navigation("/no/team"))!).text()).toBe("b2 /no/team");
    expect(asked.store.map.has(precacheName("b1"))).toBe(false);
  });
});

describe("activate", () => {
  it("deletes our caches from other builds only", async () => {
    const { engine, caches } = setup({ registration: { active: {}, unregister: vi.fn(async () => true) } });
    await caches.open(precacheName("b1"));
    await caches.open("someone-else");
    await caches.open(META_CACHE);
    await engine.install();
    await engine.activate();
    expect((await caches.keys()).sort()).toEqual([META_CACHE, precacheName("b2"), "someone-else"].sort());
  });
});

describe("fetch", () => {
  it("does not answer passthrough requests", async () => {
    const { engine } = setup();
    expect(engine.handleFetch(new Request(`${ORIGIN}/api/home/summary`))).toBeNull();
    expect(engine.handleFetch(new Request(`${ORIGIN}/no/match/live`, { headers: { RSC: "1" } }))).toBeNull();
    expect(engine.handleFetch(new Request(`${ORIGIN}/no`, { method: "POST", body: "x" }))).toBeNull();
    expect(engine.handleFetch(new Request("https://x.supabase.co/auth/v1/user"))).toBeNull();
  });

  it("serves shells cache-first from this build, also online", async () => {
    const { engine, requests } = setup();
    await engine.install();
    const before = requests.length;
    const response = await engine.handleFetch(navigation("/no/match/live?x=1"))!;
    expect(await response.text()).toBe("network /no/match/live");
    expect(requests.length).toBe(before);
  });

  it("other navigations go to the network, and offline to the locale's offline page", async () => {
    const online = setup();
    await online.engine.install();
    expect(await (await online.engine.handleFetch(navigation("/no/historikk"))!).text()).toBe("network /no/historikk");

    let isOffline = false;
    const { engine } = setup({ fetchImpl: async (request) => (isOffline ? offline(request) : html(`network ${new URL(request.url).pathname}`)) });
    await engine.install();
    isOffline = true;
    expect(await (await engine.handleFetch(navigation("/no/historikk"))!).text()).toBe("network /no/offline");
    expect(await (await engine.handleFetch(navigation("/historikk"))!).text()).toBe("network /offline");
  });

  it("falls back after the network timeout", async () => {
    let slow = false;
    const { engine } = setup({
      fetchImpl: (request) =>
        slow ? new Promise<Response>(() => undefined) : Promise.resolve(html(`network ${new URL(request.url).pathname}`)),
    });
    await engine.install();
    slow = true;
    expect(await (await engine.handleFetch(navigation("/no/settings"))!).text()).toBe("network /no/offline");
  });

  it("a slow network within the navigation budget is served", async () => {
    let delay = 0;
    const { engine } = setup({
      networkTimeoutMs: 400,
      fetchImpl: (request) =>
        new Promise<Response>((resolve) => setTimeout(() => resolve(html(`network ${new URL(request.url).pathname}`)), delay)),
    });
    await engine.install();
    delay = 150;
    expect(await (await engine.handleFetch(navigation("/no/historikk"))!).text()).toBe("network /no/historikk");
  });

  it("waits long enough for weak 3G on navigations, briefly on / only", () => {
    expect(NAVIGATION_TIMEOUT_MS).toBeGreaterThanOrEqual(8000);
    expect(ROOT_TIMEOUT_MS).toBeLessThan(NAVIGATION_TIMEOUT_MS);
  });

  it("/ opens the known locale's Home from the precache, without waiting for the network", async () => {
    const { engine, requests } = setup();
    await engine.install();
    const before = requests.length;

    await engine.handleMessage({ type: MESSAGE.setLocale, locale: "no" });
    const redirect = await engine.handleFetch(navigation("/"))!;
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe(`${ORIGIN}/no`);

    await engine.handleMessage({ type: MESSAGE.setLocale, locale: "en" });
    expect(await (await engine.handleFetch(navigation("/?source=pwa"))!).text()).toBe("network /");
    expect(requests.length).toBe(before);
  });

  it("/ without a known locale waits only the short root timeout", async () => {
    let slow = false;
    const { engine } = setup({
      networkTimeoutMs: 5000,
      rootTimeoutMs: 50,
      fetchImpl: (request) =>
        slow ? new Promise<Response>(() => undefined) : Promise.resolve(html(`network ${new URL(request.url).pathname}`)),
    });
    await engine.install();
    slow = true;
    const started = Date.now();
    expect(await (await engine.handleFetch(navigation("/"))!).text()).toBe("network /");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("never stores a navigation response at runtime", async () => {
    const { engine, caches } = setup();
    await engine.install();
    const count = (await caches.map.get(precacheName("b2"))!.keys()).length;
    await engine.handleFetch(navigation("/no/historikk"));
    expect((await caches.map.get(precacheName("b2"))!.keys()).length).toBe(count);
  });

  it("/ is network-first and offline opens the last used locale", async () => {
    let isOffline = false;
    const { engine } = setup({ fetchImpl: async (request) => (isOffline ? offline(request) : html(`network ${new URL(request.url).pathname}`)) });
    await engine.install();
    expect(await (await engine.handleFetch(navigation("/"))!).text()).toBe("network /");

    isOffline = true;
    expect(await (await engine.handleFetch(navigation("/?source=pwa"))!).text()).toBe("network /");

    await engine.handleMessage({ type: MESSAGE.setLocale, locale: "no" });
    const redirect = await engine.handleFetch(navigation("/"))!;
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe(`${ORIGIN}/no`);
  });

  it("offline /en paths redirect to the unprefixed shell", async () => {
    let isOffline = false;
    const { engine } = setup({ fetchImpl: async (request) => (isOffline ? offline(request) : html("x")) });
    await engine.install();
    isOffline = true;
    const response = await engine.handleFetch(navigation("/en/match/live"))!;
    expect(response.headers.get("location")).toBe(`${ORIGIN}/match/live`);
  });

  it("assets come from the precache, unknown ones from the network", async () => {
    const { engine, requests } = setup();
    await engine.install();
    const before = requests.length;
    await engine.handleFetch(new Request(`${ORIGIN}/_next/static/chunks/a.js`));
    expect(requests.length).toBe(before);
    await engine.handleFetch(new Request(`${ORIGIN}/_next/static/chunks/other.js`));
    expect(requests.length).toBe(before + 1);
  });
});

describe("messages", () => {
  it("SKIP_WAITING activates the waiting worker, nothing else does", async () => {
    const { engine, deps } = setup();
    await engine.handleMessage({ type: "something" });
    expect(deps.skipWaiting).not.toHaveBeenCalled();
    await engine.handleMessage({ type: "SKIP_WAITING" });
    expect(deps.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it("answers a status request", async () => {
    const { engine } = setup();
    await engine.install();
    const reply = { postMessage: vi.fn() };
    await engine.handleMessage({ type: MESSAGE.getStatus }, reply);
    expect(reply.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: MESSAGE.status, buildId: "b2", precacheName: "fp-precache-b2", mode: "on" })
    );
  });
});

describe("kill switch", () => {
  it("skips waiting, clears every fp- cache, unregisters and answers nothing", async () => {
    const { engine, caches, deps } = setup({ config: { buildId: "k", mode: "off" } });
    await caches.open(precacheName("b1"));
    await caches.open(META_CACHE);
    await caches.open("other-app");
    await engine.install();
    expect(deps.skipWaiting).toHaveBeenCalledTimes(1);
    await engine.activate();
    expect(await caches.keys()).toEqual(["other-app"]);
    expect(deps.registration.unregister).toHaveBeenCalledTimes(1);
    expect(deps.clients.claim).not.toHaveBeenCalled();
    expect(engine.handleFetch(navigation("/no"))).toBeNull();

    // Messages after the kill never create a cache again.
    await engine.handleMessage({ type: MESSAGE.setLocale, locale: "no" });
    const reply = { postMessage: vi.fn() };
    await engine.handleMessage({ type: MESSAGE.getStatus }, reply);
    expect(reply.postMessage).toHaveBeenCalledWith(expect.objectContaining({ mode: "off", precachedCount: 0, lastLocale: null }));
    expect(await caches.keys()).toEqual(["other-app"]);
  });
});
