import { describe, it, expect } from "vitest";
import { shortName, buildShortNameMap } from "@/lib/utils/playerName";

describe("shortName", () => {
  it("returns single-word name unchanged", () => {
    expect(shortName("Sindre")).toBe("Sindre");
  });

  it("appends initials from two subsequent names (3 words total)", () => {
    expect(shortName("Iver Knut Fossum")).toBe("Iver KF");
    expect(shortName("Iver Boye Bakken")).toBe("Iver BB");
    expect(shortName("Isak Helge Wahl")).toBe("Isak HW");
  });

  it("appends single initial when only one surname (2 words total)", () => {
    expect(shortName("Lars Olsen")).toBe("Lars O");
  });

  it("caps at 2 initials for names with 4+ words", () => {
    expect(shortName("Lars Per Haugen Olsen")).toBe("Lars PH");
  });

  it("uppercases initials", () => {
    expect(shortName("iver knut fossum")).toBe("iver KF");
  });

  it("collapses extra whitespace", () => {
    expect(shortName("  Iver  Knut  Fossum  ")).toBe("Iver KF");
  });

  it("returns empty string unchanged", () => {
    expect(shortName("")).toBe("");
  });
});

describe("buildShortNameMap", () => {
  it("maps every player id to its short name", () => {
    const players = [
      { id: "a", name: "Iver Knut Fossum" },
      { id: "b", name: "Lars Olsen" },
    ];
    const map = buildShortNameMap(players);
    expect(map.get("a")).toBe("Iver KF");
    expect(map.get("b")).toBe("Lars O");
  });

  it("disambiguates duplicate short names", () => {
    const players = [
      { id: "x", name: "Lars Olsen" },
      { id: "y", name: "Lars Omdahl" },
      { id: "z", name: "Lars Ottesen" },
    ];
    const map = buildShortNameMap(players);
    expect(map.get("x")).toBe("Lars O");
    expect(map.get("y")).toBe("Lars O2");
    expect(map.get("z")).toBe("Lars O3");
  });

  it("does not append suffix when names are unique", () => {
    const players = [
      { id: "1", name: "Sindre" },
      { id: "2", name: "Iver KF" },
    ];
    const map = buildShortNameMap(players);
    expect(map.get("1")).toBe("Sindre");
    expect(map.get("2")).toBe("Iver K");
  });
});
