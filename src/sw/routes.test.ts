import { describe, expect, it } from "vitest";
import { canonicalPathname, classifyRequest, isAuthPath, isStorableResponse, type RequestLike } from "./routes";

const ORIGIN = "https://fairplayr.app";

function req(path: string, init: { method?: string; mode?: string; headers?: Record<string, string> } = {}): RequestLike {
  // A plain lookup: jsdom's Headers drops forbidden names such as Range.
  const entries = Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value] as const);
  const map = new Map(entries);
  const headers = { get: (name: string) => map.get(name.toLowerCase()) ?? null, has: (name: string) => map.has(name.toLowerCase()) };
  return { url: path.startsWith("http") ? path : `${ORIGIN}${path}`, method: init.method ?? "GET", mode: init.mode ?? "cors", headers };
}
const nav = (path: string, headers?: Record<string, string>) => req(path, { mode: "navigate", headers });

describe("classifyRequest: never handled by the worker", () => {
  it.each([
    ["POST navigation (Server Action)", req("/no/match/live", { method: "POST", mode: "navigate" }), "method"],
    ["HEAD", req("/no", { method: "HEAD", mode: "navigate" }), "method"],
    ["cross-origin Supabase REST", req("https://abc.supabase.co/rest/v1/teams"), "cross-origin"],
    ["cross-origin navigation", nav("https://accounts.google.com/o/oauth2"), "cross-origin"],
    ["Range", req("/_next/static/media/a.woff2", { headers: { Range: "bytes=0-10" } }), "range"],
    ["RSC header", req("/no/match/live", { headers: { RSC: "1" } }), "rsc"],
    ["RSC navigation-ish", nav("/no/match/live", { RSC: "1" }), "rsc"],
    ["_rsc param", req("/no/match/live?_rsc=abc"), "rsc"],
    ["router prefetch", req("/no/team", { headers: { "Next-Router-Prefetch": "1" } }), "rsc"],
    ["router state tree", req("/no/team", { headers: { "Next-Router-State-Tree": "%5B%5D" } }), "rsc"],
    ["/api GET", req("/api/home/summary"), "api"],
    ["/api navigation", nav("/api/matches/active/resolve"), "api"],
    ["auth page", nav("/no/auth/sign-in"), "auth"],
    ["auth callback", nav("/auth/callback?code=x"), "auth"],
    ["_vercel", req("/_vercel/insights/script.js"), "vercel"],
    ["the worker script", req("/serwist/sw.js"), "worker"],
    ["next image", req("/_next/image?url=x"), "next-internal"],
    ["other same-origin GET", req("/robots.txt"), "unhandled"],
    // Other spellings of the same paths (percent-encoding, slashes).
    ["encoded auth navigation", nav("/%61uth/callback?code=x"), "auth"],
    ["fully encoded auth", nav("/%61%75%74%68/x"), "auth"],
    ["encoded auth under /no", nav("/no/%61uth/sign-in"), "auth"],
    ["double-encoded auth", nav("/no/%2561uth/sign-in"), "auth"],
    ["encoded slash before auth", nav("/no%2Fauth%2Fsign-in"), "auth"],
    ["encoded auth fetch", req("/%61uth/callback"), "auth"],
    ["double slash /api", req("//api/x"), "api"],
    ["double slash /api navigation", nav("//api/x"), "api"],
    ["double slash auth", nav("//no//auth/sign-in"), "auth"],
    ["encoded /api", req("/%61pi/home/summary"), "api"],
    ["/api trailing slash", req("/api/"), "api"],
    ["/api/x trailing slash", nav("/api/home/summary/"), "api"],
    ["auth trailing slash", nav("/no/auth/"), "auth"],
    ["auth bare trailing slash", nav("/auth/"), "auth"],
    ["double slash worker", req("//serwist/sw.js"), "worker"],
    ["undecodable path", nav("/no/%E0%A4%A"), "unhandled"],
    ["double slash static file", req("//_next/static/chunks/a.js"), "unhandled"],
    ["encoded static file", req("/_next/static/chunks/%61.js"), "unhandled"],
    ["static file trailing slash", req("/favicon.ico/"), "unhandled"],
  ])("%s", (_label, request, reason) => {
    expect(classifyRequest(request, ORIGIN)).toEqual({ kind: "passthrough", reason });
  });
});

describe("classifyRequest: handled", () => {
  it("navigation to / is root", () => {
    expect(classifyRequest(nav("/"), ORIGIN)).toEqual({ kind: "root" });
    expect(classifyRequest(nav("/?source=pwa"), ORIGIN)).toEqual({ kind: "root" });
  });

  it.each(["/no", "/no/", "/no/match/live", "/no/match/setup?x=1", "/no/team", "/match/live", "/match/setup", "/team", "/offline", "/no/offline"])(
    "%s is a shell",
    (path) => {
      const decision = classifyRequest(nav(path), ORIGIN);
      expect(decision.kind).toBe("shell");
    }
  );

  it("other navigations are network-first", () => {
    expect(classifyRequest(nav("/no/historikk"), ORIGIN)).toEqual({ kind: "navigate", pathname: "/no/historikk" });
    expect(classifyRequest(nav("/no/match/abc"), ORIGIN)).toEqual({ kind: "navigate", pathname: "/no/match/abc" });
  });

  it("static files are assets keyed by path", () => {
    expect(classifyRequest(req("/_next/static/chunks/a.js?v=1"), ORIGIN)).toEqual({ kind: "asset", cacheKey: "/_next/static/chunks/a.js" });
    expect(classifyRequest(req("/manifest.webmanifest"), ORIGIN)).toEqual({ kind: "asset", cacheKey: "/manifest.webmanifest" });
    expect(classifyRequest(req("/favicon.ico"), ORIGIN)).toEqual({ kind: "asset", cacheKey: "/favicon.ico" });
    expect(classifyRequest(req("/apple-icon.png?abc123"), ORIGIN)).toEqual({ kind: "asset", cacheKey: "/apple-icon.png" });
    expect(classifyRequest(req("/icons/icon-maskable-512.png"), ORIGIN)).toEqual({ kind: "asset", cacheKey: "/icons/icon-maskable-512.png" });
  });

  it("a fetch (not a navigation) to a shell path is not answered", () => {
    expect(classifyRequest(req("/no/match/live"), ORIGIN)).toEqual({ kind: "passthrough", reason: "unhandled" });
  });
});

describe("other spellings of a shell are never cache-first", () => {
  it.each(["//no/match/live", "/no//match/live", "/no/match/%6Cive", "/%6Eo/team"])("%s goes to the network", (path) => {
    expect(classifyRequest(nav(path), ORIGIN).kind).toBe("navigate");
  });

  it("a plain trailing slash on a shell is still the shell", () => {
    expect(classifyRequest(nav("/no/match/live/"), ORIGIN)).toMatchObject({ kind: "shell", entry: { url: "/no/match/live" } });
  });
});

describe("canonicalPathname", () => {
  it("decodes, collapses slashes and drops the trailing slash", () => {
    expect(canonicalPathname("/%61uth/")).toBe("/auth");
    expect(canonicalPathname("//api//x/")).toBe("/api/x");
    expect(canonicalPathname("/no/%2561uth")).toBe("/no/auth");
    expect(canonicalPathname("/")).toBe("/");
    expect(canonicalPathname("/%E0%A4%A")).toBeNull();
  });
});

describe("isAuthPath", () => {
  it("matches an auth segment only", () => {
    expect(isAuthPath("/auth")).toBe(true);
    expect(isAuthPath("/no/auth/sign-up")).toBe(true);
    expect(isAuthPath("/no/author")).toBe(false);
  });
});

describe("isStorableResponse", () => {
  const res = (init: Partial<{ status: number; type: string; redirected: boolean; headers: Record<string, string> }> = {}) => ({
    status: init.status ?? 200,
    type: init.type ?? "basic",
    redirected: init.redirected ?? false,
    headers: new Headers(init.headers),
  });

  it("accepts a plain 200", () => expect(isStorableResponse(res())).toBe(true));
  it.each([
    ["404", res({ status: 404 })],
    ["500", res({ status: 500 })],
    ["206", res({ status: 206 })],
    ["307", res({ status: 307 })],
    ["opaque", res({ type: "opaque", status: 0 })],
    ["opaqueredirect", res({ type: "opaqueredirect", status: 0 })],
    ["cors", res({ type: "cors" })],
    ["redirected", res({ redirected: true })],
    ["content-range", res({ headers: { "Content-Range": "bytes 0-1/2" } })],
    ["vary *", res({ headers: { Vary: "Accept, *" } })],
  ])("rejects %s", (_label, response) => expect(isStorableResponse(response)).toBe(false));
});
