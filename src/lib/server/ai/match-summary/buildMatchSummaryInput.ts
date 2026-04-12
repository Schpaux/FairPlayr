import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IntegrationError } from "@/lib/server/integrations/spond/errors";
import type { MatchEventItem, MatchEventRow, MatchRow } from "@/lib/server/matches/types";
import type {
  MatchSummaryInput,
  MatchSummaryPlayerTime,
  MatchSummarySubstitution,
} from "@/lib/server/ai/match-summary/types";

const MATCH_SELECT =
  "id, team_id, title, opponent_name, starts_at, format, score_for, score_against, runtime_state";
const MATCH_EVENT_SELECT =
  "id, match_id, type, minute, timestamp_ms, team_side, primary_player_id, secondary_player_id, payload, created_at, updated_at";

interface TeamNameRow {
  id: string;
  name: string;
}

interface PlayerRow {
  id: string;
  name: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function requireTeamMembership(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle<{ team_id: string }>();

  if (error) {
    throw new IntegrationError("TEAM_LOOKUP_FAILED", error.message, 500);
  }

  if (!data) {
    throw new IntegrationError("TEAM_NOT_FOUND", "Du har ikke tilgang til dette laget.", 404);
  }
}

function mapMatchEvents(rows: MatchEventRow[]): MatchEventItem[] {
  return rows.map((row) => ({
    id: row.id,
    matchId: row.match_id,
    type: row.type,
    minute: row.minute,
    timestampMs: row.timestamp_ms,
    teamSide: row.team_side,
    primaryPlayerId: row.primary_player_id,
    secondaryPlayerId: row.secondary_player_id,
    payload: row.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function resolveMinute(event: MatchEventItem): number | null {
  if (typeof event.minute === "number") {
    return Math.max(0, Math.floor(event.minute));
  }

  if (typeof event.timestampMs === "number") {
    return Math.max(0, Math.floor(event.timestampMs / 60000));
  }

  return null;
}

function payloadName(payload: Record<string, unknown> | null, key: string): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Extract substitutions from runtime_state.events (domain format).
 * Domain SubstitutionMatchEvent fields: type, inPlayerName, outPlayerName, minute, timestampMs
 */
function extractSubstitutionsFromRuntimeEvents(events: unknown[]): MatchSummarySubstitution[] {
  return events
    .filter((e) => isRecord(e) && e.type === "substitution")
    .map((e) => {
      const event = e as Record<string, unknown>;
      const timestampMs = safeNumber(event.timestampMs);
      const minuteFromTs =
        timestampMs !== null ? Math.max(0, Math.floor(timestampMs / 60000)) : null;
      return {
        minute: safeNumber(event.minute) ?? minuteFromTs,
        playerInName: safeString(event.inPlayerName),
        playerOutName: safeString(event.outPlayerName),
      };
    });
}

/**
 * Extract substitutions from server match_events as a fallback.
 */
function extractSubstitutionsFromServerEvents(
  events: MatchEventItem[]
): MatchSummarySubstitution[] {
  return events
    .filter((e) => e.type === "substitution")
    .map((e) => ({
      minute: resolveMinute(e),
      playerInName:
        payloadName(e.payload, "inPlayerName") ?? payloadName(e.payload, "primaryPlayerName"),
      playerOutName:
        payloadName(e.payload, "outPlayerName") ?? payloadName(e.payload, "secondaryPlayerName"),
    }));
}

/**
 * Compute per-player playing times from runtime_state.playerAccumulatedMs.
 * Keys are player IDs; values are accumulated milliseconds of on-field time.
 * Falls back gracefully if the field is missing or malformed.
 */
function extractPlayerTimesFromRuntimeState(
  runtimeState: Record<string, unknown> | null,
  playerNameMap: Map<string, string>
): MatchSummaryPlayerTime[] {
  if (!runtimeState) return [];

  const accumulated = runtimeState.playerAccumulatedMs;
  if (!isRecord(accumulated)) return [];

  return Object.entries(accumulated)
    .map(([playerId, ms]) => {
      const name = playerNameMap.get(playerId);
      const minutes = Math.round((safeNumber(ms) ?? 0) / 60000);
      return name && minutes > 0 ? { playerName: name, minutesPlayed: minutes } : null;
    })
    .filter((entry): entry is MatchSummaryPlayerTime => entry !== null)
    .sort((a, b) => b.minutesPlayed - a.minutesPlayed);
}

/**
 * Derive match duration in minutes from runtime_state.durationSeconds.
 * This is the *scheduled* full match duration, not elapsed time.
 */
function extractMatchDurationMinutes(runtimeState: Record<string, unknown> | null): number | null {
  if (!runtimeState) return null;
  const seconds = safeNumber(runtimeState.durationSeconds);
  return seconds !== null ? Math.round(seconds / 60) : null;
}

export async function buildMatchSummaryInput(
  supabase: SupabaseClient,
  userId: string,
  matchId: string
): Promise<MatchSummaryInput> {
  const { data: matchRow, error: matchError } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .eq("id", matchId)
    .maybeSingle<MatchRow>();

  if (matchError) {
    throw new IntegrationError("MATCH_READ_FAILED", matchError.message, 500);
  }

  if (!matchRow) {
    throw new IntegrationError("MATCH_NOT_FOUND", "Fant ikke kampen.", 404);
  }

  await requireTeamMembership(supabase, userId, matchRow.team_id);

  // Fetch events and players in parallel
  const [eventsResult, playersResult, teamResult] = await Promise.all([
    supabase
      .from("match_events")
      .select(MATCH_EVENT_SELECT)
      .eq("match_id", matchId)
      .order("timestamp_ms", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .returns<MatchEventRow[]>(),

    supabase
      .from("players")
      .select("id, name")
      .eq("team_id", matchRow.team_id)
      .eq("is_active", true)
      .returns<PlayerRow[]>(),

    supabase
      .from("teams")
      .select("id, name")
      .eq("id", matchRow.team_id)
      .maybeSingle<TeamNameRow>(),
  ]);

  if (eventsResult.error) {
    throw new IntegrationError("MATCH_EVENTS_READ_FAILED", eventsResult.error.message, 500);
  }

  if (teamResult.error) {
    throw new IntegrationError("MATCH_TEAM_READ_FAILED", teamResult.error.message, 500);
  }

  const events = mapMatchEvents(eventsResult.data ?? []);
  const team = teamResult.data;

  // Build player name lookup from DB players (authoritative names)
  const playerNameMap = new Map<string, string>(
    (playersResult.data ?? []).map((p) => [p.id, p.name])
  );

  const runtimeState = isRecord(matchRow.runtime_state) ? matchRow.runtime_state : null;

  // Goals
  const goalsFor = events
    .filter((event) => event.type === "goal_for")
    .map((event) => ({
      minute: resolveMinute(event),
      scorerName: payloadName(event.payload, "primaryPlayerName"),
      assistName: payloadName(event.payload, "secondaryPlayerName"),
    }));

  const goalsAgainst = events
    .filter((event) => event.type === "goal_against")
    .map((event) => ({
      minute: resolveMinute(event),
    }));

  // Substitutions — prefer runtime_state.events (domain model, richer) over server events
  const runtimeEvents = Array.isArray(runtimeState?.events) ? runtimeState.events as unknown[] : [];
  const runtimeSubs = extractSubstitutionsFromRuntimeEvents(runtimeEvents);
  const substitutions =
    runtimeSubs.length > 0
      ? runtimeSubs
      : extractSubstitutionsFromServerEvents(events);

  // Player times — derived from live match accumulated time tracking
  const playerTimes = extractPlayerTimesFromRuntimeState(runtimeState, playerNameMap);
  const playersUsed = playerTimes.length;

  // Match duration from live match setup
  const matchDurationMinutes = extractMatchDurationMinutes(runtimeState);

  return {
    matchId,
    teamName: team?.name?.trim() || matchRow.title || "Laget",
    opponentName: matchRow.opponent_name?.trim() || "Motstanderen",
    dateTime: matchRow.starts_at ?? null,
    format: matchRow.format ?? null,
    matchDurationMinutes,
    scoreFor: Math.max(0, Math.floor(matchRow.score_for ?? 0)),
    scoreAgainst: Math.max(0, Math.floor(matchRow.score_against ?? 0)),
    goalsFor,
    goalsAgainst,
    substitutions,
    playersUsed,
    playerTimes,
  };
}
