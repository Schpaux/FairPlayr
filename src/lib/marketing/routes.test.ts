import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import { MARKETING_SEGMENT, shellPrecacheEntries } from "@/sw/shellRoutes";
import { WEBSITE_SEGMENTS, isWebsitePath } from "./routes";

const APP = path.resolve(__dirname, "../../app");

/** First path segments a route group or top-level route already uses. */
function reservedSegments(): string[] {
  const dirs = (dir: string) =>
    readdirSync(path.join(APP, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  return [...dirs("[locale]/(app)"), ...dirs("[locale]/(public)"), ...dirs(".").filter((name) => name !== "[locale]")];
}

describe("website routes (WEB-01 phase 0)", () => {
  it("mirror the app's locales", () => {
    expect(routing.locales).toEqual(["en", "no"]);
    expect(routing.defaultLocale).toBe("en");
    expect(routing.localePrefix).toBe("as-needed");
  });

  it("includes the roadmap without expanding the worker precache", () => {
    expect(WEBSITE_SEGMENTS).toEqual(["", "/roadmap"]);
    expect(MARKETING_SEGMENT).toBe("");
    expect(shellPrecacheEntries().filter((entry) => entry.kind === "marketing").map((entry) => entry.url)).toEqual(["/", "/no"]);
  });

  it.each(["/", "/no", "/no/", "/en", "/en/", "/roadmap", "/no/roadmap", "/no/roadmap/", "/en/roadmap"])("%s is the website", (pathname) => {
    expect(isWebsitePath(pathname)).toBe(true);
  });

  it.each([
    "/play",
    "/no/play",
    "/team",
    "/match/live",
    "/s/abc",
    "/auth/sign-in",
    "/no/auth/sign-in",
    "/roadmapx",
    "/nox",
    "/no/x",
    "//",
    "//no",
    "/no//",
    "/%2F",
    "/%6Eo",
    "/NO",
    "",
  ])("%s is not the website", (pathname) => {
    expect(isWebsitePath(pathname)).toBe(false);
  });

  it("no app segment is the website, with or without a locale prefix", () => {
    for (const segment of reservedSegments()) {
      for (const prefix of ["", "/en", "/no"]) expect(isWebsitePath(`${prefix}/${segment}`), `${prefix}/${segment}`).toBe(false);
    }
  });

  it("no website page collides with an app route, an API route or the worker", () => {
    const reserved = reservedSegments();
    expect(reserved).toEqual(expect.arrayContaining(["play", "team", "match", "auth", "offline", "s", "api", "serwist"]));
    const taken = (WEBSITE_SEGMENTS as readonly string[]).filter((segment) => segment !== "" && reserved.includes(segment.split("/")[1]));
    expect(taken).toEqual([]);
  });
});
