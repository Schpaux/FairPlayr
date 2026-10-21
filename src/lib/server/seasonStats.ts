import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveMatchState } from "@/domain/liveMatch";

// Row shapes returned from Supabase queries in this file
interface CompletedMatchRow {
  id: string;
  opponent_name: string | null;
  starts_at: string;
  ended_at?: string | null;
  score_for?: number;
  score_against?: number;
  runtime_state?: Record<string, unknown> | null;
}

interface PlayerRow {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
}

interface TeamMemberRow {
  team_id: string;
}

interface UpcomingMatchRow {
  id: string;
  opponent_name: string | null;
  starts_at: string;
  location: string | null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SeasonStats {
  balance: number;
  spreadMinutes: number;
  totalMatches: number;
  matchesPlayed: number;
  needsMinutes: Array<{
    playerId: string;
    name: string;
    number: number | null;
    position: string | null;
    totalMinutes: number;
    deficitMinutes: number;
  }>;
  lastMatch: {
    matchId: string;
    opponent: string | null;
    scoreFor: number;
    scoreAgainst: number;
    when: string;
    result: "win" | "draw" | "loss";
  } | null;
}

export interface UpcomingMatch {
  matchId: string;
  opponent: string | null;
  startsAt: string;
  location: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isLiveMatchState(value: unknown): value is LiveMatchState {
  return (
    typeof value === "object" &&
    value !== null &&
    "playerAccumulatedMs" in value &&
    typeof (value as Record<string, unknown>).playerAccumulatedMs === "object"
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function getSeasonStats(
  supabase: SupabaseClient,
  teamId: string
): Promise<SeasonStats> {
  const { data: rows } = await supabase
    .from("matches")
    .select(
      "id, opponent_name, starts_at, ended_at, score_for, score_against, runtime_state"
    )
    .eq("team_id", teamId)
    .eq("status", "completed")
    .order("starts_at", { ascending: true })
    .returns<CompletedMatchRow[]>();

  const completed = rows ?? [];
  const matchesPlayed = completed.length;

  if (matchesPlayed === 0) {
    return {
      balance: 100,
      spreadMinutes: 0,
      totalMatches: 0,
      matchesPlayed: 0,
      needsMinutes: [],
      lastMatch: null,
    };
  }

  // Accumulate playtime per player (in seconds) across all completed matches.
  const playerSeconds = new Map<string, number>();

  for (const row of completed) {
    const state = row.runtime_state;
    if (!isLiveMatchState(state)) {
      continue;
    }

    const accumulated = state.playerAccumulatedMs as Record<string, number>;

    for (const [playerId, ms] of Object.entries(accumulated)) {
      if (typeof ms !== "number") {
        continue;
      }
      playerSeconds.set(playerId, (playerSeconds.get(playerId) ?? 0) + ms / 1000);
    }
  }

  const allSeconds = Array.from(playerSeconds.values());

  if (allSeconds.length === 0) {
    return {
      balance: 100,
      spreadMinutes: 0,
      totalMatches: matchesPlayed,
      matchesPlayed,
      needsMinutes: [],
      lastMatch: buildLastMatch(completed),
    };
  }

  const maxSeconds = Math.max(...allSeconds);
  const minSeconds = Math.min(...allSeconds);
  const avgSeconds = allSeconds.reduce((a, b) => a + b, 0) / allSeconds.length;

  const spreadSeconds = maxSeconds - minSeconds;
  const spreadMinutes = Math.round(spreadSeconds / 60);

  // balance = 100 when spread = 0, drops toward 0 as spread grows toward 600s (10min)
  const balance = clamp(Math.round(100 - (spreadSeconds / 600) * 100), 0, 100);

  // Fetch player names from team_members + players tables
  const playerIds = Array.from(playerSeconds.keys());

  const { data: playerRows } = await supabase
    .from("players")
    .select("id, name, number, position")
    .in("id", playerIds)
    .returns<PlayerRow[]>();

  const playerMeta = new Map(
    (playerRows ?? []).map((p) => [p.id, p])
  );

  // Identify players below avg * 0.85 threshold
  const threshold = avgSeconds * 0.85;

  const needsMinutes = playerIds
    .filter((id) => (playerSeconds.get(id) ?? 0) < threshold)
    .map((id) => {
      const totalSec = playerSeconds.get(id) ?? 0;
      const meta = playerMeta.get(id);
      return {
        playerId: id,
        name: meta?.name ?? id,
        number: meta?.number ?? null,
        position: meta?.position ?? null,
        totalMinutes: Math.round(totalSec / 60),
        deficitMinutes: Math.round((threshold - totalSec) / 60),
      };
    })
    .sort((a, b) => a.totalMinutes - b.totalMinutes)
    .slice(0, 3);

  return {
    balance,
    spreadMinutes,
    totalMatches: matchesPlayed,
    matchesPlayed,
    needsMinutes,
    lastMatch: buildLastMatch(completed),
  };
}

function buildLastMatch(
  completed: Array<{
    id: string;
    opponent_name: string | null;
    starts_at: string;
    score_for?: number;
    score_against?: number;
    ended_at?: string | null;
  }>
) {
  const last = completed[completed.length - 1];
  if (!last) return null;

  const scoreFor = last.score_for ?? 0;
  const scoreAgainst = last.score_against ?? 0;

  const result: "win" | "draw" | "loss" =
    scoreFor > scoreAgainst ? "win" : scoreFor < scoreAgainst ? "loss" : "draw";

  return {
    matchId: last.id,
    opponent: last.opponent_name ?? null,
    scoreFor,
    scoreAgainst,
    when: last.ended_at ?? last.starts_at,
    result,
  };
}

// ─── Upcoming match helper ────────────────────────────────────────────────────

export async function getUpcomingMatch(
  supabase: SupabaseClient,
  teamId: string
): Promise<UpcomingMatch | null> {
  const { data } = await supabase
    .from("matches")
    .select("id, opponent_name, starts_at, location")
    .eq("team_id", teamId)
    .in("status", ["upcoming", "draft"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .returns<UpcomingMatchRow[]>();

  const row = data?.[0];
  if (!row) return null;

  return {
    matchId: row.id,
    opponent: row.opponent_name,
    startsAt: row.starts_at,
    location: row.location,
  };
}

// ─── Home summary (GET /api/home/summary) ─────────────────────────────────────

export interface HomeSummary {
  teamId: string;
  stats: SeasonStats | null;
  upcoming: UpcomingMatch | null;
}

export type HomeSummaryResult =
  | { status: "ok"; summary: HomeSummary }
  | { status: "forbidden" };

/**
 * True when `userId` is a member of `teamId`; the same query as
 * `requireTeamMembership` in `src/lib/server/matches/service.ts`. Throws when
 * the lookup itself fails, so a database error is never read as "member".
 */
export async function isTeamMember(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle<TeamMemberRow>();

  if (error) {
    throw new Error(`Team membership lookup failed: ${error.message}`);
  }

  return data !== null;
}

/**
 * Season stats and the next fixture for Home, for members of the team only.
 * Each part degrades to null on its own error, as Home did when it rendered
 * them on the server.
 */
export async function getHomeSummary(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<HomeSummaryResult> {
  if (!(await isTeamMember(supabase, userId, teamId))) {
    return { status: "forbidden" };
  }

  const [stats, upcoming] = await Promise.all([
    getSeasonStats(supabase, teamId).catch(() => null),
    getUpcomingMatch(supabase, teamId).catch(() => null),
  ]);

  return { status: "ok", summary: { teamId, stats, upcoming } };
}
