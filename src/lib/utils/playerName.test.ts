import { describe, it, expect } from "vitest";
import { shortName, buildShortNameMap, buildDisplayNameMap } from "@/lib/utils/playerName";

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

describe("buildDisplayNameMap (DESIGN.md §5.2 ladder, FEAT-NAME-01)", () => {
  const names = (players: Array<{ id: string; name: string; number?: number | null }>) =>
    Object.fromEntries(buildDisplayNameMap(players));

  it("uses the first name alone when it is unique in the squad", () => {
    expect(names([
      { id: "a", name: "Emma Haugen" },
      { id: "b", name: "Frida Berg" },
      { id: "c", name: "Sindre" },
    ])).toEqual({ a: "Emma", b: "Frida", c: "Sindre" });
  });

  it("adds the surname initial when it tells the clash apart", () => {
    expect(names([
      { id: "a", name: "Emma Haugen" },
      { id: "b", name: "Emma Berg" },
    ])).toEqual({ a: "Emma H", b: "Emma B" });
  });

  it("uses the shortest unique surname prefix, never a number suffix", () => {
    expect(names([
      { id: "a", name: "Emma Haugen" },
      { id: "b", name: "Emma Hansen" },
    ])).toEqual({ a: "Emma Hau", b: "Emma Han" });

    expect(names([
      { id: "a", name: "Ida Ruud" },
      { id: "b", name: "Ida Rønning" },
    ])).toEqual({ a: "Ida Ru", b: "Ida Rø" });
  });

  it("gives each player the shortest form that separates them", () => {
    expect(names([
      { id: "a", name: "Emma Haugen" },
      { id: "b", name: "Emma Hansen" },
      { id: "c", name: "Emma Berg" },
      { id: "d", name: "Thea Solberg" },
    ])).toEqual({ a: "Emma Hau", b: "Emma Han", c: "Emma B", d: "Thea" });
  });

  it("uses the whole surname when it is a prefix of another", () => {
    expect(names([
      { id: "a", name: "Ola Ha" },
      { id: "b", name: "Ola Hansen" },
    ])).toEqual({ a: "Ola Ha", b: "Ola Han" });
  });

  it("compares case-insensitively and keeps the original spelling", () => {
    expect(names([
      { id: "a", name: "emma haugen" },
      { id: "b", name: "Emma Hansen" },
    ])).toEqual({ a: "emma hau", b: "Emma Han" });
  });

  it("keeps a one-word name and separates the other by initial", () => {
    expect(names([
      { id: "a", name: "Emma" },
      { id: "b", name: "Emma Hansen" },
    ])).toEqual({ a: "Emma", b: "Emma H" });
  });

  it("uses the shortest unique prefix of the rest when only middle names differ", () => {
    expect(names([
      { id: "a", name: "Ida Marie Ruud" },
      { id: "b", name: "Ida Sofie Ruud" },
    ])).toEqual({ a: "Ida M", b: "Ida S" });

    expect(names([
      { id: "a", name: "Ida Marie Ruud" },
      { id: "b", name: "Ida Maren Ruud" },
      { id: "c", name: "Ida Ruud" },
    ])).toEqual({ a: "Ida Mari", b: "Ida Mare", c: "Ida R" });
  });

  it("separates identical full names by shirt number", () => {
    expect(names([
      { id: "a", name: "Emma Hansen", number: 7 },
      { id: "b", name: "Emma Hansen", number: 12 },
    ])).toEqual({ a: "Emma #7", b: "Emma #12" });
  });

  it("uses first name + number for identical names, even next to another clash", () => {
    expect(names([
      { id: "a", name: "Emma Hansen", number: 7 },
      { id: "b", name: "Emma Hansen", number: 12 },
      { id: "c", name: "Emma Haugen", number: 4 },
    ])).toEqual({ a: "Emma #7", b: "Emma #12", c: "Emma Hau" });
  });

  it("falls back to a counter for identical names without a distinguishing number", () => {
    expect(names([
      { id: "a", name: "Emma Hansen" },
      { id: "b", name: "Emma Hansen" },
    ])).toEqual({ a: "Emma", b: "Emma (2)" });

    expect(names([
      { id: "a", name: "Emma Hansen", number: 7 },
      { id: "b", name: "Emma Hansen", number: 7 },
      { id: "c", name: "Emma Hansen", number: 9 },
    ])).toEqual({ a: "Emma", b: "Emma (2)", c: "Emma #9" });

    expect(names([
      { id: "a", name: "Emma Hansen", number: null },
      { id: "b", name: "Emma Hansen", number: 3 },
    ])).toEqual({ a: "Emma", b: "Emma #3" });
  });

  it("treats extra whitespace as one space", () => {
    expect(names([
      { id: "a", name: "  Emma   Haugen " },
      { id: "b", name: "Emma Hansen" },
    ])).toEqual({ a: "Emma Hau", b: "Emma Han" });
  });

  it("maps every id, keeps an empty name as is, and never repeats a label", () => {
    const players = [
      { id: "a", name: "" },
      { id: "b", name: "Emma H" },
      { id: "c", name: "Emma Hx" },
      { id: "d", name: "Emma" },
      { id: "e", name: "Emma" },
    ];
    const map = buildDisplayNameMap(players);

    expect([...map.keys()]).toEqual(["a", "b", "c", "d", "e"]);
    expect(map.get("a")).toBe("");
    expect(new Set(map.values()).size).toBe(players.length);
  });

  it("matches names typed in decomposed Unicode", () => {
    expect(names([
      { id: "a", name: "Åse Ålien" },
      { id: "b", name: "A\u030Ase Bø" },
    ])).toEqual({ a: "Åse Å", b: "Åse B" });
  });

  it("gives identical empty names no stray number", () => {
    expect(names([
      { id: "a", name: "", number: 7 },
      { id: "b", name: "  ", number: 8 },
    ])).toEqual({ a: "", b: "  " });
  });

  it("returns an empty map for an empty squad", () => {
    expect(buildDisplayNameMap([]).size).toBe(0);
  });
});
