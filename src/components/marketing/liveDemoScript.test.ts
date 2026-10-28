import { describe, expect, it } from "vitest";
import { DEMO_BEATS, DEMO_LOOP_SECONDS, demoFrame } from "./liveDemoScript";

// The website demo must never show something the app would not do
// (MARKETING.md §8–§9): the suggestion rule, the keeper rule, the strip order
// and total minutes as the number.

describe("liveDemoScript (WEB-01 phase 1)", () => {
  const times = Array.from({ length: DEMO_LOOP_SECONDS * 4 + 1 }, (_, i) => i / 4);

  it("opens on the app's suggestion: least-played on for most-played outfield", () => {
    const frame = demoFrame(0);
    expect(frame.model.strip).toBe("suggestion");
    expect(frame.model.suggestion).toMatchObject({ incomingName: "Selma", incomingMinutes: 4, outgoingName: "Maja", outgoingMinutes: 16 });
    expect(frame.model.clock).toBe("16:48");
  });

  it("selects, substitutes with a 5 s undo, then settles on the next suggestion", () => {
    expect(demoFrame(DEMO_BEATS.select + 0.1).model.strip).toBe("selection");
    const undo = demoFrame(DEMO_BEATS.substitute + 0.1);
    expect(undo.model.strip).toBe("undo");
    expect(undo.undo?.secondsRemaining).toBe(5);
    expect(undo.model.tokens.find((token) => token.slotId === "7v7-7")?.name).toBe("Selma");
    // The bench is held: Maja takes Selma's slot.
    expect(undo.model.bench.map((tile) => tile.name)).toEqual(["Maja", "Emma", "Vilde"]);
    expect(DEMO_BEATS.undoEnds - DEMO_BEATS.substitute).toBe(5);

    const settled = demoFrame(DEMO_LOOP_SECONDS - 1);
    expect(settled.model.strip).toBe("suggestion");
    expect(settled.model.suggestion).toMatchObject({ incomingName: "Emma", outgoingName: "Sara" });
    expect(settled.model.interactionActive).toBe(false);
  });

  it("never suggests the keeper, and only from a 4-minute gap", () => {
    for (const t of times) {
      const { model } = demoFrame(t);
      if (!model.suggestion) continue;
      expect(model.suggestion.outgoingName).not.toBe("Ella");
      expect(model.suggestion.outgoingMinutes - model.suggestion.incomingMinutes).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps the minutes consistent: seven on the field, time only grows, the ledger agrees with the screen", () => {
    let previous = new Map<string, number>();
    for (const t of times) {
      const frame = demoFrame(t);
      expect(frame.model.tokens).toHaveLength(7);
      const shown = new Map([...frame.model.tokens, ...frame.model.bench].map((p) => [p.name, p.minutes]));
      for (const row of frame.ledger) {
        expect(shown.get(row.name)).toBe(row.minutes);
        expect(row.minutes).toBeGreaterThanOrEqual(previous.get(row.name) ?? 0);
      }
      previous = new Map(frame.ledger.map((row) => [row.name, row.minutes]));
    }
  });
});
