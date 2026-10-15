/**
 * Substitution with a targeted undo (FP-MS2.1-B1-F1).
 *
 * A substitution changes exactly two players and adds one event. Applying it
 * returns a record of those changes; undoing it reverses only them, on the
 * current match state, so anything that happened inside the undo window
 * (goals, pause or resume, half-time, other events) survives.
 *
 * ## Playing-time semantics
 *
 * Undo means "this substitution never happened": the coach corrects a tap
 * inside the 5 s window, before the players actually change. So the outgoing
 * player's stint is restored as if it never stopped, and the incoming player
 * gets back exactly the minutes and bench status they had before:
 *
 *   - out: accumulated minutes and `onFieldStartedAtElapsedMs` as before the
 *     substitution. The time since then is counted for them again by the
 *     pause-free match clock, so pauses and the half-time break inside the
 *     window add nothing, and the half-time ring reset still applies
 *     (`playerStint` starts the stint at the later of the two marks).
 *   - in: accumulated minutes as before, back on the bench (`null` stint).
 *     Minutes credited during the window are removed, never doubled: the
 *     undo only acts while both players still hold the exact values the
 *     substitution gave them, so nothing has been banked from that spell.
 *
 * ## Event semantics
 *
 * The substitution event is removed by its id and no other event is touched.
 * Substitution events are not posted as separate server rows; they only travel
 * inside `runtimeState`, which the live screen PATCHes after every change. The
 * next PATCH (or the completion body at full time) therefore replaces the
 * server copy, and no server row is left behind.
 */

import { getElapsedMs, substitutePlayers, type LiveMatchState } from "@/domain/liveMatch";
import type { SubstitutionMatchEvent } from "@/domain/matchEvent";

/** One player's playing-time fields. */
export interface PlayerClockEntry {
  readonly accumulatedMs: number;
  readonly startedAtElapsedMs: number | null;
}

/** What a committed substitution changed, kept for its targeted undo. */
export interface SubstitutionRecord {
  /** Id of the substitution event the substitution added. */
  readonly eventId: string;
  readonly outPlayerId: string;
  readonly inPlayerId: string;
  /** The slot the outgoing player left (null for an unassigned player). */
  readonly slotId: string | null;
  /** The two players' values just before the substitution. */
  readonly before: { readonly out: PlayerClockEntry; readonly in: PlayerClockEntry };
  /** The values the substitution gave them. */
  readonly after: { readonly out: PlayerClockEntry; readonly in: PlayerClockEntry };
}

function clockEntry(state: LiveMatchState, playerId: string): PlayerClockEntry {
  return {
    accumulatedMs: state.playerAccumulatedMs[playerId] ?? 0,
    startedAtElapsedMs: state.onFieldStartedAtElapsedMs[playerId] ?? null,
  };
}

function sameEntry(a: PlayerClockEntry, b: PlayerClockEntry): boolean {
  return a.accumulatedMs === b.accumulatedMs && a.startedAtElapsedMs === b.startedAtElapsedMs;
}

function slotOf(state: LiveMatchState, playerId: string): string | null {
  for (const [slotId, occupant] of Object.entries(state.liveSlotAssignments)) {
    if (occupant === playerId) return slotId;
  }
  return null;
}

/**
 * Substitute `outPlayerId` for `inPlayerId` and append `event`. Returns null,
 * changing nothing, when the match has ended or the pair is not a valid
 * substitution (outgoing not on the pitch, incoming not on the bench).
 */
export function applySubstitution(
  state: LiveMatchState,
  outPlayerId: string,
  inPlayerId: string,
  nowMs: number,
  event: SubstitutionMatchEvent
): { state: LiveMatchState; record: SubstitutionRecord } | null {
  if (
    state.status === "ended" ||
    outPlayerId === inPlayerId ||
    !state.onFieldPlayerIds.includes(outPlayerId) ||
    !state.benchPlayerIds.includes(inPlayerId)
  ) {
    return null;
  }

  const elapsedMs = getElapsedMs(state, nowMs);
  const substituted = substitutePlayers(state, outPlayerId, inPlayerId, nowMs);

  // The engine's own normalisation before a substitution: an outgoing player
  // without a stint start gets one at the current time while the clock runs,
  // and the incoming player's banked minutes are what it keeps for them.
  const outBefore = clockEntry(state, outPlayerId);
  const before = {
    out: {
      accumulatedMs: outBefore.accumulatedMs,
      startedAtElapsedMs:
        outBefore.startedAtElapsedMs ?? (state.clock.isRunning ? elapsedMs : null),
    },
    in: { accumulatedMs: substituted.playerAccumulatedMs[inPlayerId] ?? 0, startedAtElapsedMs: null },
  };

  return {
    state: { ...substituted, events: [...substituted.events, event] },
    record: {
      eventId: event.id,
      outPlayerId,
      inPlayerId,
      slotId: slotOf(state, outPlayerId),
      before,
      after: { out: clockEntry(substituted, outPlayerId), in: clockEntry(substituted, inPlayerId) },
    },
  };
}

/**
 * Whether `record` can still be undone on `state`: the match has not ended,
 * the incoming player is still on the pitch and the outgoing player still on
 * the bench, and neither player's minutes or stint changed since.
 */
export function canUndoSubstitution(state: LiveMatchState, record: SubstitutionRecord): boolean {
  return (
    state.status !== "ended" &&
    state.onFieldPlayerIds.includes(record.inPlayerId) &&
    !state.benchPlayerIds.includes(record.inPlayerId) &&
    state.benchPlayerIds.includes(record.outPlayerId) &&
    !state.onFieldPlayerIds.includes(record.outPlayerId) &&
    sameEntry(clockEntry(state, record.outPlayerId), record.after.out) &&
    sameEntry(clockEntry(state, record.inPlayerId), record.after.in)
  );
}

/**
 * Reverse one committed substitution on the current state. Only the two
 * players, the slot the incoming player now stands in and the substitution
 * event change. Returns `state` itself (same reference) when the undo is no
 * longer valid, so callers can treat it as a no-op.
 */
export function undoSubstitution(state: LiveMatchState, record: SubstitutionRecord): LiveMatchState {
  if (!canUndoSubstitution(state, record)) return state;

  const { outPlayerId, inPlayerId } = record;

  // The outgoing player returns to wherever the incoming player stands now,
  // so a later position change on the pitch is kept.
  const inSlotId = slotOf(state, inPlayerId);
  const liveSlotAssignments =
    inSlotId === null
      ? state.liveSlotAssignments
      : { ...state.liveSlotAssignments, [inSlotId]: outPlayerId };

  return {
    ...state,
    onFieldPlayerIds: state.onFieldPlayerIds.map((id) => (id === inPlayerId ? outPlayerId : id)),
    benchPlayerIds: state.benchPlayerIds.map((id) => (id === outPlayerId ? inPlayerId : id)),
    playerAccumulatedMs: {
      ...state.playerAccumulatedMs,
      [outPlayerId]: record.before.out.accumulatedMs,
      [inPlayerId]: record.before.in.accumulatedMs,
    },
    onFieldStartedAtElapsedMs: {
      ...state.onFieldStartedAtElapsedMs,
      [outPlayerId]: record.before.out.startedAtElapsedMs,
      [inPlayerId]: record.before.in.startedAtElapsedMs,
    },
    liveSlotAssignments,
    events: state.events.filter((event) => event.id !== record.eventId),
    updatedAt: new Date().toISOString(),
  };
}
