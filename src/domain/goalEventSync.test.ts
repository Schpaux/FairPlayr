// MATCH-02a: server goal rows follow the goals in the device's live state.
import { describe, expect, it } from "vitest";
import {
  goalEventsFromRuntimeState,
  planGoalEventSync,
  type GoalEventWrite,
  type ServerGoalEventRow,
} from "@/domain/goalEventSync";

const GOAL_1 = "3f2a6c1e-8b4d-4e5f-9a6b-7c8d9e0f1a2b";
const GOAL_2 = "4a3b7d2f-9c5e-4f6a-8b7c-8d9e0f1a2b3c";
const SCORER = "5b4c8e3a-0d6f-4a7b-9c8d-9e0f1a2b3c4d";
const ASSIST = "6c5d9f4b-1e7a-4b8c-8d9e-0f1a2b3c4d5e";

function goal(overrides: Record<string, unknown> = {}) {
  return {
    id: GOAL_1,
    type: "goal",
    minute: 12,
    timestampMs: 720_000,
    createdAt: "2026-10-26T10:12:00.000Z",
    teamSide: "own",
    scorerPlayerId: null,
    scorerName: null,
    assistPlayerId: null,
    assistName: null,
    ...overrides,
  };
}

function rowFor(write: GoalEventWrite): ServerGoalEventRow {
  return { ...write, payload: { ...write.payload } };
}

describe("goalEventsFromRuntimeState", () => {
  it("maps own and opponent goals with the device's event ids, ignoring other events", () => {
    const goals = goalEventsFromRuntimeState({
      events: [
        goal({ scorerPlayerId: SCORER, scorerName: "Emma", assistPlayerId: ASSIST, assistName: "Ida" }),
        { id: "sub-1", type: "substitution", minute: 13 },
        goal({ id: GOAL_2, teamSide: "opponent", minute: 20, timestampMs: 1_200_000 }),
      ],
    });

    expect(goals).toEqual([
      {
        id: GOAL_1,
        type: "goal_for",
        minute: 12,
        timestampMs: 720_000,
        teamSide: "own",
        primaryPlayerId: SCORER,
        secondaryPlayerId: ASSIST,
        payload: { primaryPlayerName: "Emma", secondaryPlayerName: "Ida" },
      },
      {
        id: GOAL_2,
        type: "goal_against",
        minute: 20,
        timestampMs: 1_200_000,
        teamSide: "opponent",
        primaryPlayerId: null,
        secondaryPlayerId: null,
        payload: { primaryPlayerName: null, secondaryPlayerName: null },
      },
    ]);
  });

  it("keeps a scorer whose id is not a UUID by name only", () => {
    const [mapped] = goalEventsFromRuntimeState({ events: [goal({ scorerPlayerId: "p2", scorerName: "Emma" })] })!;
    expect(mapped.primaryPlayerId).toBeNull();
    expect(mapped.payload.primaryPlayerName).toBe("Emma");
  });

  it("refuses a state it cannot trust, so the server rows are left alone", () => {
    expect(goalEventsFromRuntimeState(null)).toBeNull();
    expect(goalEventsFromRuntimeState({ status: "running" })).toBeNull();
    // An old device's goal id: no safe server id for it.
    expect(goalEventsFromRuntimeState({ events: [goal(), goal({ id: "event-1729-abc" })] })).toBeNull();
  });

  it("gives an empty list when every goal was removed", () => {
    expect(goalEventsFromRuntimeState({ events: [] })).toEqual([]);
  });
});

describe("planGoalEventSync", () => {
  const desired = goalEventsFromRuntimeState({ events: [goal()] })!;

  it("creates a goal the server does not have", () => {
    expect(planGoalEventSync(desired, [])).toEqual({ insert: desired, update: [], remove: [] });
  });

  it("does nothing when the same state is sent again (lost answer, retry)", () => {
    expect(planGoalEventSync(desired, desired.map(rowFor))).toEqual({ insert: [], update: [], remove: [] });
  });

  it("puts a scorer and assist chosen later on that same goal", () => {
    const withScorer = goalEventsFromRuntimeState({
      events: [goal({ scorerPlayerId: SCORER, scorerName: "Emma", assistName: "Ida" })],
    })!;

    expect(planGoalEventSync(withScorer, desired.map(rowFor))).toEqual({ insert: [], update: withScorer, remove: [] });
  });

  it("removes an undone goal and a row from an older app that the state does not have", () => {
    const rows: ServerGoalEventRow[] = [
      ...desired.map(rowFor),
      { ...rowFor(desired[0]), id: GOAL_2 },
      { ...rowFor(desired[0]), id: "7d6e0a5c-2f8b-4c9d-9e0f-1a2b3c4d5e6f" },
    ];

    expect(planGoalEventSync(desired, rows).remove).toEqual([GOAL_2, "7d6e0a5c-2f8b-4c9d-9e0f-1a2b3c4d5e6f"]);
  });

  it("never touches server events that are not goals", () => {
    const substitution: ServerGoalEventRow = { ...rowFor(desired[0]), id: GOAL_2, type: "substitution" };
    expect(planGoalEventSync([], [substitution])).toEqual({ insert: [], update: [], remove: [] });
  });
});
