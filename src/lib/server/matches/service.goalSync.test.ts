// MATCH-02a: server goal rows follow the device's live state, idempotently,
// and late writes never reopen or overwrite a newer or finished match.
import { beforeEach, describe, expect, it, vi } from "vitest";

const summaryMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/ai/match-summary", () => ({
  generateMatchSummaryByMatchId: summaryMock,
}));

import { createMatchEvent, updateMatchStatus } from "@/lib/server/matches/service";

type Row = Record<string, unknown>;

interface FakeOptions {
  /** Makes goal writes fail, like a dropped connection. */
  failInsert?: () => boolean;
  /** Awaited before each call runs ("update:matches", "rpc:sync_match_goal_events", …). */
  pause?: (op: string) => Promise<void> | void;
  /** The database function is not installed (migration not applied). */
  noRpc?: boolean;
}

/** Column value, also for a JSON path such as "runtime_state->>updatedAt". */
function columnValue(row: Row, col: string): unknown {
  const [column, key] = col.split("->>");
  if (key === undefined) return row[column];
  const json = row[column] as Row | null | undefined;
  return json?.[key] ?? null;
}

/**
 * The contract of sync_match_goal_events (migration 20261026120000): check
 * and writes run as one step, like under the match row lock.
 */
function syncGoalEventsRpc(tables: Record<string, Row[]>, args: Row, options: FakeOptions) {
  const match = tables.matches.find((row) => row.id === args.p_match_id);
  if (!match) return { data: false, error: null };
  const incoming = args.p_runtime_state as Row;
  const stored = match.runtime_state as Row | null;
  if (!args.p_final) {
    if (match.status === "completed" || stored?.id !== incoming.id || stored?.updatedAt !== incoming.updatedAt) {
      return { data: false, error: null };
    }
  }
  if (args.p_final && match.status === "completed" && stored?.status === "ended") {
    return { data: false, error: null };
  }
  if (options.failInsert?.()) {
    return { data: null, error: { code: "08006", message: "connection lost" } };
  }
  if (args.p_final && match.status !== "completed") {
    match.runtime_state = incoming;
  }
  const goals = args.p_goals as Row[];
  const ids = new Set(goals.map((goal) => goal.id));
  tables.match_events = tables.match_events.filter(
    (row) => row.match_id !== match.id || (row.type !== "goal_for" && row.type !== "goal_against") || ids.has(row.id)
  );
  for (const goal of goals) {
    const existing = tables.match_events.find((row) => row.id === goal.id);
    if (!existing) tables.match_events.push({ ...goal });
    else if (existing.match_id === match.id) Object.assign(existing, goal);
  }
  return { data: true, error: null };
}

/**
 * The contract of complete_match_with_goal_events (same migration): the first
 * completion, its goals and its final state in one step; no row once the
 * match is completed. An error writes nothing.
 */
function completeMatchRpc(tables: Record<string, Row[]>, args: Row, options: FakeOptions) {
  const match = tables.matches.find((row) => row.id === args.p_match_id);
  if (!match || match.status === "completed") return { data: [], error: null };
  const update = args.p_match as Row;
  const synced = syncGoalEventsRpc(
    tables,
    { p_match_id: match.id, p_runtime_state: update.runtime_state, p_goals: args.p_goals, p_final: true },
    options
  );
  if (synced.error) return { data: null, error: synced.error };
  Object.assign(match, update);
  return { data: [{ ...match }], error: null };
}

/**
 * In-memory Supabase for the calls updateMatchStatus and the goal sync make:
 * select/update/insert/delete with eq/neq/in/is filters, and the goal sync
 * function.
 */
function fakeSupabase(tables: Record<string, Row[]>, options: FakeOptions = {}) {
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "select" | "update" | "insert" | "delete" = "select";
    let patch: Row | null = null;
    let inserted: Row | null = null;
    const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    const run = async (single: boolean) => {
      await options.pause?.(`${mode}:${table}`);
      if (mode === "insert") {
        if (options.failInsert?.()) {
          return Promise.resolve({ data: null, error: { code: "08006", message: "connection lost" } });
        }
        if ((tables[table] ?? []).some((row) => row.id === inserted!.id)) {
          return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
        }
        (tables[table] ??= []).push({ ...inserted });
        return Promise.resolve({ data: null, error: null });
      }
      const matched = rows();
      if (mode === "delete") {
        tables[table] = (tables[table] ?? []).filter((row) => !matched.includes(row));
        return Promise.resolve({ data: null, error: null });
      }
      if (mode === "update") {
        matched.forEach((row) => Object.assign(row, patch));
      }
      const copies = matched.map((row) => ({ ...row }));
      return Promise.resolve({ data: single ? copies[0] ?? null : copies, error: null });
    };
    const builder = {
      select: () => builder,
      update: (payload: Row) => ((mode = "update"), (patch = payload), builder),
      insert: (payload: Row) => ((mode = "insert"), (inserted = payload), builder),
      delete: () => ((mode = "delete"), builder),
      eq: (col: string, value: unknown) => (filters.push((row) => columnValue(row, col) === value), builder),
      is: (col: string, value: null) => (filters.push((row) => (columnValue(row, col) ?? null) === value), builder),
      neq: (col: string, value: unknown) => (filters.push((row) => row[col] !== value), builder),
      in: (col: string, values: unknown[]) => (filters.push((row) => values.includes(row[col])), builder),
      not: (col: string, _op: string, value: unknown) => (filters.push((row) => row[col] !== value), builder),
      order: () => builder,
      limit: () => builder,
      returns: () => builder,
      maybeSingle: () => run(true),
      single: () => run(true),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        run(false).then(resolve, reject),
    };
    return builder;
  };
  const rpc = async (name: string, args: Row) => {
    await options.pause?.(`rpc:${name}`);
    if (options.noRpc || (name !== "sync_match_goal_events" && name !== "complete_match_with_goal_events")) {
      return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${name}` } };
    }
    return name === "complete_match_with_goal_events"
      ? completeMatchRpc(tables, args, options)
      : syncGoalEventsRpc(tables, args, options);
  };
  return { from, rpc } as never;
}

/**
 * Holds the nth call of one operation until released, so a test can let
 * another request run in between (controlled overlap).
 */
function holdAt(op: string, nth = 1) {
  let seen = 0;
  let reached!: () => void;
  let release!: () => void;
  const reachedPromise = new Promise<void>((resolve) => (reached = resolve));
  const releasePromise = new Promise<void>((resolve) => (release = resolve));
  return {
    pause: (name: string) => {
      if (name !== op || ++seen !== nth) return;
      reached();
      return releasePromise;
    },
    reached: reachedPromise,
    release,
  };
}

/** Combines several holds into one pause hook. */
const pauses =
  (...holds: Array<{ pause: (op: string) => Promise<void> | void }>) =>
  async (op: string) => {
    // Every hold counts the call now, not after an earlier hold is released.
    await Promise.all(holds.map((hold) => hold.pause(op)));
  };

const MATCH = "match-1";
const LIVE_ID = "live-1";
const GOAL_1 = "3f2a6c1e-8b4d-4e5f-9a6b-7c8d9e0f1a2b";
const GOAL_2 = "4a3b7d2f-9c5e-4f6a-8b7c-8d9e0f1a2b3c";
const SCORER = "5b4c8e3a-0d6f-4a7b-9c8d-9e0f1a2b3c4d";

function goal(id: string, overrides: Row = {}): Row {
  return {
    id,
    type: "goal",
    minute: 5,
    timestampMs: 300_000,
    createdAt: "2026-10-26T10:05:00.000Z",
    teamSide: "own",
    scorerPlayerId: null,
    scorerName: null,
    assistPlayerId: null,
    assistName: null,
    ...overrides,
  };
}

function state(updatedAt: string, events: Row[], status = "running"): Row {
  return { id: LIVE_ID, status, updatedAt, events, teamScore: events.length, opponentScore: 0 };
}

function setup(overrides: Row = {}, options: FakeOptions = {}) {
  const match: Row = {
    id: MATCH,
    team_id: "team-1",
    title: "Kamp",
    opponent_name: null,
    starts_at: "2026-10-26T10:00:00.000Z",
    location: null,
    status: "live",
    runtime_state: null,
    created_by: "user-1",
    created_at: "2026-10-26T10:00:00.000Z",
    updated_at: "2026-10-26T10:00:00.000Z",
    started_at: "2026-10-26T10:00:00.000Z",
    ended_at: null,
    format: "5v5",
    report_enabled: false,
    report_status: "not_requested",
    report_text: null,
    report_generated_at: null,
    score_for: 0,
    score_against: 0,
    ...overrides,
  };
  const tables: Record<string, Row[]> = {
    matches: [match],
    match_events: [],
    team_members: [{ team_id: "team-1", user_id: "user-1" }],
    external_event_links: [],
  };
  return { client: fakeSupabase(tables, options), tables, match };
}

const goalRows = (tables: Record<string, Row[]>) =>
  tables.match_events.filter((row) => row.type === "goal_for" || row.type === "goal_against");

const livePatch = (runtimeState: Row) => ({
  matchId: MATCH,
  runtimeState,
  scoreFor: (runtimeState.events as Row[]).length,
  scoreAgainst: 0,
});

describe("goal events follow the live state (MATCH-02a)", () => {
  beforeEach(() => {
    summaryMock.mockReset();
  });

  it("a lost answer and the same state sent again give one goal row with the device's id", async () => {
    const { client, tables } = setup();
    const withGoal = state("2026-10-26T10:05:00.000Z", [goal(GOAL_1)]);

    await updateMatchStatus(client, "user-1", livePatch(withGoal));
    // The answer was lost: the device sends the same state again.
    await updateMatchStatus(client, "user-1", livePatch(withGoal));

    expect(goalRows(tables)).toHaveLength(1);
    expect(goalRows(tables)[0]).toMatchObject({ id: GOAL_1, match_id: MATCH, type: "goal_for", minute: 5 });
  });

  it("puts the scorer on that goal and removes an undone goal", async () => {
    const { client, tables } = setup();
    await updateMatchStatus(client, "user-1", livePatch(state("2026-10-26T10:05:00.000Z", [goal(GOAL_1)])));
    await updateMatchStatus(
      client,
      "user-1",
      livePatch(
        state("2026-10-26T10:06:00.000Z", [
          goal(GOAL_1, { scorerPlayerId: SCORER, scorerName: "Emma" }),
          goal(GOAL_2, { minute: 6 }),
        ])
      )
    );

    expect(goalRows(tables)).toHaveLength(2);
    expect(goalRows(tables).find((row) => row.id === GOAL_1)).toMatchObject({
      primary_player_id: SCORER,
      payload: { primaryPlayerName: "Emma", secondaryPlayerName: null },
    });

    // The second goal is undone on the device.
    await updateMatchStatus(
      client,
      "user-1",
      livePatch(state("2026-10-26T10:07:00.000Z", [goal(GOAL_1, { scorerPlayerId: SCORER, scorerName: "Emma" })]))
    );
    expect(goalRows(tables).map((row) => row.id)).toEqual([GOAL_1]);
  });

  it("ignores an older state that arrives after a newer one", async () => {
    const { client, tables, match } = setup();
    const newer = state("2026-10-26T10:07:00.000Z", [goal(GOAL_1, { scorerPlayerId: SCORER, scorerName: "Emma" })]);
    await updateMatchStatus(client, "user-1", livePatch(newer));

    // A retry of the state before the scorer was chosen, and one with a goal later undone.
    await updateMatchStatus(client, "user-1", livePatch(state("2026-10-26T10:05:00.000Z", [goal(GOAL_1)])));
    await updateMatchStatus(
      client,
      "user-1",
      livePatch(state("2026-10-26T10:06:00.000Z", [goal(GOAL_1), goal(GOAL_2)]))
    );

    expect(match.runtime_state).toEqual(newer);
    expect(match.score_for).toBe(1);
    expect(goalRows(tables)).toHaveLength(1);
    expect(goalRows(tables)[0]).toMatchObject({ id: GOAL_1, primary_player_id: SCORER });
  });

  it("a live state that arrives after the completion neither reopens the match nor changes its goals", async () => {
    const { client, tables, match } = setup();
    const final = state("2026-10-26T10:40:00.000Z", [goal(GOAL_1)], "ended");
    await updateMatchStatus(client, "user-1", { ...livePatch(final), status: "completed" });
    expect(match.status).toBe("completed");

    await expect(
      updateMatchStatus(client, "user-1", livePatch(state("2026-10-26T10:30:00.000Z", [goal(GOAL_1), goal(GOAL_2)])))
    ).rejects.toMatchObject({ code: "MATCH_COMPLETED", status: 409 });
    // An older app's separate goal request is refused too.
    await expect(
      createMatchEvent(client, "user-1", { matchId: MATCH, type: "goal_for", minute: 30 })
    ).rejects.toMatchObject({ code: "MATCH_COMPLETED", status: 409 });

    expect(match).toMatchObject({ status: "completed", runtime_state: final, score_for: 1 });
    expect(goalRows(tables).map((row) => row.id)).toEqual([GOAL_1]);
  });

  it("a discarded match is not reopened by a late live state", async () => {
    const { client, tables, match } = setup();
    await updateMatchStatus(client, "user-1", { matchId: MATCH, status: "completed", runtimeState: null });

    await expect(
      updateMatchStatus(client, "user-1", livePatch(state("2026-10-26T10:30:00.000Z", [goal(GOAL_1)])))
    ).rejects.toMatchObject({ code: "MATCH_COMPLETED" });
    expect(match).toMatchObject({ status: "completed", runtime_state: null });
    expect(goalRows(tables)).toHaveLength(0);
  });

  it("brings the final goals before completing; a failed sync leaves the match open for the retry", async () => {
    let failing = true;
    const { client, tables, match } = setup({}, { failInsert: () => failing });
    const final = state("2026-10-26T10:40:00.000Z", [goal(GOAL_1)], "ended");
    const completion = { ...livePatch(final), status: "completed" as const };

    await expect(updateMatchStatus(client, "user-1", completion)).rejects.toMatchObject({ status: 500 });
    expect(match.status).toBe("live");

    failing = false;
    await updateMatchStatus(client, "user-1", completion);
    expect(match.status).toBe("completed");
    expect(goalRows(tables).map((row) => row.id)).toEqual([GOAL_1]);
  });

  it("a repeated completion leaves goals corrected after the match alone", async () => {
    const { client, tables } = setup();
    const final = state("2026-10-26T10:40:00.000Z", [goal(GOAL_1)], "ended");
    const completion = { ...livePatch(final), status: "completed" as const };
    await updateMatchStatus(client, "user-1", completion);

    // Corrected on the details page, then the device's retry arrives.
    Object.assign(goalRows(tables)[0], { primary_player_id: SCORER });
    await updateMatchStatus(client, "user-1", completion);

    expect(goalRows(tables)[0]).toMatchObject({ id: GOAL_1, primary_player_id: SCORER });
  });

  it("leaves goal rows alone for a state from an old device without UUID event ids", async () => {
    const { client, tables } = setup();
    tables.match_events.push({ id: GOAL_2, match_id: MATCH, type: "goal_for", minute: 3 });

    await updateMatchStatus(
      client,
      "user-1",
      livePatch(state("2026-10-26T10:05:00.000Z", [goal("event-1729-abc")]))
    );

    expect(goalRows(tables)).toEqual([{ id: GOAL_2, match_id: MATCH, type: "goal_for", minute: 3 }]);
  });

  it("without the database function, goal rows still follow the live state (previous writes)", async () => {
    const { client, tables } = setup({}, { noRpc: true });
    await updateMatchStatus(client, "user-1", livePatch(state("2026-10-26T10:05:00.000Z", [goal(GOAL_1), goal(GOAL_2)])));
    await updateMatchStatus(client, "user-1", livePatch(state("2026-10-26T10:06:00.000Z", [goal(GOAL_1)])));

    expect(goalRows(tables).map((row) => row.id)).toEqual([GOAL_1]);
  });
});

describe("overlapping requests (MATCH-02a)", () => {
  const older = state("2026-10-26T10:05:00.000Z", [goal(GOAL_1)]);
  const newer = state("2026-10-26T10:06:00.000Z", [
    goal(GOAL_1, { scorerPlayerId: SCORER, scorerName: "Emma" }),
    goal(GOAL_2, { minute: 6 }),
  ]);

  it.each([
    ["before its state is written", "update:matches"],
    ["before its goals are written", "rpc:sync_match_goal_events"],
  ])("an older send that started first but is held %s never overwrites the newer one", async (_label, op) => {
    const hold = holdAt(op);
    const { client, tables, match } = setup({}, { pause: hold.pause });

    const olderSend = updateMatchStatus(client, "user-1", livePatch(older));
    await hold.reached;
    // The newer state starts later and finishes while the older one waits.
    await updateMatchStatus(client, "user-1", livePatch(newer));
    hold.release();
    await olderSend;

    expect(match.runtime_state).toEqual(newer);
    expect(match.score_for).toBe(2);
    expect(goalRows(tables).map((row) => row.id).sort()).toEqual([GOAL_1, GOAL_2].sort());
    expect(goalRows(tables).find((row) => row.id === GOAL_1)).toMatchObject({ primary_player_id: SCORER });
  });

  const final = state("2026-10-26T10:40:00.000Z", [goal(GOAL_1)], "ended");
  const lateLive = state("2026-10-26T10:30:00.000Z", [goal(GOAL_1), goal(GOAL_2)]);
  const expectFinal = (tables: Record<string, Row[]>, match: Row) => {
    expect(match).toMatchObject({ status: "completed", runtime_state: final, score_for: 1 });
    expect(goalRows(tables).map((row) => row.id)).toEqual([GOAL_1]);
  };

  it("a live goal sync held past the completion changes no goals", async () => {
    const hold = holdAt("rpc:sync_match_goal_events");
    const { client, tables, match } = setup({}, { pause: hold.pause });

    // The live send has written its state and passed every check before its goals.
    const liveSend = updateMatchStatus(client, "user-1", livePatch(lateLive));
    await hold.reached;
    await updateMatchStatus(client, "user-1", { ...livePatch(final), status: "completed" });
    hold.release();
    await liveSend;

    expectFinal(tables, match);
  });

  it("a live send held while the completion is about to write neither overwrites the state nor adds goals", async () => {
    const liveHold = holdAt("update:matches", 1);
    // Hold the completion just before its one write (goals and completion together).
    const completionHold = holdAt("rpc:complete_match_with_goal_events");
    const { client, tables, match } = setup({}, { pause: pauses(liveHold, completionHold) });

    const liveSend = updateMatchStatus(client, "user-1", livePatch(lateLive));
    await liveHold.reached;
    const completion = updateMatchStatus(client, "user-1", { ...livePatch(final), status: "completed" });
    await completionHold.reached;
    liveHold.release();
    await liveSend;
    completionHold.release();
    await completion;

    expectFinal(tables, match);
  });

  it("a live goal sync held past a discard adds no goals", async () => {
    const hold = holdAt("rpc:sync_match_goal_events");
    const { client, tables, match } = setup({}, { pause: hold.pause });

    const liveSend = updateMatchStatus(client, "user-1", livePatch(lateLive));
    await hold.reached;
    await updateMatchStatus(client, "user-1", { matchId: MATCH, status: "completed", runtimeState: null });
    hold.release();
    await liveSend;

    expect(match).toMatchObject({ status: "completed", runtime_state: null });
    expect(goalRows(tables)).toHaveLength(0);
  });

  it.each([
    ["the first", "A"],
    ["the second", "B"],
  ])(
    "two completions with different final states: result, state and goals all come from the one that completes first (%s held)",
    async (_label, held) => {
      summaryMock.mockReset().mockResolvedValue({ result: { source: "ai", text: "Godt spilt." } });
      const hold = holdAt("rpc:complete_match_with_goal_events");
      const { client, tables, match } = setup({ report_enabled: true }, { pause: hold.pause });
      const finalA = state("2026-10-26T10:40:00.000Z", [goal(GOAL_1)], "ended");
      const finalB = state(
        "2026-10-26T10:41:00.000Z",
        [goal(GOAL_1, { scorerPlayerId: SCORER, scorerName: "Emma" }), goal(GOAL_2, { minute: 38 })],
        "ended"
      );
      const completionA = { ...livePatch(finalA), status: "completed" as const, endedAt: "2026-10-26T10:40:00.000Z" };
      const completionB = { ...livePatch(finalB), status: "completed" as const, endedAt: "2026-10-26T10:41:00.000Z" };
      const [first, second] = held === "A" ? [completionA, completionB] : [completionB, completionA];

      // Both have read the match open; the first is held just before its write.
      const firstSend = updateMatchStatus(client, "user-1", first);
      await hold.reached;
      const winner = await updateMatchStatus(client, "user-1", second);
      hold.release();
      const loser = await firstSend;

      const winningState = second.runtimeState as Row;
      expect(match).toMatchObject({
        status: "completed",
        runtime_state: winningState,
        score_for: (winningState.events as Row[]).length,
        ended_at: second.endedAt,
        report_status: "ready",
      });
      expect(goalRows(tables).map((row) => row.id).sort()).toEqual(
        (winningState.events as Row[]).map((event) => event.id).sort()
      );
      if (held === "A") {
        expect(goalRows(tables).find((row) => row.id === GOAL_1)).toMatchObject({ primary_player_id: SCORER });
      } else {
        expect(goalRows(tables).find((row) => row.id === GOAL_1)).toMatchObject({ primary_player_id: null });
      }
      // The losing completion is answered as the repeat it is: same result, no second report.
      expect(loser).toMatchObject({ endedAt: second.endedAt, scoreFor: winner.scoreFor });
      expect(summaryMock).toHaveBeenCalledTimes(1);
    }
  );
});
