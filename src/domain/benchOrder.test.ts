import { describe, expect, it } from "vitest";
import {
  holdBenchOrder,
  INITIAL_BENCH_ORDER,
  nextBenchOrder,
  sortBenchPlayers,
  type BenchOrderEntry,
  type BenchOrderState,
} from "@/domain/benchOrder";

/** `count` bench players b1…bN in squad order, minutes from `minutesOf`. */
function bench(count: number, minutesOf: (index: number) => number = () => 0): BenchOrderEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `b${index + 1}`,
    minutes: minutesOf(index),
    squadIndex: index,
  }));
}

describe("sortBenchPlayers", () => {
  for (const count of [0, 1, 5, 8, 9, 11, 15]) {
    it(`sorts ${count} substitutes least-played first, ties in squad order`, () => {
      // Minutes cycle 12, 0, 8, 4, 0, … so every size has ties and gaps.
      const cycle = [12, 0, 8, 4, 0];
      const entries = bench(count, (index) => cycle[index % cycle.length]);
      const order = sortBenchPlayers(entries);

      expect(order).toHaveLength(count);
      expect(new Set(order)).toEqual(new Set(entries.map((entry) => entry.playerId)));
      const byId = new Map(entries.map((entry) => [entry.playerId, entry]));
      for (let index = 1; index < order.length; index += 1) {
        const prev = byId.get(order[index - 1])!;
        const next = byId.get(order[index])!;
        expect(prev.minutes <= next.minutes).toBe(true);
        if (prev.minutes === next.minutes) expect(prev.squadIndex).toBeLessThan(next.squadIndex);
      }
    });
  }

  it("keeps squad order at kick-off, when everyone is on 0′", () => {
    const entries = bench(15);
    expect(sortBenchPlayers(entries)).toEqual(entries.map((entry) => entry.playerId));
  });

  it("uses squad order, not the order of the input, for ties", () => {
    const entries: BenchOrderEntry[] = [
      { playerId: "c", minutes: 4, squadIndex: 2 },
      { playerId: "a", minutes: 4, squadIndex: 0 },
      { playerId: "b", minutes: 4, squadIndex: 1 },
    ];
    expect(sortBenchPlayers(entries)).toEqual(["a", "b", "c"]);
  });

  it("sorts on displayed whole minutes, so hidden seconds never reorder two equal tiles", () => {
    // 8:59 and 8:01 both show 8′: squad order decides, not the seconds.
    const secondsToMinutes = (seconds: number) => Math.floor(seconds / 60);
    const entries: BenchOrderEntry[] = [
      { playerId: "late", minutes: secondsToMinutes(539), squadIndex: 0 },
      { playerId: "early", minutes: secondsToMinutes(481), squadIndex: 1 },
      { playerId: "least", minutes: secondsToMinutes(479), squadIndex: 2 },
    ];
    expect(sortBenchPlayers(entries)).toEqual(["least", "late", "early"]);
  });

  it("puts players without a squad position after known ones, deterministically", () => {
    const entries: BenchOrderEntry[] = [
      { playerId: "x", minutes: 0, squadIndex: Number.NaN },
      { playerId: "a", minutes: 0, squadIndex: 3 },
      { playerId: "y", minutes: 0, squadIndex: Number.POSITIVE_INFINITY },
    ];
    expect(sortBenchPlayers(entries)).toEqual(["a", "x", "y"]);
  });

  it("does not mutate its input", () => {
    const entries = bench(5, (index) => 10 - index);
    const copy = structuredClone(entries);
    sortBenchPlayers(entries);
    expect(entries).toEqual(copy);
  });

  it("re-sorts a player who came off the pitch by their total minutes", () => {
    // Maja comes off with 16′ and joins a bench on 0′, 4′ and 8′.
    const entries: BenchOrderEntry[] = [
      { playerId: "maja", minutes: 16, squadIndex: 1 },
      { playerId: "ida", minutes: 0, squadIndex: 4 },
      { playerId: "selma", minutes: 8, squadIndex: 0 },
      { playerId: "nora", minutes: 4, squadIndex: 7 },
    ];
    expect(sortBenchPlayers(entries)).toEqual(["ida", "nora", "selma", "maja"]);
  });
});

describe("holdBenchOrder", () => {
  it("keeps everyone in place and puts a newcomer in the vacated slot", () => {
    expect(holdBenchOrder(["a", "b", "c", "d"], ["a", "c", "d", "x"])).toEqual(["a", "x", "c", "d"]);
  });

  it("restores the exact previous order when the swap is undone", () => {
    const held = holdBenchOrder(["a", "b", "c"], ["a", "c", "x"]);
    expect(held).toEqual(["a", "x", "c"]);
    expect(holdBenchOrder(held, ["c", "b", "a"])).toEqual(["a", "b", "c"]);
  });

  it("appends extra newcomers and drops leavers without a replacement", () => {
    expect(holdBenchOrder(["a", "b"], ["b", "x", "y"])).toEqual(["x", "b", "y"]);
    expect(holdBenchOrder(["a", "b", "c"], ["c"])).toEqual(["c"]);
  });

  it("does not mutate its inputs", () => {
    const previous = ["a", "b"];
    const current = ["b", "x"];
    holdBenchOrder(previous, current);
    expect(previous).toEqual(["a", "b"]);
    expect(current).toEqual(["b", "x"]);
  });
});

describe("nextBenchOrder (freeze and release)", () => {
  const start = (order: string[]): BenchOrderState => nextBenchOrder(INITIAL_BENCH_ORDER, { sorted: order, held: false });

  it("starts sorted, even when the first render is held", () => {
    expect(nextBenchOrder(INITIAL_BENCH_ORDER, { sorted: ["a", "b"], held: true }).order).toEqual(["a", "b"]);
  });

  it("returns the same state object when nothing changes", () => {
    const state = start(["a", "b"]);
    expect(nextBenchOrder(state, { sorted: ["a", "b"], held: false })).toBe(state);
    expect(nextBenchOrder(state, { sorted: ["b", "a"], held: true })).toBe(state);
    expect(nextBenchOrder(INITIAL_BENCH_ORDER, { sorted: [], held: false })).toBe(INITIAL_BENCH_ORDER);
  });

  it("holds the order through a selection, a substitution and its undo window, then re-sorts once", () => {
    // Bench least-played first: a 0′, b 4′, c 8′. The coach selects Maja
    // (16′) on the pitch and taps c: c goes on, Maja comes off.
    let state = start(["a", "b", "c"]);
    const key = state.returnToStartKey;

    // Selection, then the swap inside the undo window: Maja takes c's slot.
    state = nextBenchOrder(state, { sorted: ["a", "b", "maja"], held: true });
    expect(state.order).toEqual(["a", "b", "maja"]);
    state = nextBenchOrder(state, { sorted: ["a", "b", "maja"], held: true });
    expect(state.returnToStartKey).toBe(key);

    // Undo window over: one re-sort, and the rail returns to the start.
    state = nextBenchOrder(state, { sorted: ["a", "b", "maja"], held: false });
    expect(state.order).toEqual(["a", "b", "maja"]);
    expect(state.returnToStartKey).toBe(key + 1);
    expect(state.changedWhileHeld).toBe(false);
  });

  it("moves the incoming player into the outgoing slot, not to its sorted place, while held", () => {
    let state = start(["a", "b", "c", "d"]);
    // b (4′) goes on; Maja (16′) would sort last but sits in b's slot.
    state = nextBenchOrder(state, { sorted: ["a", "c", "d", "maja"], held: true });
    expect(state.order).toEqual(["a", "maja", "c", "d"]);
    state = nextBenchOrder(state, { sorted: ["a", "c", "d", "maja"], held: false });
    expect(state.order).toEqual(["a", "c", "d", "maja"]);
  });

  it("does not reorder while held even if minutes change the sort", () => {
    let state = start(["a", "b", "c"]);
    state = nextBenchOrder(state, { sorted: ["c", "b", "a"], held: true });
    expect(state.order).toEqual(["a", "b", "c"]);
    state = nextBenchOrder(state, { sorted: ["c", "b", "a"], held: false });
    expect(state.order).toEqual(["c", "b", "a"]);
  });

  it("an undone substitution restores the order and does not jump the rail", () => {
    let state = start(["a", "b", "c"]);
    const key = state.returnToStartKey;
    state = nextBenchOrder(state, { sorted: ["a", "c", "maja"], held: true });
    expect(state.order).toEqual(["a", "maja", "c"]);
    // Undo: b returns, Maja goes back on.
    state = nextBenchOrder(state, { sorted: ["a", "b", "c"], held: true });
    expect(state.order).toEqual(["a", "b", "c"]);
    state = nextBenchOrder(state, { sorted: ["a", "b", "c"], held: false });
    expect(state.order).toEqual(["a", "b", "c"]);
    // Membership changed during the hold, so the rail still returns to start.
    expect(state.returnToStartKey).toBe(key + 1);
  });

  it("a selection that is cancelled without a substitution leaves the rail where it is", () => {
    let state = start(["a", "b", "c"]);
    const key = state.returnToStartKey;
    state = nextBenchOrder(state, { sorted: ["a", "b", "c"], held: true });
    state = nextBenchOrder(state, { sorted: ["a", "b", "c"], held: false });
    expect(state.returnToStartKey).toBe(key);
  });
});
