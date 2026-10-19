// FP-P0 match lifecycle — reproduction tests. These encode the required
// invariant and FAIL on the current implementation; they are not a fix.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMatchSetup } from "@/domain/match";
import { createLiveMatchFromSetup, startLiveMatch } from "@/domain/liveMatch";
import { activateMatch } from "@/lib/storage/matchStorage";
import { saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import { resolveActiveMatch, resolveLocalActiveMatch } from "@/lib/match/activeMatchRecovery";

vi.mock("@/lib/server/ai/match-summary", () => ({
  generateMatchSummaryByMatchId: vi.fn(),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

describe("P0: banner identity vs the match this device is running", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("links the banner to the match this device runs, not to another live server row", () => {
    // Device runs match A (started yesterday, clock never stopped).
    const setup = createMatchSetup("team-1");
    activateMatch(setup, "match-A");
    saveStoredLiveMatch(startLiveMatch(createLiveMatchFromSetup(setup), Date.now() - DAY_MS));

    // Server also has match B as live (set by "Start match" on its details
    // page, never started on any device).
    const serverB = {
      id: "match-B",
      title: "Kamp – 15. okt 16:38",
      teamId: "team-1",
      status: "live",
      runtimeState: null,
    };

    const resolution = resolveActiveMatch(serverB, null, resolveLocalActiveMatch());

    // The live screen opens the stored setup's match (A) whatever the URL
    // says, so a banner naming and linking B points at a different match.
    expect(resolution.href).toBe("/match/live?matchId=match-A");
  });
});

// ─── Server: completed is terminal ───────────────────────────────────────────

type Row = Record<string, unknown>;

/** Minimal in-memory Supabase query builder for the calls service.ts makes. */
function fakeSupabase(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    const result = (single: boolean) => {
      const matched = rows();
      if (patch) matched.forEach((row) => Object.assign(row, patch));
      return Promise.resolve({ data: single ? matched[0] ?? null : matched, error: null });
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
  return { from } as never;
}

function completedMatchRow(): Row {
  return {
    id: "match-C",
    team_id: "team-1",
    title: "Kamp – 15. okt 12:31",
    opponent_name: null,
    starts_at: "2026-10-15T10:31:00.000Z",
    location: null,
    status: "completed",
    runtime_state: { status: "ended" },
    created_by: "user-1",
    created_at: "2026-10-15T10:31:00.000Z",
    updated_at: "2026-10-15T11:30:00.000Z",
    started_at: "2026-10-15T10:32:00.000Z",
    ended_at: "2026-10-15T11:30:00.000Z",
    format: "5v5",
    report_enabled: false,
    report_status: "not_requested",
    report_text: null,
    report_generated_at: null,
    score_for: 2,
    score_against: 1,
  };
}

describe("P0: a completed match stays completed on the server", () => {
  async function setup() {
    const { updateMatchStatus } = await import("@/lib/server/matches/service");
    const match = completedMatchRow();
    const supabase = fakeSupabase({
      matches: [match],
      team_members: [{ team_id: "team-1", user_id: "user-1" }],
      external_event_links: [],
    });
    return { updateMatchStatus, match, supabase };
  }

  it("refuses to move a completed match back to live", async () => {
    const { updateMatchStatus, match, supabase } = await setup();

    await updateMatchStatus(supabase, "user-1", { matchId: "match-C", status: "live" }).catch(() => undefined);

    expect(match.status).toBe("completed");
    expect(match.ended_at).toBe("2026-10-15T11:30:00.000Z");
  });

  it("does not let a late live-screen runtime sync overwrite a completed match's final state", async () => {
    const { updateMatchStatus, match, supabase } = await setup();

    // What the live screen's debounced runtime PATCH sends (no status).
    await updateMatchStatus(supabase, "user-1", {
      matchId: "match-C",
      runtimeState: { status: "running", events: [{ type: "substitution", minute: 1494 }] },
    }).catch(() => undefined);

    expect(match.runtime_state).toEqual({ status: "ended" });
  });
});
