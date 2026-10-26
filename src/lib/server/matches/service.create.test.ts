// MATCH-13: a match created with a device-chosen id is created once; a
// repeat (lost answer, retry) gets the row that already exists.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/ai/match-summary", () => ({
  generateMatchSummaryByMatchId: vi.fn(),
}));

import { createManualMatch } from "@/lib/server/matches/service";

type Row = Record<string, unknown>;

/** In-memory Supabase for createManualMatch: `matches.id` is a primary key. */
function fakeSupabase(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let inserted: Row | null = null;
    const result = () => {
      if (inserted) {
        const rows = (tables[table] ??= []);
        if (rows.some((row) => row.id === inserted!.id)) {
          return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key value" } });
        }
        const row = { id: `server-${rows.length + 1}`, created_at: "now", updated_at: "now", ...inserted };
        rows.push(row);
        return Promise.resolve({ data: { ...row }, error: null });
      }
      const match = (tables[table] ?? []).find((row) => filters.every((f) => f(row)));
      return Promise.resolve({ data: match ? { ...match } : null, error: null });
    };
    const builder = {
      insert: (payload: Row) => ((inserted = payload), builder),
      select: () => builder,
      eq: (col: string, value: unknown) => (filters.push((row) => row[col] === value), builder),
      maybeSingle: result,
      single: result,
    };
    return builder;
  };
  return { from } as never;
}

const MATCH_A = "0b6f4d1e-2c3a-4b5d-8e6f-7a8b9c0d1e2f";
const INPUT = {
  id: MATCH_A,
  teamId: "team-1",
  title: "Kamp – 25. okt 10:52",
  startsAt: "2026-10-25T09:52:00.000Z",
  startedAt: "2026-10-25T09:52:00.000Z",
  format: "7v7" as const,
  reportEnabled: true,
  status: "live" as const,
};

function tables() {
  return {
    matches: [] as Row[],
    team_members: [
      { team_id: "team-1", user_id: "user-1" },
      { team_id: "team-2", user_id: "user-1" },
    ],
    external_event_links: [] as Row[],
  };
}

describe("createManualMatch with a device-chosen id", () => {
  it("creates the row once and answers a repeat with the same row", async () => {
    const db = tables();
    const supabase = fakeSupabase(db);

    const first = await createManualMatch(supabase, "user-1", INPUT);
    const repeat = await createManualMatch(supabase, "user-1", { ...INPUT, status: "draft" });

    expect(db.matches).toHaveLength(1);
    expect(db.matches[0]).toMatchObject({ id: MATCH_A, started_at: INPUT.startedAt, status: "live" });
    expect(first.id).toBe(MATCH_A);
    // The repeat changes nothing on the existing row.
    expect(repeat).toMatchObject({ id: MATCH_A, status: "live" });
  });

  it("refuses an id that belongs to another team's match", async () => {
    const db = tables();
    const supabase = fakeSupabase(db);
    await createManualMatch(supabase, "user-1", INPUT);

    await expect(createManualMatch(supabase, "user-1", { ...INPUT, teamId: "team-2" })).rejects.toMatchObject({
      code: "MATCH_ID_CONFLICT",
      status: 409,
    });
    expect(db.matches).toHaveLength(1);
  });
});
