import { describe, it, expect } from "vitest";
import { generateMatchName, formatMatchDate, isAutoMatchName } from "@/lib/utils/matchName";

describe("formatMatchDate", () => {
  it("formats date correctly", () => {
    const d = new Date(2024, 3, 12, 11, 0); // 12 Apr 2024 11:00
    expect(formatMatchDate(d)).toBe("12. apr 11:00");
  });

  it("pads minutes with zero", () => {
    const d = new Date(2024, 3, 12, 9, 5);
    expect(formatMatchDate(d)).toBe("12. apr 09:05");
  });

  it("handles december (index 11)", () => {
    const d = new Date(2024, 11, 31, 23, 59);
    expect(formatMatchDate(d)).toBe("31. des 23:59");
  });
});

describe("generateMatchName", () => {
  it("includes opponent when provided", () => {
    const d = new Date(2024, 3, 12, 11, 0);
    expect(generateMatchName("Lånke", d)).toBe("Lånke – 12. apr 11:00");
  });

  it("uses generic prefix when opponent is null", () => {
    const d = new Date(2024, 3, 12, 11, 0);
    expect(generateMatchName(null, d)).toBe("Kamp – 12. apr 11:00");
  });

  it("uses generic prefix when opponent is empty string", () => {
    const d = new Date(2024, 3, 12, 11, 0);
    expect(generateMatchName("", d)).toBe("Kamp – 12. apr 11:00");
  });

  it("trims whitespace from opponent name", () => {
    const d = new Date(2024, 3, 12, 11, 0);
    expect(generateMatchName("  Blink  ", d)).toBe("Blink – 12. apr 11:00");
  });

  it("handles cup: two matches same day differ by time", () => {
    const d1 = new Date(2024, 3, 12, 11, 0);
    const d2 = new Date(2024, 3, 12, 13, 30);
    expect(generateMatchName("Lånke", d1)).toBe("Lånke – 12. apr 11:00");
    expect(generateMatchName("Lånke", d2)).toBe("Lånke – 12. apr 13:30");
    expect(generateMatchName("Lånke", d1)).not.toBe(generateMatchName("Lånke", d2));
  });
});

describe("isAutoMatchName", () => {
  it("detects auto-generated names", () => {
    expect(isAutoMatchName("Lånke – 12. apr 11:00")).toBe(true);
    expect(isAutoMatchName("Kamp – 12. apr 11:00")).toBe(true);
  });

  it("returns false for manually typed names", () => {
    expect(isAutoMatchName("Hjemmekamp mot Blink")).toBe(false);
    expect(isAutoMatchName("")).toBe(false);
  });
});
