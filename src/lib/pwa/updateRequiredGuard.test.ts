import { describe, expect, it } from "vitest";
import { clientBuildFingerprint, isUpdateLoop, recordUpdateAttempt, updateAttempts } from "./updateRequiredGuard";

function memory() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
}

const scripts = (...src: string[]) => ({ scripts: src.map((value) => ({ src: value })) as unknown as HTMLCollectionOf<HTMLScriptElement> });

describe("updateRequiredGuard", () => {
  it("counts attempts per build", () => {
    const storage = memory();
    expect(isUpdateLoop("a", storage)).toBe(false);
    recordUpdateAttempt("a", storage);
    expect(updateAttempts("a", storage)).toBe(1);
    expect(isUpdateLoop("a", storage)).toBe(true);
    expect(isUpdateLoop("b", storage)).toBe(false);
  });

  it("survives broken or missing storage", () => {
    const broken = { getItem: () => "{nope", setItem: () => { throw new Error("blocked"); } };
    expect(updateAttempts("a", broken)).toBe(0);
    expect(() => recordUpdateAttempt("a", broken)).not.toThrow();
    expect(isUpdateLoop("a", null)).toBe(false);
  });

  it("fingerprints the build by its static scripts, in any order", () => {
    const one = clientBuildFingerprint(scripts("http://x/_next/static/chunks/a-1.js", "http://x/_next/static/chunks/b-1.js", "https://cdn.example/x.js"));
    const same = clientBuildFingerprint(scripts("http://x/_next/static/chunks/b-1.js", "http://x/_next/static/chunks/a-1.js"));
    const other = clientBuildFingerprint(scripts("http://x/_next/static/chunks/a-2.js", "http://x/_next/static/chunks/b-1.js"));
    expect(one).toBe(same);
    expect(one).not.toBe(other);
    expect(clientBuildFingerprint(scripts())).toBe("unknown");
    expect(clientBuildFingerprint(null)).toBe("unknown");
  });
});
