// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The session refresh is not under test; it passes the response through.
vi.mock("@/lib/supabase/middleware", () => ({
  updateSupabaseSession: (_request: NextRequest, response: Response) => response,
}));

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
