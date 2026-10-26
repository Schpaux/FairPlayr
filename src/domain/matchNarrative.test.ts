import { describe, expect, it } from "vitest";
import { analyzeMatchNarrative, summaryLengthGuide } from "@/domain/matchNarrative";

describe("analyzeMatchNarrative", () => {
  it("tells a turned match: opening goal, equaliser, decisive goal", () => {
    const narrative = analyzeMatchNarrative(
      [
        { side: "opponent", minute: 5 },
        { side: "own", minute: 12 },
        { side: "own", minute: 20 },
        { side: "opponent", minute: 28 },
        { side: "own", minute: 37 },
      ],
      { own: 3, opponent: 2 }
    );

    expect(narrative.complete).toBe(true);
    expect(narrative.comeback).toBe(true);
    expect(narrative.equalisers).toBe(2);
    expect(narrative.goals.map((goal) => [goal.kind, `${goal.own}–${goal.opponent}`, goal.decisive])).toEqual([
      ["opening", "0–1", false],
      ["equaliser", "1–1", false],
      ["go_ahead", "2–1", false],
      ["equaliser", "2–2", false],
      ["go_ahead", "3–2", true],
    ]);
  });

  it("sorts by minute and keeps the recorded order within a minute", () => {
    const narrative = analyzeMatchNarrative(
      [
        { side: "own", minute: 30 },
        { side: "opponent", minute: 10 },
        { side: "own", minute: 10 },
      ],
      { own: 2, opponent: 1 }
    );
    expect(narrative.goals.map((goal) => [goal.inputIndex, goal.side])).toEqual([
      [1, "opponent"],
      [2, "own"],
      [0, "own"],
    ]);
  });

  it("an incomplete timeline gives no order, lead or comeback", () => {
    const missing = analyzeMatchNarrative([{ side: "own", minute: 3 }], { own: 2, opponent: 1 });
    expect(missing).toMatchObject({ complete: false, recordedOwn: 1, recordedOpponent: 0, goals: [], comeback: false });

    const noMinute = analyzeMatchNarrative(
      [
        { side: "own", minute: null },
        { side: "opponent", minute: 8 },
      ],
      { own: 1, opponent: 1 }
    );
    expect(noMinute.complete).toBe(false);
    expect(noMinute.goals).toEqual([]);
  });

  it("a goalless match is complete with nothing to tell", () => {
    expect(analyzeMatchNarrative([], { own: 0, opponent: 0 })).toEqual({
      complete: true,
      recordedOwn: 0,
      recordedOpponent: 0,
      goals: [],
      comeback: false,
      equalisers: 0,
    });
  });

  it("the first goal of a 2–0 is the decisive one", () => {
    const narrative = analyzeMatchNarrative(
      [
        { side: "own", minute: 4 },
        { side: "own", minute: 30 },
      ],
      { own: 2, opponent: 0 }
    );
    expect(narrative.goals.map((goal) => goal.decisive)).toEqual([true, false]);
    expect(narrative.goals[1].kind).toBe("extend");
  });
});

describe("summaryLengthGuide", () => {
  it("grows with the facts and aims at 150–250 words for a full match", () => {
    expect(summaryLengthGuide(0)).toEqual({ minWords: 20, maxWords: 50, minParagraphs: 1, maxParagraphs: 1 });
    expect(summaryLengthGuide(1)).toMatchObject({ minWords: 20, maxWords: 50 });
    expect(summaryLengthGuide(2)).toMatchObject({ minWords: 40, maxWords: 90 });
    expect(summaryLengthGuide(4)).toMatchObject({ minWords: 90, maxWords: 160 });
    expect(summaryLengthGuide(9)).toEqual({ minWords: 150, maxWords: 250, minParagraphs: 2, maxParagraphs: 4 });
  });
});
