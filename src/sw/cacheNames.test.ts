import { describe, expect, it } from "vitest";
import {
  META_CACHE,
  cacheBuildId,
  cachesToDeleteOnActivate,
  cachesToDeleteOnKill,
  precacheName,
  sanitizeBuildId,
} from "./cacheNames";

describe("cache names", () => {
  it("carry the build id", () => {
    expect(precacheName("AbC_1-2")).toBe("fp-precache-AbC_1-2");
    expect(cacheBuildId("fp-precache-xyz")).toBe("xyz");
    expect(cacheBuildId(META_CACHE)).toBeNull();
    expect(sanitizeBuildId("a/b c")).toBe("abc");
    expect(sanitizeBuildId("///")).toBe("unknown");
  });

  it("activate deletes only our caches from other builds", () => {
    const names = ["fp-precache-old", "fp-precache-new", "fp-meta", "serwist-precache-v2", "other-app", "fp-precache-older"];
    expect(cachesToDeleteOnActivate(names, "new")).toEqual(["fp-precache-old", "fp-precache-older"]);
    // A build still served (pinned during a match) is kept.
    expect(cachesToDeleteOnActivate(names, "new", "old")).toEqual(["fp-precache-older"]);
  });

  it("the kill switch deletes every fp- cache and nothing else", () => {
    expect(cachesToDeleteOnKill(["fp-precache-a", "fp-meta", "other", "serwist-x"])).toEqual(["fp-precache-a", "fp-meta"]);
  });
});
