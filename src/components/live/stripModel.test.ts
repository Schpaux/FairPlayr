import { describe, expect, it } from "vitest";
import { isInPlay, isLastPhase, resolveStripKind, type StripInput } from "@/components/live/stripModel";

const RUNNING: StripInput = {
  status: "running",
  phase: "first_half",
  halves: 2,
  inStoppage: false,
  hasPendingUndo: false,
  hasSelection: false,
  isDragging: false,
  hasSuggestion: false,
};

describe("resolveStripKind", () => {
  it("is idle during normal play with nothing to suggest", () => {
    expect(resolveStripKind(RUNNING)).toBe("idle");
  });

  it("follows the approved priority order", () => {
    const everything: StripInput = {
      ...RUNNING,
      inStoppage: true,
      hasPendingUndo: true,
      hasSelection: true,
      isDragging: true,
      hasSuggestion: true,
    };
    expect(resolveStripKind(everything)).toBe("undo");
    expect(resolveStripKind({ ...everything, hasPendingUndo: false })).toBe("dragging");
    expect(resolveStripKind({ ...everything, hasPendingUndo: false, isDragging: false })).toBe("selection");

    const quiet = { ...everything, hasPendingUndo: false, isDragging: false, hasSelection: false };
    expect(resolveStripKind(quiet)).toBe("timeUp");
    expect(resolveStripKind({ ...quiet, inStoppage: false })).toBe("suggestion");
  });

  it("offers kickoff before the match starts", () => {
    expect(resolveStripKind({ ...RUNNING, status: "not_started", hasSuggestion: true })).toBe("kickoff");
  });

  it("offers the second half at half-time, even with a suggestion", () => {
    expect(
      resolveStripKind({ ...RUNNING, status: "paused", phase: "half_time", hasSuggestion: true })
    ).toBe("halfTime");
  });

  it("shows full time once the match has ended", () => {
    expect(resolveStripKind({ ...RUNNING, status: "ended", phase: "full_time" })).toBe("fullTime");
  });

  it("leaves half-time once the second half has started", () => {
    expect(resolveStripKind({ ...RUNNING, phase: "second_half" })).toBe("idle");
    expect(resolveStripKind({ ...RUNNING, status: "paused", phase: "second_half" })).toBe("idle");
    expect(
      resolveStripKind({ ...RUNNING, phase: "second_half", inStoppage: true })
    ).toBe("timeUp");
  });

  it("keeps a selection visible at half-time so substitutions still work", () => {
    expect(
      resolveStripKind({ ...RUNNING, status: "paused", phase: "half_time", hasSelection: true })
    ).toBe("selection");
  });
});

describe("resolveStripKind — position swap (FP-MS2.1-B1)", () => {
  it("keeps today's output when the position-swap facts are left out", () => {
    expect(resolveStripKind({ ...RUNNING, hasSelection: true })).toBe("selection");
  });

  it("slots the position-swap states into the approved order", () => {
    const everything: StripInput = {
      ...RUNNING,
      inStoppage: true,
      hasSuggestion: true,
      hasPendingPositionUndo: true,
      isDraggingPosition: true,
      isChoosingSwapTarget: true,
    };
    expect(resolveStripKind(everything)).toBe("positionUndo");
    expect(resolveStripKind({ ...everything, hasPendingPositionUndo: false })).toBe("draggingPosition");
    expect(
      resolveStripKind({ ...everything, hasPendingPositionUndo: false, isDraggingPosition: false })
    ).toBe("positionSwap");
    // A substitution's undo still outranks everything.
    expect(resolveStripKind({ ...everything, hasPendingUndo: true, hasPendingPositionUndo: false })).toBe("undo");
  });

  it("works at half-time and before kickoff", () => {
    const halfTime: StripInput = { ...RUNNING, status: "paused", phase: "half_time" };
    expect(resolveStripKind({ ...halfTime, isChoosingSwapTarget: true })).toBe("positionSwap");
    expect(resolveStripKind({ ...RUNNING, status: "not_started", hasPendingPositionUndo: true })).toBe("positionUndo");
  });
});

describe("isInPlay", () => {
  it("is true while the clock runs or a half is paused", () => {
    expect(isInPlay({ status: "running", phase: "first_half" })).toBe(true);
    expect(isInPlay({ status: "paused", phase: "second_half" })).toBe(true);
    expect(isInPlay({ status: "running", phase: "second_half" })).toBe(true);
    expect(isInPlay({ status: "not_started", phase: "first_half" })).toBe(false);
    expect(isInPlay({ status: "paused", phase: "half_time" })).toBe(false);
    expect(isInPlay({ status: "ended", phase: "full_time" })).toBe(false);
  });

  // FP-MATCH-001 moves a restarted half-time clock into second_half, so the
  // view no longer treats a running clock in half_time as play.
  it("reads play from the phase, not from a running clock alone", () => {
    expect(isInPlay({ status: "running", phase: "half_time" })).toBe(false);
    expect(isInPlay({ status: "running", phase: "full_time" })).toBe(false);
  });
});

describe("isLastPhase", () => {
  it("is the second half, or the only period of a one-period match", () => {
    expect(isLastPhase({ halves: 2, phase: "first_half" })).toBe(false);
    expect(isLastPhase({ halves: 2, phase: "second_half" })).toBe(true);
    expect(isLastPhase({ halves: 1, phase: "first_half" })).toBe(true);
    expect(isLastPhase({ halves: 2, phase: "half_time" })).toBe(true);
  });
});
