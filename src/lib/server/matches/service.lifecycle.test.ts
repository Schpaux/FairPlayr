// FP-P0-F2: server-side lifecycle rules in updateMatchStatus.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const summaryMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/ai/match-summary", () => ({
  generateMatchSummaryByMatchId: summaryMock,
}));

import { updateMatchStatus } from "@/lib/server/matches/service";

type Row = Record<string, unknown>;

/**
 * Minimal in-memory Supabase for the calls updateMatchStatus makes. Reads
 * return copies; `afterRead` runs after each read of `matches`, so a test can
 * change the row between the service's read and its write.
 */
function fakeSupabase(tables: Record<string, Row[]>, afterRead?: () => void) {
  const writes: Row[] = [];
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    const result = (single: boolean) => {
      const matched = rows();
      if (patch) {
        matched.forEach((row) => Object.assign(row, patch));
        writes.push(patch);
      } else if (table === "matches") {
        queueMicrotask(() => afterRead?.());
      }
      const copies = matched.map((row) => ({ ...row }));
      return Promise.resolve({ data: single ? copies[0] ?? null : copies, error: null });
    };
    const builder = {
      select: () => builder,
      update: (payload: Row) => {
        patch = payload;
        return builder;
      },
      eq: (col: string, value: unknown) => (filters.push((row) => row[col] === value), builder),
      neq: (col: string, value: unknown) => (filters.push((row) => row[col] !== value), builder),
      in: (col: string, values: unknown[]) => (filters.push((row) => values.includes(row[col])), builder),
      not: (col: string, _op: string, value: unknown) => (filters.push((row) => row[col] !== value), builder),
      order: () => builder,
      limit: () => builder,
      returns: () => builder,
      maybeSingle: () => result(true),
      single: () => result(true),
      then: (resolve: (value: unknown) => unknown) => result(false).then(resolve),
    };
    return builder;
  };
  return { client: { from } as never, writes };
}

const ENDED_AT = "2026-10-15T11:30:00.000Z";
const FINAL_STATE = { status: "ended", events: [{ type: "goal", minute: 12 }], playerAccumulatedMs: { p1: 1_200_000 } };

function matchRow(overrides: Row = {}): Row {
  return {
    id: "match-1",
    team_id: "team-1",
    title: "Kamp – 15. okt 12:31",
    opponent_name: null,
    starts_at: "2026-10-15T10:31:00.000Z",
    location: null,
    status: "completed",
    runtime_state: FINAL_STATE,
    created_by: "user-1",
    created_at: "2026-10-15T10:31:00.000Z",
    updated_at: ENDED_AT,
    started_at: "2026-10-15T10:32:00.000Z",
    ended_at: ENDED_AT,
    format: "5v5",
    report_enabled: false,
    report_status: "not_requested",
    report_text: null,
    report_generated_at: null,
    score_for: 2,
    score_against: 1,
    ...overrides,
  };
}

function setup(row: Row, afterRead?: (row: Row) => void) {
  const { client, writes } = fakeSupabase(
    {
      matches: [row],
      team_members: [{ team_id: "team-1", user_id: "user-1" }],
      external_event_links: [],
    },
    afterRead ? () => afterRead(row) : undefined
  );
  return { client, writes };
}

async function expectRejected(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ code: "MATCH_COMPLETED", status: 409 });
}

describe("updateMatchStatus on a completed match", () => {
  beforeEach(() => {
    summaryMock.mockReset();
  });

  it.each(["live", "draft", "upcoming"] as const)("rejects completed → %s with 409 and writes nothing", async (status) => {
    const row = matchRow();
    const { client, writes } = setup(row);

    await expectRejected(updateMatchStatus(client, "user-1", { matchId: "match-1", status }));

    expect(writes).toEqual([]);
    expect(row).toMatchObject({ status: "completed", ended_at: ENDED_AT, runtime_state: FINAL_STATE });
  });

  it("rejects a stale score write so the final result stays", async () => {
    const row = matchRow();
    const { client } = setup(row);

    await expectRejected(updateMatchStatus(client, "user-1", { matchId: "match-1", scoreFor: 0, scoreAgainst: 0 }));

    expect(row).toMatchObject({ score_for: 2, score_against: 1 });
  });

  it("accepts a duplicate completion retry and keeps the original end time", async () => {
    const row = matchRow();
    const { client } = setup(row);
    const body = { matchId: "match-1", status: "completed" as const, scoreFor: 2, scoreAgainst: 1, runtimeState: FINAL_STATE };

    const first = await updateMatchStatus(client, "user-1", body);
    const second = await updateMatchStatus(client, "user-1", body);

    expect(first.status).toBe("completed");
    expect(second).toMatchObject({ status: "completed", endedAt: ENDED_AT, scoreFor: 2, scoreAgainst: 1 });
    expect(row.runtime_state).toEqual(FINAL_STATE);
  });

  it("stores the device's final state when it arrives after a server-only finish", async () => {
    const row = matchRow({ runtime_state: null, score_for: 0, score_against: 0 });
    const { client } = setup(row);

    await updateMatchStatus(client, "user-1", {
      matchId: "match-1",
      status: "completed",
      scoreFor: 2,
      scoreAgainst: 1,
      runtimeState: FINAL_STATE,
    });

    expect(row).toMatchObject({ runtime_state: FINAL_STATE, score_for: 2, score_against: 1, ended_at: ENDED_AT });
  });

  it("ignores a recovery close (runtime cleared) on an already completed match", async () => {
    const row = matchRow();
    const { client } = setup(row);

    await updateMatchStatus(client, "user-1", { matchId: "match-1", status: "completed", runtimeState: null, reportStatus: "failed" });

    expect(row.runtime_state).toEqual(FINAL_STATE);
    expect(row.status).toBe("completed");
  });

  it("still regenerates the report on request", async () => {
    summaryMock.mockResolvedValue({ result: { source: "ai", text: "Godt spilt." } });
    const row = matchRow({ report_enabled: true, report_status: "failed" });
    const { client } = setup(row);

    const match = await updateMatchStatus(client, "user-1", { matchId: "match-1", status: "completed", reportEnabled: true });

    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(match).toMatchObject({ status: "completed", reportStatus: "ready", reportText: "Godt spilt.", endedAt: ENDED_AT });
  });
});

describe("updateMatchStatus while a completion lands", () => {
  it("drops a runtime sync whose read raced a completion (the update itself is conditional)", async () => {
    const row = matchRow({ status: "live", ended_at: null, runtime_state: { status: "running" } });
    // The completion commits after the stale request has read the row as live.
    const { client } = setup(row, (r) => {
      if (r.status === "live") {
        Object.assign(r, { status: "completed", ended_at: ENDED_AT, runtime_state: FINAL_STATE, score_for: 2, score_against: 1 });
      }
    });

    await expectRejected(
      updateMatchStatus(client, "user-1", {
        matchId: "match-1",
        runtimeState: { status: "running", events: [{ type: "substitution", minute: 1494 }] },
        scoreFor: 0,
        scoreAgainst: 0,
      })
    );

    expect(row).toMatchObject({ status: "completed", runtime_state: FINAL_STATE, score_for: 2, score_against: 1 });
  });

  it("lets a normal runtime sync through on a live match", async () => {
    const row = matchRow({ status: "live", ended_at: null, runtime_state: null });
    const { client } = setup(row);
    const running = { status: "running", events: [] };

    await updateMatchStatus(client, "user-1", { matchId: "match-1", runtimeState: running, scoreFor: 1, scoreAgainst: 0 });

    expect(row).toMatchObject({ status: "live", runtime_state: running, score_for: 1 });
  });

  it("completes a live match and stamps the end", async () => {
    const row = matchRow({ status: "live", ended_at: null, runtime_state: { status: "running" } });
    const { client } = setup(row);

    await updateMatchStatus(client, "user-1", {
      matchId: "match-1",
      status: "completed",
      scoreFor: 3,
      scoreAgainst: 1,
      runtimeState: FINAL_STATE,
    });

    expect(row).toMatchObject({ status: "completed", runtime_state: FINAL_STATE, score_for: 3 });
    expect(typeof row.ended_at).toBe("string");
  });
});

describe("updateMatchStatus keeps the device's end time (offline completion)", () => {
  // The coach ended the match at 18:30 Oslo time; it synced the next morning.
  const DEVICE_ENDED_AT = "2026-10-15T16:30:00.000Z";
  const NEXT_MORNING = "2026-10-16T06:05:00.000Z";
  const ENDED_STATE = { ...FINAL_STATE, endedAt: DEVICE_ENDED_AT };

  beforeEach(() => {
    summaryMock.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NEXT_MORNING));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function liveRow() {
    return matchRow({ status: "live", ended_at: null, started_at: "2026-10-15T15:30:00.000Z", runtime_state: { status: "running" } });
  }

  const completion = (endedAt?: string) => ({
    matchId: "match-1",
    status: "completed" as const,
    scoreFor: 2,
    scoreAgainst: 1,
    reportEnabled: false,
    runtimeState: ENDED_STATE,
    ...(endedAt === undefined ? {} : { endedAt }),
  });

  it("stores the sent end time, not the sync time", async () => {
    const row = liveRow();
    const { client } = setup(row);

    const match = await updateMatchStatus(client, "user-1", completion(DEVICE_ENDED_AT));

    expect(row.ended_at).toBe(DEVICE_ENDED_AT);
    expect(match.endedAt).toBe(DEVICE_ENDED_AT);
  });

  it("uses the ended state's end time when an older client sends none", async () => {
    const row = liveRow();
    const { client } = setup(row);

    await updateMatchStatus(client, "user-1", completion());

    expect(row.ended_at).toBe(DEVICE_ENDED_AT);
  });

  it("a later retry with another end time never replaces the stored one", async () => {
    const row = liveRow();
    const { client } = setup(row);

    await updateMatchStatus(client, "user-1", completion(DEVICE_ENDED_AT));
    vi.setSystemTime(new Date("2026-10-16T09:00:00.000Z"));
    await updateMatchStatus(client, "user-1", completion("2026-10-16T09:00:00.000Z"));
    await updateMatchStatus(client, "user-1", completion());

    expect(row.ended_at).toBe(DEVICE_ENDED_AT);
  });

  it("finishing another device's match from its page still stamps now", async () => {
    const row = liveRow();
    const { client } = setup(row);

    await updateMatchStatus(client, "user-1", { matchId: "match-1", status: "completed" });

    expect(row.ended_at).toBe(NEXT_MORNING);
  });
});

describe("updateMatchStatus does not regenerate the report for a replayed completion", () => {
  const READY = { report_enabled: true, report_status: "ready", report_text: "Godt spilt.", report_generated_at: ENDED_AT };
  const replay = {
    matchId: "match-1",
    status: "completed" as const,
    scoreFor: 2,
    scoreAgainst: 1,
    reportEnabled: true,
    runtimeState: FINAL_STATE,
    endedAt: ENDED_AT,
  };

  beforeEach(() => {
    summaryMock.mockReset();
    summaryMock.mockResolvedValue({ result: { source: "ai", text: "Ny tekst." } });
  });

  it.each(["ready", "pending", "failed"])("leaves a %s report untouched on a retry", async (reportStatus) => {
    const row = matchRow({ ...READY, report_status: reportStatus });
    const { client } = setup(row);

    const match = await updateMatchStatus(client, "user-1", replay);

    expect(summaryMock).not.toHaveBeenCalled();
    expect(row).toMatchObject({ report_status: reportStatus, report_text: "Godt spilt.", report_generated_at: ENDED_AT });
    expect(match).toMatchObject({ status: "completed", scoreFor: 2, scoreAgainst: 1, endedAt: ENDED_AT });
  });

  it("a stale retry with reports off does not clear an existing report", async () => {
    const row = matchRow(READY);
    const { client } = setup(row);

    await updateMatchStatus(client, "user-1", { ...replay, reportEnabled: false });

    expect(row).toMatchObject({ report_enabled: true, report_status: "ready", report_text: "Godt spilt." });
  });

  it("the report button still regenerates a ready report", async () => {
    const row = matchRow(READY);
    const { client } = setup(row);

    const match = await updateMatchStatus(client, "user-1", { matchId: "match-1", status: "completed", reportEnabled: true });

    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(match).toMatchObject({ reportStatus: "ready", reportText: "Ny tekst." });
  });

  it("generates once when the device's real result reaches a server-only finish", async () => {
    const row = matchRow({ ...READY, runtime_state: { status: "running" }, score_for: 0, score_against: 0 });
    const { client } = setup(row);

    await updateMatchStatus(client, "user-1", replay);
    await updateMatchStatus(client, "user-1", replay);

    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ runtime_state: FINAL_STATE, score_for: 2, report_text: "Ny tekst." });
  });

  it("a genuinely new completion generates the report exactly once, then retries do not", async () => {
    const row = matchRow({ status: "live", ended_at: null, runtime_state: { status: "running" }, report_enabled: true, report_status: "not_requested", report_text: null, report_generated_at: null });
    const { client } = setup(row);

    await updateMatchStatus(client, "user-1", replay);
    await updateMatchStatus(client, "user-1", replay);
    await updateMatchStatus(client, "user-1", replay);

    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: "completed", report_status: "ready", report_text: "Ny tekst." });
  });
});

describe("updateMatchStatus under concurrent completions", () => {
  beforeEach(() => {
    summaryMock.mockReset();
    summaryMock.mockResolvedValue({ result: { source: "ai", text: "Godt spilt." } });
  });

  it("two completions that both read the match as live perform one transition and one report", async () => {
    const row = matchRow({ status: "live", ended_at: null, runtime_state: { status: "running" }, report_enabled: true, report_status: "not_requested" });
    const { client } = setup(row);
    const body = (endedAt: string) => ({
      matchId: "match-1",
      status: "completed" as const,
      scoreFor: 2,
      scoreAgainst: 1,
      reportEnabled: true,
      runtimeState: FINAL_STATE,
      endedAt,
    });

    const [first, second] = await Promise.all([
      updateMatchStatus(client, "user-1", body("2026-10-15T11:30:00.000Z")),
      updateMatchStatus(client, "user-1", body("2026-10-15T11:31:00.000Z")),
    ]);

    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(row.ended_at).toBe("2026-10-15T11:30:00.000Z");
    expect(first.status).toBe("completed");
    expect(second).toMatchObject({ status: "completed", endedAt: "2026-10-15T11:30:00.000Z" });
  });

  it("a stale runtime write racing a completion loses, whichever lands first", async () => {
    const row = matchRow({ status: "live", ended_at: null, runtime_state: { status: "running" } });
    const { client } = setup(row);

    const results = await Promise.allSettled([
      updateMatchStatus(client, "user-1", { matchId: "match-1", status: "completed", scoreFor: 2, scoreAgainst: 1, runtimeState: FINAL_STATE, endedAt: ENDED_AT }),
      updateMatchStatus(client, "user-1", { matchId: "match-1", runtimeState: { status: "running", events: [] }, scoreFor: 0, scoreAgainst: 0 }),
    ]);

    expect(results[0].status).toBe("fulfilled");
    expect(row).toMatchObject({ status: "completed", runtime_state: FINAL_STATE, score_for: 2, score_against: 1 });
  });
});

// MATCH-14: a planned (or Spond) row is created with the column default
// "5v5"; the format the match was played in comes with its state.
describe("updateMatchStatus keeps the played format", () => {
  beforeEach(() => {
    summaryMock.mockReset();
  });

  it("stores the state's format when a planned 5v5 row is completed as 7v7", async () => {
    const row = matchRow({ status: "live", ended_at: null, runtime_state: null, format: "5v5" });
    const { client } = setup(row);

    const match = await updateMatchStatus(client, "user-1", {
      matchId: "match-1",
      status: "completed",
      runtimeState: { ...FINAL_STATE, format: "7v7" },
    });

    expect(row.format).toBe("7v7");
    expect(match.format).toBe("7v7");
  });

  it("leaves the stored format alone when the state has none (older matches)", async () => {
    const row = matchRow({ status: "live", ended_at: null, runtime_state: null, format: "9v9" });
    const { client, writes } = setup(row);

    await updateMatchStatus(client, "user-1", { matchId: "match-1", status: "completed", runtimeState: FINAL_STATE });

    expect(row.format).toBe("9v9");
    expect(writes.some((write) => "format" in write)).toBe(false);
  });
});
