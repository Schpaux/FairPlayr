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
