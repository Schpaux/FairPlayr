import { describe, expect, it } from "vitest";
import { formatRoadmapDate, getWebsiteRoadmap, websiteRoadmap } from "./roadmap";

const copy = { title: "Public title", summary: "Public description" };
function item(id: string, overrides = {}) {
  return { id, type: "feature", status: "not_started", decision: "committed", public: { visible: true, en: copy, no: { title: "Offentlig tittel", summary: "Offentlig beskrivelse" } }, ...overrides };
}
const view = (items: ReturnType<typeof item>[], locale: "en" | "no" = "en") => websiteRoadmap({ updated: "2026-10-29", items }, locale);

describe("the marketing roadmap (WEB-01e)", () => {
  it("only publishes explicitly visible agreed features, never bugs, chores or ideas", () => {
    const result = view([
      item("public"), item("hidden", { public: { visible: false } }), item("internal", { public: undefined }),
      item("bug", { type: "bug" }), item("chore", { type: "chore" }), item("idea", { decision: "considering" }),
      item("rejected", { decision: "rejected" }),
    ]);
    expect(result.planned.map((item) => item.id)).toEqual(["public"]);
  });

  it("uses only public locale copy and never projects technical source fields", () => {
    const result = view([item("feature", { title: "INTERNAL", summary: "SECRET", sources: [{ ref: "private" }], priority: "P0", uncertainty: "INTERNAL" })], "no");
    expect(result.planned[0]).toMatchObject({ title: "Offentlig tittel", summary: "Offentlig beskrivelse" });
    expect(JSON.stringify(result)).not.toMatch(/INTERNAL|SECRET|private|priority|sources|uncertainty/);
  });

  it("does not present build completion or an initiative start as a release", () => {
    const result = view([
      item("built", { decision: "completed", status: "implemented", dates: { implemented: "2026-04-10" } }),
      item("review", { status: "in_review" }), item("working", { status: "in_progress" }),
      item("released", { type: "initiative", decision: "completed", status: "released", dates: { started: "2026-04-10", released: "2026-10-25" } }),
    ]);
    expect(result.developing.map((item) => item.id)).toEqual(expect.arrayContaining(["built", "review", "working"]));
    expect(result.developing.every((item) => item.date === null)).toBe(true);
    expect(result.released).toHaveLength(1);
    expect(result.released[0]).toMatchObject({ date: "2026-10-25", dateKind: "released" });
  });

  it("distinguishes release bounds from exact dates and supports missing dates", () => {
    const result = view([
      item("bounded", { decision: "completed", status: "released", dates: { implemented: "2026-04-10", released_no_later_than: "2026-10-19" } }),
      item("unknown", { decision: "completed", status: "released" }),
    ]);
    expect(result.released[0]).toMatchObject({ id: "bounded", date: "2026-10-19", dateKind: "available_by" });
    expect(result.released[1]).toMatchObject({ id: "unknown", date: null, dateKind: null });
  });

  it("features the latest major milestone without inventing a featured list", () => {
    const result = view([
      item("minor", { status: "released", decision: "completed", dates: { released: "2026-10-27" } }),
      item("major", { status: "released", decision: "completed", dates: { released: "2026-10-26" }, public: { visible: true, milestone: true, en: copy, no: copy } }),
    ]);
    expect(result.released.map((item) => item.id)).toEqual(["minor", "major"]);
    expect(result.latest?.id).toBe("major");
  });

  it("preserves date precision and formats Norwegian and English on the server", () => {
    expect(formatRoadmapDate("2026", "no")).toBe("2026");
    expect(formatRoadmapDate("2026-05", "en")).toBe("May 2026");
    expect(formatRoadmapDate("2026-10-25", "no")).toBe("25. oktober 2026");
    expect(formatRoadmapDate("2026-10-25", "en", true)).toBe("October 2026");
  });

  it("reads the repository's single public source in both languages", () => {
    for (const locale of ["no", "en"] as const) {
      const result = getWebsiteRoadmap(locale);
      expect(result.released.length).toBeGreaterThan(0);
      expect(result.planned.length).toBeGreaterThan(0);
      expect(result.released.every((item) => item.state === "released")).toBe(true);
    }
  });
});
