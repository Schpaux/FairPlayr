import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import {
  SHELL_DEFAULT_LOCALE,
  SHELL_LOCALES,
  defaultLocaleAlias,
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
      "/match/setup",
      "/match/live",
      "/team",
      "/offline",
      "/no",
      "/no/match/setup",
      "/no/match/live",
      "/no/team",
      "/no/offline",
    ]);
  });

  it("match shells cache-first, but never / (the server localises it)", () => {
    expect(matchShell("/")).toBeNull();
    expect(matchShell("/no/")).toMatchObject({ url: "/no", locale: "no", kind: "home" });
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

  it("map /en paths to their unprefixed form", () => {
    expect(defaultLocaleAlias("/en")).toBe("/");
    expect(defaultLocaleAlias("/en/match/live")).toBe("/match/live");
    expect(defaultLocaleAlias("/no/match/live")).toBeNull();
    expect(defaultLocaleAlias("/english")).toBeNull();
  });
});
