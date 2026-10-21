// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const TEAM_ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const USER_ID = "user-1";

interface TableResult {
  data: unknown;
  error: { message: string } | null;
}

/** Per-table results for the fake Supabase client below. */
let tables: Record<string, TableResult>;
let user: { id: string } | null;
let calls: Array<{ table: string; filters: Array<[string, string, unknown]> }>;

/** A minimal chainable stand-in for a PostgREST query. */
function query(table: string) {
  const record = { table, filters: [] as Array<[string, string, unknown]> };
  calls.push(record);
  const result = () => Promise.resolve(tables[table] ?? { data: null, error: null });
  const builder: Record<string, unknown> = {
    then: (resolve: (value: TableResult) => unknown, reject: (reason: unknown) => unknown) =>
      result().then(resolve, reject),
    maybeSingle: () => result(),
  };
  for (const method of ["select", "eq", "in", "gte", "order", "limit", "returns"]) {
    builder[method] = (column?: string, value?: unknown) => {
      if (method === "eq" || method === "in" || method === "gte") {
        record.filters.push([method, column as string, value]);
      }
      return builder;
    };
  }
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () =>
        user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "no session" } },
    },
    from: (table: string) => query(table),
  }),
}));

const { GET } = await import("./route");

function request(teamId: string | null = TEAM_ID) {
  const url = new URL("http://localhost/api/home/summary");
  if (teamId !== null) url.searchParams.set("teamId", teamId);
  return new Request(url);
}

beforeEach(() => {
  user = { id: USER_ID };
  calls = [];
  tables = {
    team_members: { data: { team_id: TEAM_ID }, error: null },
    matches: { data: [], error: null },
    players: { data: [], error: null },
  };
});

describe("GET /api/home/summary", () => {
  it("returns 401 when not signed in, without touching team data", async () => {
    user = null;
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(calls).toEqual([]);
  });

  it("returns 400 for a missing or malformed team id", async () => {
    for (const teamId of [null, "", "team-e2e", "1; drop table"]) {
      const response = await GET(request(teamId));
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });

  it("returns 403 when the user is not a member of the team, and reads no matches", async () => {
    tables.team_members = { data: null, error: null };
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(calls.map((call) => call.table)).toEqual(["team_members"]);
    expect(calls[0].filters).toEqual([
      ["eq", "team_id", TEAM_ID],
      ["eq", "user_id", USER_ID],
    ]);
  });

  it("returns 500 without the database message when the membership lookup fails", async () => {
    tables.team_members = { data: null, error: { message: "secret internal detail" } };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request());
    spy.mockRestore();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(JSON.stringify(await response.json())).not.toContain("secret internal detail");
  });

  it("returns 200 with stats and the next fixture for a member, marked no-store", async () => {
    tables.matches = {
      data: [
        {
          id: "m1",
          opponent_name: "Skeid",
          starts_at: "2026-10-01T10:00:00.000Z",
          ended_at: "2026-10-01T11:00:00.000Z",
          score_for: 3,
          score_against: 1,
          runtime_state: { playerAccumulatedMs: { p1: 40 * 60_000, p2: 20 * 60_000 } },
          location: null,
        },
      ],
      error: null,
    };
    tables.players = {
      data: [
        { id: "p1", name: "Frida Berg", number: 1, position: null },
        { id: "p2", name: "Ida Ruud", number: 2, position: null },
      ],
      error: null,
    };

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    const body = await response.json();
    expect(body.teamId).toBe(TEAM_ID);
    expect(body.stats.matchesPlayed).toBe(1);
    expect(body.stats.lastMatch).toMatchObject({ scoreFor: 3, scoreAgainst: 1, result: "win" });
    expect(body.stats.needsMinutes.map((p: { name: string }) => p.name)).toEqual(["Ida Ruud"]);
    expect(calls.every((call) => call.table !== "matches" || call.filters.some(([, col, val]) => col === "team_id" && val === TEAM_ID))).toBe(true);
  });
});
