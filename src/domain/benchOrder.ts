/**
 * Bench order (FP-MS2.1-B2, DESIGN.md §5.3) — pure domain module.
 *
 * The bench is shown least-played first, so the players who most need minutes
 * are where the coach's eye and thumb land. Two concerns live here:
 *
 *   1. `sortBenchPlayers`: the intended order. Ascending by total match
 *      minutes **as displayed** (whole minutes, never hidden seconds or the
 *      stint ring), ties in squad order. Stable, deterministic, non-mutating.
 *
 *   2. `nextBenchOrder`: the order actually shown, which must not move under
 *      the coach's finger. While an interaction is in progress (a selection,
 *      a drag, "Bytt plass", an undo window, a finger on or a scroll of the
 *      bench) the shown order is *held*: nobody moves, and a player who joins
 *      the bench takes the exact slot of the player who left it. When the
 *      interaction ends the bench re-sorts once, and if its membership changed
 *      while held, `returnToStartKey` changes so the rail scrolls back to the
 *      start, where the least-played now are.
 *
 * Everything is keyed by player id, never by a position in a list.
 */

export interface BenchOrderEntry {
  playerId: string;
  /** Total match minutes as shown on the tile (whole minutes). */
  minutes: number;
  /** Position in the match squad (setup order); lower comes first on ties. */
  squadIndex: number;
}

/**
 * Least-played first; equal displayed minutes keep squad order. Unknown squad
 * positions (`squadIndex` not finite) sort after known ones, then by their
 * place in `entries`, so the result is always deterministic.
 */
export function sortBenchPlayers(entries: readonly BenchOrderEntry[]): string[] {
  return entries
    .map((entry, inputIndex) => ({ entry, inputIndex }))
    .sort((a, b) => {
      const byMinutes = a.entry.minutes - b.entry.minutes;
      if (byMinutes !== 0) return byMinutes;
      const sa = Number.isFinite(a.entry.squadIndex) ? a.entry.squadIndex : Number.MAX_SAFE_INTEGER;
      const sb = Number.isFinite(b.entry.squadIndex) ? b.entry.squadIndex : Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      return a.inputIndex - b.inputIndex;
    })
    .map(({ entry }) => entry.playerId);
}

/**
 * Keep every player who is still on the bench where they were. A player who
 * joined takes the slot of one who left (first vacated slot first); any extra
 * newcomers go last, in the order given.
 */
export function holdBenchOrder(previous: readonly string[], currentIds: readonly string[]): string[] {
  const current = new Set(currentIds);
  const known = new Set(previous);
  const added = currentIds.filter((id) => !known.has(id));
  const held: string[] = [];
  for (const id of previous) {
    if (current.has(id)) held.push(id);
    else if (added.length > 0) held.push(added.shift()!);
  }
  return [...held, ...added];
}

export interface BenchOrderState {
  /** Player ids in the order shown. */
  order: readonly string[];
  /** The bench membership changed while the order was held. */
  changedWhileHeld: boolean;
  /** Changes each time the rail should return to its start. */
  returnToStartKey: number;
}

export const INITIAL_BENCH_ORDER: BenchOrderState = {
  order: [],
  changedWhileHeld: false,
  returnToStartKey: 0,
};

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * The next shown order. Returns `state` itself when nothing changes, so a
 * caller can skip a re-render.
 *
 * - First call (empty state): sorted, even when held.
 * - Held: `holdBenchOrder`, and remember whether the membership changed.
 * - Released: sorted; if the membership changed while held, bump
 *   `returnToStartKey`.
 */
export function nextBenchOrder(
  state: BenchOrderState,
  input: { sorted: readonly string[]; held: boolean }
): BenchOrderState {
  const { sorted, held } = input;

  if (state.order.length === 0 && !state.changedWhileHeld) {
    return sorted.length === 0 ? state : { ...state, order: [...sorted] };
  }

  if (held) {
    const order = holdBenchOrder(state.order, sorted);
    const changed = !sameMembers(order, state.order);
    if (!changed && sameOrder(order, state.order)) return state;
    return { ...state, order, changedWhileHeld: state.changedWhileHeld || changed };
  }

  const membershipChanged = !sameMembers(sorted, state.order);
  const returnToStart = state.changedWhileHeld || membershipChanged;
  if (!returnToStart && sameOrder(sorted, state.order)) return state;
  return {
    order: [...sorted],
    changedWhileHeld: false,
    returnToStartKey: returnToStart ? state.returnToStartKey + 1 : state.returnToStartKey,
  };
}
