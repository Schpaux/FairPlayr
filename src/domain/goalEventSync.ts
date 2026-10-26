/**
 * MATCH-02a: server goal events follow the goals in the device's live state.
 *
 * The live screen sends its whole state (runtime state) and the server makes
 * its goal rows match the goals in it: missing ones are created with the
 * device's own event id, changed ones (scorer, assist) are updated, and goals
 * the coach removed are deleted. Sending the same state again, after a lost
 * answer or on a retry, therefore changes nothing and never adds a goal.
 */

export type ServerGoalEventType = "goal_for" | "goal_against";

export interface GoalEventWrite {
  /** The local event id, used as the server event id. */
  id: string;
  type: ServerGoalEventType;
  minute: number | null;
  timestampMs: number | null;
  teamSide: "own" | "opponent";
  primaryPlayerId: string | null;
  secondaryPlayerId: string | null;
  payload: { primaryPlayerName: string | null; secondaryPlayerName: string | null };
}

export interface ServerGoalEventRow {
  id: string;
  type: string;
  minute: number | null;
  timestampMs: number | null;
  teamSide: string | null;
  primaryPlayerId: string | null;
  secondaryPlayerId: string | null;
  payload: Record<string, unknown> | null;
}

export interface GoalEventSyncPlan {
  insert: GoalEventWrite[];
  update: GoalEventWrite[];
  remove: string[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function wholeNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * The goal rows the server should have for this runtime state, or null when
 * the state cannot be trusted for that: no event list, or a goal without a
 * UUID id (an old device). Then the server's goal rows are left as they are.
 */
export function goalEventsFromRuntimeState(runtimeState: unknown): GoalEventWrite[] | null {
  if (!isRecord(runtimeState) || !Array.isArray(runtimeState.events)) {
    return null;
  }

  const goals: GoalEventWrite[] = [];

  for (const event of runtimeState.events) {
    if (!isRecord(event) || event.type !== "goal") {
      continue;
    }

    if (!isUuid(event.id)) {
      return null;
    }

    const own = event.teamSide !== "opponent";
    // Player columns are UUIDs; any other id is kept by name only.
    const scorerId = own && isUuid(event.scorerPlayerId) ? event.scorerPlayerId : null;
    const assistId = own && isUuid(event.assistPlayerId) ? event.assistPlayerId : null;

    goals.push({
      id: event.id,
      type: own ? "goal_for" : "goal_against",
      minute: wholeNumberOrNull(event.minute),
      timestampMs: wholeNumberOrNull(event.timestampMs),
      teamSide: own ? "own" : "opponent",
      primaryPlayerId: scorerId,
      secondaryPlayerId: assistId,
      payload: {
        primaryPlayerName: own ? stringOrNull(event.scorerName) : null,
        secondaryPlayerName: own ? stringOrNull(event.assistName) : null,
      },
    });
  }

  return goals;
}

function isServerGoal(row: ServerGoalEventRow): boolean {
  return row.type === "goal_for" || row.type === "goal_against";
}

function sameGoal(row: ServerGoalEventRow, goal: GoalEventWrite): boolean {
  return (
    row.type === goal.type &&
    row.minute === goal.minute &&
    row.timestampMs === goal.timestampMs &&
    row.teamSide === goal.teamSide &&
    row.primaryPlayerId === goal.primaryPlayerId &&
    row.secondaryPlayerId === goal.secondaryPlayerId &&
    stringOrNull(row.payload?.primaryPlayerName) === goal.payload.primaryPlayerName &&
    stringOrNull(row.payload?.secondaryPlayerName) === goal.payload.secondaryPlayerName
  );
}

/** What to write so the server's goal rows of a match equal `desired`. */
export function planGoalEventSync(
  desired: readonly GoalEventWrite[],
  serverRows: readonly ServerGoalEventRow[]
): GoalEventSyncPlan {
  const serverGoals = new Map(serverRows.filter(isServerGoal).map((row) => [row.id, row]));
  const desiredIds = new Set(desired.map((goal) => goal.id));
  const plan: GoalEventSyncPlan = { insert: [], update: [], remove: [] };

  for (const goal of desired) {
    const row = serverGoals.get(goal.id);

    if (!row) {
      plan.insert.push(goal);
    } else if (!sameGoal(row, goal)) {
      plan.update.push(goal);
    }
  }

  for (const id of serverGoals.keys()) {
    if (!desiredIds.has(id)) {
      plan.remove.push(id);
    }
  }

  return plan;
}
