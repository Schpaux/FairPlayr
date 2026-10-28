import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import {
  SHELL_DEFAULT_LOCALE,
  SHELL_LOCALES,
  defaultLocaleAlias,
  launchLocaleOf,
  launchTarget,
  legacyHomeFor,
  localeOfPath,
  matchShell,
  normalizePathname,
  offlinePathFor,
  rootFallback,
  shellPrecacheEntries,
} from "./shellRoutes";

describe("shell routes", () => {
  it("mirror the app's locales and default locale", () => {
    expect([...SHELL_LOCALES].sort()).toEqual([...routing.locales].sort());
    expect(SHELL_DEFAULT_LOCALE).toBe(routing.defaultLocale);
    expect(routing.localePrefix).toBe("as-needed");
  });

  it("precache explicit locale paths, including the offline pages", () => {
    expect(shellPrecacheEntries().map((entry) => entry.url)).toEqual([
      "/",
      "/play",
      "/match/setup",
      "/match/live",
      "/team",
      "/offline",
      "/no",
      "/no/play",
      "/no/match/setup",
      "/no/match/live",
      "/no/team",
      "/no/offline",
    ]);
  });

  it("precache the website's front page and the app's Home at /play (WEB-01d)", () => {
    const kinds = Object.fromEntries(shellPrecacheEntries().map((entry) => [entry.url, entry.kind]));
    expect(kinds).toMatchObject({ "/": "marketing", "/no": "marketing", "/play": "home", "/no/play": "home" });
  });

  it("match shells cache-first, but never / (the server localises it)", () => {
    expect(matchShell("/")).toBeNull();
    expect(matchShell("/no/")).toMatchObject({ url: "/no", locale: "no", kind: "marketing" });
    expect(matchShell("/play")).toMatchObject({ url: "/play", locale: "en", kind: "home" });
    expect(matchShell("/no/play/")).toMatchObject({ url: "/no/play", locale: "no", kind: "home" });
    expect(matchShell("/en/play")).toBeNull();
    expect(matchShell("/match/live")).toMatchObject({ locale: "en", kind: "shell" });
    expect(matchShell("/no/historikk")).toBeNull();
    expect(matchShell("/en/match/live")).toBeNull();
  });

  it("normalise paths", () => {
    expect(normalizePathname("/no//match/live/")).toBe("/no/match/live");
    expect(normalizePathname("/")).toBe("/");
  });

  it("find the locale and offline page of a path", () => {
    expect(localeOfPath("/no/historikk")).toBe("no");
    expect(localeOfPath("/now")).toBe("en");
    expect(localeOfPath("/historikk")).toBe("en");
    expect(offlinePathFor("no")).toBe("/no/offline");
    expect(offlinePathFor("en")).toBe("/offline");
  });

  it("send / offline to the last used locale", () => {
    expect(rootFallback("no")).toEqual({ type: "redirect", url: "/no" });
    expect(rootFallback("en")).toEqual({ type: "shell", url: "/" });
    expect(rootFallback(null)).toEqual({ type: "shell", url: "/" });
  });

  it("find an installed app's launch path and where it opens", () => {
    expect(launchLocaleOf("/")).toBeNull();
    expect(launchLocaleOf("/no")).toBe("no");
    expect(launchLocaleOf("/no/")).toBe("no");
    expect(launchLocaleOf("/en")).toBe("en");
    expect(launchLocaleOf("/play")).toBeUndefined();
    expect(launchLocaleOf("/no/team")).toBeUndefined();
    expect(launchLocaleOf("/now")).toBeUndefined();
    expect(launchTarget("en")).toBe("/play");
    expect(launchTarget("no")).toBe("/no/play");
  });

  it("map the app's Home to a build from before /play", () => {
    expect(legacyHomeFor("/play")).toBe("/");
    expect(legacyHomeFor("/no/play")).toBe("/no");
    expect(legacyHomeFor("/no/play/")).toBe("/no");
    expect(legacyHomeFor("/team")).toBeNull();
    expect(legacyHomeFor("/en/play")).toBeNull();
  });

  it("map /en paths to their unprefixed form", () => {
    expect(defaultLocaleAlias("/en")).toBe("/");
    expect(defaultLocaleAlias("/en/match/live")).toBe("/match/live");
    expect(defaultLocaleAlias("/no/match/live")).toBeNull();
    expect(defaultLocaleAlias("/english")).toBeNull();
  });
});
