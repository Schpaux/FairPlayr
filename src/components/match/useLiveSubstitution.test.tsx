import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveMatchFromSetup } from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import type { SubstitutionRecord } from "@/domain/substitutionUndo";
import { useLiveSubstitution, type BenchPointerDownOptions } from "@/components/match/useLiveSubstitution";

// FP-MS2.1-B2: direction lock on the bench rail. A sideways swipe scrolls and
// never drags, substitutes or drops the pitch selection; an upward drag still
// substitutes; without the option (mouse, a bench that fits) nothing changes.

const setup: MatchSetup = {
  id: "setup-1",
  teamId: "team-1",
  format: "5v5",
  reportEnabled: false,
  formationId: "5v5-2-2",
  duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
  selectedPlayerIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7"],
  startingPlayerIds: ["p1", "p2", "p3", "p4", "p5"],
  slotAssignments: { "5v5-1": "p1", "5v5-2": "p2", "5v5-3": "p3", "5v5-4": "p4", "5v5-5": "p5" },
  createdAt: "2026-04-15T10:00:00.000Z",
  updatedAt: "2026-04-15T10:00:00.000Z",
};

const record = (out: string, incoming: string): SubstitutionRecord =>
  ({ outPlayerId: out, inPlayerId: incoming }) as unknown as SubstitutionRecord;

function renderSubstitution() {
  const onSwap = vi.fn((out: string, incoming: string) => record(out, incoming));
  const onUndo = vi.fn();
  const view = renderHook(() =>
    useLiveSubstitution({ liveMatch: createLiveMatchFromSetup(setup), onSwap, onUndo })
  );
  return { ...view, onSwap, onUndo };
}

const tile = document.createElement("button");
const slot = document.createElement("div");
slot.dataset.slotId = "5v5-2";

type PointerKind = "touch" | "pen" | "mouse";

function pointer(x: number, y: number, pointerType: PointerKind = "touch") {
  return {
    pointerId: 7,
    pointerType,
    isPrimary: true,
    clientX: x,
    clientY: y,
    currentTarget: tile,
  } as unknown as React.PointerEvent;
}

type Hook = ReturnType<typeof renderSubstitution>["result"];

/** Pointer down on bench player p6 at (100, 600), moves, then release. */
function gesture(
  result: Hook,
  moves: Array<[number, number]>,
  options?: BenchPointerDownOptions,
  pointerType: PointerKind = "touch",
  end: "up" | "cancel" = "up"
) {
  act(() => result.current.getBenchPointerDownHandler("p6", options)(pointer(100, 600, pointerType)));
  for (const [x, y] of moves) {
    act(() => result.current.pointerSurfaceHandlers.onPointerMove(pointer(x, y, pointerType)));
  }
  const [x, y] = moves[moves.length - 1] ?? [100, 600];
  act(() => {
    if (end === "up") result.current.pointerSurfaceHandlers.onPointerUp(pointer(x, y, pointerType));
    else result.current.pointerSurfaceHandlers.onPointerCancel();
  });
}

const sideways: Array<[number, number]> = [
  [104, 601],
  [108, 601],
  [130, 602],
  [180, 603],
];
const upwards: Array<[number, number]> = [
  [101, 596],
  [102, 590],
  [110, 400],
  [120, 200],
];

beforeEach(() => {
  Object.assign(tile, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
  document.elementFromPoint = vi.fn(() => slot);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLiveSubstitution bench direction lock", () => {
  it("a sideways touch swipe on the rail never drags, keeps the pitch selection and does not substitute", () => {
    const { result, onSwap } = renderSubstitution();
    act(() => result.current.tapFieldPlayer("p2"));

    const states: string[] = [];
    act(() => result.current.getBenchPointerDownHandler("p6", { directionLock: true })(pointer(100, 600)));
    for (const [x, y] of sideways) {
      act(() => result.current.pointerSurfaceHandlers.onPointerMove(pointer(x, y)));
      states.push(result.current.state.kind);
    }
    expect(states.every((kind) => kind === "fieldPlayerSelected")).toBe(true);
    expect(result.current.ghostChip).toBeNull();
    expect(tile.releasePointerCapture).toHaveBeenCalledWith(7);

    // The browser takes the gesture for scrolling and cancels the pointer.
    act(() => result.current.pointerSurfaceHandlers.onPointerCancel());
    expect(result.current.state).toEqual({ kind: "fieldPlayerSelected", fieldPlayerId: "p2" });
    expect(onSwap).not.toHaveBeenCalled();
  });

  it("the click a browser may fire after a locked swipe does not substitute", () => {
    const { result, onSwap } = renderSubstitution();
    act(() => result.current.tapFieldPlayer("p2"));
    gesture(result, sideways, { directionLock: true });

    act(() => result.current.tapBenchPlayer("p6"));
    expect(onSwap).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ kind: "fieldPlayerSelected", fieldPlayerId: "p2" });

    // The guard is spent: a real tap afterwards substitutes as usual.
    act(() => result.current.tapBenchPlayer("p6"));
    expect(onSwap).toHaveBeenCalledWith("p2", "p6");
  });

  it("an upward touch drag from the rail still substitutes, by player id", () => {
    const { result, onSwap } = renderSubstitution();
    act(() => result.current.getBenchPointerDownHandler("p6", { directionLock: true })(pointer(100, 600)));
    act(() => result.current.pointerSurfaceHandlers.onPointerMove(pointer(101, 596)));
    expect(result.current.state.kind).toBe("idle");
    act(() => result.current.pointerSurfaceHandlers.onPointerMove(pointer(102, 590)));
    expect(result.current.state).toEqual({ kind: "draggingBenchPlayer", benchPlayerId: "p6" });
    act(() => result.current.pointerSurfaceHandlers.onPointerMove(pointer(120, 200)));
    expect(result.current.ghostChip).toMatchObject({ benchPlayerId: "p6", x: 120, y: 200 });
    act(() => result.current.pointerSurfaceHandlers.onPointerUp(pointer(120, 200)));

    expect(onSwap).toHaveBeenCalledWith("p2", "p6");
    expect(result.current.state.kind).toBe("pendingUndo");
  });

  it("a short move under the lock distance stays a tap", () => {
    const { result, onSwap } = renderSubstitution();
    act(() => result.current.tapFieldPlayer("p3"));
    gesture(result, [[103, 602]], { directionLock: true });
    expect(result.current.state).toEqual({ kind: "fieldPlayerSelected", fieldPlayerId: "p3" });

    act(() => result.current.tapBenchPlayer("p6"));
    expect(onSwap).toHaveBeenCalledWith("p3", "p6");
  });

  it("a pen is locked like a finger", () => {
    const { result, onSwap } = renderSubstitution();
    act(() => result.current.tapFieldPlayer("p2"));
    gesture(result, sideways, { directionLock: true }, "pen");
    expect(result.current.state).toEqual({ kind: "fieldPlayerSelected", fieldPlayerId: "p2" });
    expect(onSwap).not.toHaveBeenCalled();
  });

  it("a mouse drag is never locked: sideways still drags, as on desktop today", () => {
    const { result, onSwap } = renderSubstitution();
    act(() => result.current.getBenchPointerDownHandler("p6", { directionLock: true })(pointer(100, 600, "mouse")));
    act(() => result.current.pointerSurfaceHandlers.onPointerMove(pointer(130, 602, "mouse")));
    expect(result.current.state).toEqual({ kind: "draggingBenchPlayer", benchPlayerId: "p6" });
    act(() => result.current.pointerSurfaceHandlers.onPointerUp(pointer(130, 300, "mouse")));
    expect(onSwap).toHaveBeenCalledWith("p2", "p6");
  });

  it("without the option nothing changes: a sideways move past 8px starts a drag", () => {
    const { result } = renderSubstitution();
    act(() => result.current.tapFieldPlayer("p2"));
    act(() => result.current.getBenchPointerDownHandler("p6")(pointer(100, 600)));
    act(() => result.current.pointerSurfaceHandlers.onPointerMove(pointer(110, 600)));
    expect(result.current.state).toEqual({ kind: "draggingBenchPlayer", benchPlayerId: "p6" });
    expect(tile.releasePointerCapture).not.toHaveBeenCalled();
  });

  it("an upward drag cancelled by the browser changes nothing", () => {
    const { result, onSwap } = renderSubstitution();
    gesture(result, upwards, { directionLock: true }, "touch", "cancel");
    expect(result.current.state.kind).toBe("idle");
    expect(result.current.ghostChip).toBeNull();
    expect(onSwap).not.toHaveBeenCalled();
  });

  it("an upward drag released off the pitch changes nothing", () => {
    document.elementFromPoint = vi.fn(() => null);
    const { result, onSwap } = renderSubstitution();
    gesture(result, upwards, { directionLock: true });
    expect(result.current.state.kind).toBe("idle");
    expect(onSwap).not.toHaveBeenCalled();
  });
});

// FP-MS2.1-B3 (D3): consecutive changes without waiting. A genuinely new
// interaction inside an undo window confirms the pending change and starts at
// once; only the most recent change is undoable, with its own 5 s window.
describe("useLiveSubstitution consecutive changes inside the undo window", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderWithSwaps() {
    const onSwap = vi.fn((out: string, incoming: string) => record(out, incoming));
    const onUndo = vi.fn();
    const onPositionSwap = vi.fn();
    const onPositionSwapUndo = vi.fn();
    const view = renderHook(() =>
      useLiveSubstitution({
        liveMatch: createLiveMatchFromSetup(setup),
        onSwap,
        onUndo,
        onPositionSwap,
        onPositionSwapUndo,
      })
    );
    return { ...view, onSwap, onUndo, onPositionSwap, onPositionSwapUndo };
  }

  type Result = ReturnType<typeof renderWithSwaps>["result"];

  function tapSub(result: Result, out: string, incoming: string) {
    act(() => result.current.tapFieldPlayer(out));
    act(() => result.current.tapBenchPlayer(incoming));
  }

  /** Touch drag of a bench player upwards onto slot 5v5-2 (p2), direction-locked like the rail. */
  function dragSub(result: Result, benchPlayerId: string) {
    act(() => result.current.getBenchPointerDownHandler(benchPlayerId, { directionLock: true })(pointer(100, 600)));
    for (const [x, y] of upwards) {
      act(() => result.current.pointerSurfaceHandlers.onPointerMove(pointer(x, y)));
    }
    act(() => result.current.pointerSurfaceHandlers.onPointerUp(pointer(120, 200)));
  }

  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  it("tap → immediate second tap substitution: the first tap selects, no wait or extra tap", () => {
    const { result, onSwap } = renderWithSwaps();
    tapSub(result, "p2", "p6");
    expect(result.current.state.kind).toBe("pendingUndo");
    advance(1000);

    // The very tap that starts the second substitution selects the player.
    act(() => result.current.tapFieldPlayer("p3"));
    expect(result.current.state).toEqual({ kind: "fieldPlayerSelected", fieldPlayerId: "p3" });
    expect(result.current.undoSecondsRemaining).toBeNull();

    act(() => result.current.tapBenchPlayer("p7"));
    expect(onSwap.mock.calls).toEqual([
      ["p2", "p6"],
      ["p3", "p7"],
    ]);
    expect(result.current.state).toMatchObject({ kind: "pendingUndo", substitution: { inPlayerId: "p7" } });
    expect(result.current.undoSecondsRemaining).toBe(5);
  });

  it("the second substitution gets its own full window; the first window's timer never closes it", () => {
    const { result } = renderWithSwaps();
    tapSub(result, "p2", "p6");
    advance(3000);
    tapSub(result, "p3", "p7");
    const opened = Date.now();
    expect(result.current.state).toMatchObject({ kind: "pendingUndo", expiresAtMs: opened + 5000 });

    advance(4900); // well past the first window's deadline
    expect(result.current.state.kind).toBe("pendingUndo");
    advance(200);
    expect(result.current.state.kind).toBe("idle");
    expect(result.current.undoSecondsRemaining).toBeNull();
  });

  it("undo reverses only the most recent substitution", () => {
    const { result, onUndo } = renderWithSwaps();
    tapSub(result, "p2", "p6");
    tapSub(result, "p3", "p7");
    act(() => result.current.triggerUndo());
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledWith(record("p3", "p7"));
    expect(result.current.state.kind).toBe("idle");

    // Nothing older can be undone afterwards.
    act(() => result.current.triggerUndo());
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("neither undone: both substitutions stay, no undo is called", () => {
    const { result, onSwap, onUndo } = renderWithSwaps();
    tapSub(result, "p2", "p6");
    tapSub(result, "p3", "p7");
    advance(5100);
    expect(onSwap).toHaveBeenCalledTimes(2);
    expect(onUndo).not.toHaveBeenCalled();
    expect(result.current.state.kind).toBe("idle");
  });

  it("the 5 s deadline is hard: undo after it, before a throttled timer fires, does nothing", () => {
    const { result, onUndo } = renderWithSwaps();
    tapSub(result, "p2", "p6");
    tapSub(result, "p3", "p7");
    vi.setSystemTime(Date.now() + 5001); // clock jumps, timers not run
    act(() => result.current.triggerUndo());
    expect(onUndo).not.toHaveBeenCalled();
    expect(result.current.state.kind).toBe("idle");
  });

  it("drag → immediate second drag substitution", () => {
    const { result, onSwap } = renderWithSwaps();
    dragSub(result, "p6");
    expect(result.current.state.kind).toBe("pendingUndo");
    advance(500);

    dragSub(result, "p7");
    expect(onSwap.mock.calls).toEqual([
      ["p2", "p6"],
      ["p2", "p7"],
    ]);
    expect(result.current.state).toMatchObject({ kind: "pendingUndo", substitution: { inPlayerId: "p7" } });
    expect(result.current.undoSecondsRemaining).toBe(5);
  });

  it("the drag itself, once past its threshold, confirms the pending substitution", () => {
    const { result } = renderWithSwaps();
    tapSub(result, "p2", "p6");
    act(() => result.current.getBenchPointerDownHandler("p7", { directionLock: true })(pointer(100, 600)));
    expect(result.current.state.kind).toBe("pendingUndo"); // a press alone confirms nothing
    act(() => result.current.pointerSurfaceHandlers.onPointerMove(pointer(101, 596)));
    expect(result.current.state.kind).toBe("pendingUndo");
    act(() => result.current.pointerSurfaceHandlers.onPointerMove(pointer(102, 590)));
    expect(result.current.state).toEqual({ kind: "draggingBenchPlayer", benchPlayerId: "p7" });
    expect(result.current.undoSecondsRemaining).toBeNull();
  });

  it("tap followed by drag, and drag followed by tap", () => {
    const { result, onSwap } = renderWithSwaps();
    tapSub(result, "p3", "p6");
    dragSub(result, "p7");
    tapSub(result, "p4", "p6");
    expect(onSwap.mock.calls).toEqual([
      ["p3", "p6"],
      ["p2", "p7"],
      ["p4", "p6"],
    ]);
    expect(result.current.state).toMatchObject({ kind: "pendingUndo", substitution: { outPlayerId: "p4" } });
  });

  it("a mouse drag's trailing click, wherever it lands, does not confirm its undo", () => {
    const { result, onUndo } = renderWithSwaps();
    act(() => result.current.getBenchPointerDownHandler("p6")(pointer(100, 600, "mouse")));
    act(() => result.current.pointerSurfaceHandlers.onPointerMove(pointer(110, 400, "mouse")));
    act(() => result.current.pointerSurfaceHandlers.onPointerUp(pointer(120, 200, "mouse")));
    expect(result.current.state.kind).toBe("pendingUndo");
    // Chromium sends it to the element released over, e.g. another pitch player.
    act(() => result.current.tapFieldPlayer("p3"));
    expect(result.current.state.kind).toBe("pendingUndo");
    // The guard is spent: the next tap is a real selection.
    act(() => result.current.tapFieldPlayer("p3"));
    expect(result.current.state).toEqual({ kind: "fieldPlayerSelected", fieldPlayerId: "p3" });
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("a mouse drag's trailing click on a bench tile neither substitutes nor confirms its undo", () => {
    const { result, onSwap, onUndo } = renderWithSwaps();
    act(() => result.current.getBenchPointerDownHandler("p6")(pointer(100, 600, "mouse")));
    act(() => result.current.pointerSurfaceHandlers.onPointerMove(pointer(110, 400, "mouse")));
    act(() => result.current.pointerSurfaceHandlers.onPointerUp(pointer(120, 200, "mouse")));
    expect(onSwap).toHaveBeenCalledTimes(1);
    // Released over (or captured by) another bench tile.
    act(() => result.current.tapBenchPlayer("p7"));
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(result.current.state.kind).toBe("pendingUndo");
    act(() => result.current.triggerUndo());
    expect(onUndo).toHaveBeenCalledWith(record("p2", "p6"));
  });

  it("the click a browser fires after a drag substitution does not confirm its undo", () => {
    const { result, onUndo } = renderWithSwaps();
    dragSub(result, "p6");
    // p6 is now a pitch token; the trailing click lands on it.
    act(() => result.current.tapFieldPlayer("p6"));
    expect(result.current.state.kind).toBe("pendingUndo");
    act(() => result.current.tapBenchPlayer("p6"));
    expect(result.current.state.kind).toBe("pendingUndo");
    act(() => result.current.triggerUndo());
    expect(onUndo).toHaveBeenCalledWith(record("p2", "p6"));
  });

  it("a horizontal bench swipe inside the window never confirms or ends the undo", () => {
    const { result, onUndo } = renderWithSwaps();
    tapSub(result, "p2", "p6");
    gesture(result, sideways, { directionLock: true }, "touch", "cancel");
    expect(result.current.state.kind).toBe("pendingUndo");
    expect(result.current.undoSecondsRemaining).toBe(5);
    // Nor does the click that may trail it, nor a short press.
    act(() => result.current.tapBenchPlayer("p6"));
    gesture(result, [[102, 601]], { directionLock: true });
    act(() => result.current.tapBenchPlayer("p7"));
    expect(result.current.state.kind).toBe("pendingUndo");

    act(() => result.current.triggerUndo());
    expect(onUndo).toHaveBeenCalledWith(record("p2", "p6"));
  });

  it("a pitch-background tap inside the window keeps it open", () => {
    const { result } = renderWithSwaps();
    tapSub(result, "p2", "p6");
    act(() => result.current.cancel());
    expect(result.current.state.kind).toBe("pendingUndo");
    expect(result.current.undoSecondsRemaining).toBe(5);
  });

  it("a cancelled drag still confirms the substitution it interrupted, and changes nothing else", () => {
    document.elementFromPoint = vi.fn(() => null);
    const { result, onSwap, onUndo } = renderWithSwaps();
    tapSub(result, "p2", "p6");
    dragSub(result, "p7"); // released off the pitch
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(result.current.state.kind).toBe("idle");
    act(() => result.current.triggerUndo());
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("a position swap tapped inside a substitution window confirms it and opens its own undo", () => {
    const { result, onPositionSwap, onPositionSwapUndo, onUndo } = renderWithSwaps();
    tapSub(result, "p2", "p6");
    act(() => result.current.tapFieldPlayer("p3"));
    act(() => result.current.startPositionSwap());
    act(() => result.current.tapFieldPlayer("p4"));
    expect(onPositionSwap).toHaveBeenCalledWith("5v5-3", "5v5-4");
    expect(result.current.state.kind).toBe("pendingPositionUndo");

    act(() => result.current.triggerUndo());
    expect(onPositionSwapUndo).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("a field drag inside a substitution window confirms it and swaps positions", () => {
    const { result, onPositionSwap } = renderWithSwaps();
    tapSub(result, "p2", "p6");
    act(() => result.current.getFieldPointerDownHandler("p3", "5v5-3")(pointer(200, 300)));
    expect(result.current.state.kind).toBe("pendingUndo");
    act(() => result.current.pointerSurfaceHandlers.onPointerMove(pointer(200, 320)));
    expect(result.current.state).toEqual({ kind: "draggingFieldPlayer", fieldPlayerId: "p3", slotId: "5v5-3" });
    act(() => result.current.pointerSurfaceHandlers.onPointerUp(pointer(200, 400)));
    expect(onPositionSwap).toHaveBeenCalledWith("5v5-3", "5v5-2");
    expect(result.current.state.kind).toBe("pendingPositionUndo");

    // Its trailing click on p3 does not confirm the swap's own undo.
    act(() => result.current.tapFieldPlayer("p3"));
    expect(result.current.state.kind).toBe("pendingPositionUndo");
  });

  it("a substitution right after a position swap confirms the swap", () => {
    const { result, onSwap, onPositionSwapUndo } = renderWithSwaps();
    act(() => result.current.tapFieldPlayer("p3"));
    act(() => result.current.startPositionSwap());
    act(() => result.current.tapFieldPlayer("p4"));
    tapSub(result, "p2", "p6");
    expect(onSwap).toHaveBeenCalledWith("p2", "p6");
    expect(result.current.state.kind).toBe("pendingUndo");
    act(() => result.current.triggerUndo());
    expect(onPositionSwapUndo).not.toHaveBeenCalled();
  });

  it("re-tapping the selected player inside a fresh selection still deselects", () => {
    const { result } = renderWithSwaps();
    tapSub(result, "p2", "p6");
    act(() => result.current.tapFieldPlayer("p3"));
    act(() => result.current.tapFieldPlayer("p3"));
    expect(result.current.state.kind).toBe("idle");
  });
});
