// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The session refresh itself is not under test (SEC-12 owns
// src/lib/supabase/middleware.ts); it passes the response through, and the
// spy records which requests reach it.
const { updateSupabaseSession } = vi.hoisted(() => ({
  updateSupabaseSession: vi.fn((_request: NextRequest, response: Response) => response),
}));
vi.mock("@/lib/supabase/middleware", () => ({ updateSupabaseSession }));

const { default: proxy } = await import("./proxy");
const { pwaLaunchRedirect } = await import("@/lib/pwa/launchRedirect");

const ORIGIN = "https://fairplayr.app";

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}${path}`, { headers: { "accept-language": "en", ...headers } });
}

function location(response: Response): string | null {
  const value = response.headers.get("location");
  return value === null ? null : value.replace(ORIGIN, "");
}

describe("proxy: an installed app's launch opens the app (WEB-01d)", () => {
  it.each([
    ["/?source=pwa", "/play?source=pwa"],
    ["/no?source=pwa", "/no/play?source=pwa"],
    ["/no/?source=pwa", "/no/play?source=pwa"],
    ["/en?source=pwa", "/en/play?source=pwa"],
    ["/?source=pwa&x=1", "/play?source=pwa&x=1"],
  ])("%s → %s (307, query kept)", (path, target) => {
    const response = proxy(request(path));
    expect(response.status).toBe(307);
    expect(location(response)).toBe(target);
  });

  it("stays on the host it was asked on (both production domains, no redirect between them)", () => {
    for (const host of ["https://fairplayr.app", "https://fair-playr.vercel.app"]) {
      const response = proxy(new NextRequest(`${host}/no?source=pwa`, { headers: { "accept-language": "nb" } }));
      expect(response.headers.get("location")).toBe(`${host}/no/play?source=pwa`);
    }
  });

  it("unprefixed /play then gets its locale like /team does", () => {
    const play = proxy(request("/play?source=pwa", { cookie: "NEXT_LOCALE=no" }));
    const team = proxy(request("/team", { cookie: "NEXT_LOCALE=no" }));
    expect(location(play)).toBe("/no/play?source=pwa");
    expect(location(team)).toBe("/no/team");
    expect(location(proxy(request("/play", { "accept-language": "nb,no;q=0.9" })))).toBe("/no/play");
    expect(location(proxy(request("/play")))).toBeNull();
  });

  it("the website at / is not redirected to the app without the marker", () => {
    expect(location(proxy(request("/")))).toBeNull();
    expect(location(proxy(request("/?source=web")))).toBeNull();
    expect(location(proxy(request("/", { cookie: "NEXT_LOCALE=no" })))).toBe("/no");
    expect(location(proxy(request("/no")))).toBeNull();
  });

  it.each(["/s/abc?source=pwa", "/team?source=pwa", "/no/team?source=pwa", "/play?source=pwa", "/nope?source=pwa", "/no/play?source=pwa"])(
    "%s is left to next-intl",
    (path) => {
      expect(pwaLaunchRedirect(request(path))).toBeNull();
    }
  );

  it("share links and auth pages are unchanged", () => {
    expect(location(proxy(request("/s/abc")))).toBeNull();
    expect(location(proxy(request("/no/s/abc")))).toBeNull();
    expect(location(proxy(request("/no/auth/sign-in?next=/team")))).toBeNull();
  });
});

describe("proxy: the Supabase session refresh skips the website (WEB-01 phase 0)", () => {
  beforeEach(() => updateSupabaseSession.mockClear());

  it.each(["/", "/no", "/no/", "/en", "/?source=pwa", "/no?source=pwa"])("%s: no refresh", (path) => {
    proxy(request(path));
    expect(updateSupabaseSession).not.toHaveBeenCalled();
  });

  it.each([
    "/play",
    "/no/play",
    "/team",
    "/no/team",
    "/match/live",
    "/no/match/setup",
    "/historikk",
    "/settings",
    "/offline",
    "/lineup",
    "/s/abc",
    "/no/s/abc",
    "/auth/sign-in",
    "/no/auth/sign-in",
    "/play?source=pwa",
    "/roadmapx",
    "/nox",
    "//",
    "/%2F",
    "/%6Eo",
  ])("%s: refreshed as before", (path) => {
    proxy(request(path));
    expect(updateSupabaseSession).toHaveBeenCalledTimes(1);
  });

  it("the website is still localised without the refresh", () => {
    expect(location(proxy(request("/", { "accept-language": "nb-NO" })))).toBe("/no");
    expect(proxy(request("/")).headers.get("x-middleware-rewrite")).toBe(`${ORIGIN}/en`);
    expect(updateSupabaseSession).not.toHaveBeenCalled();
  });
});
