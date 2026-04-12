import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IntegrationError } from "@/lib/server/integrations/spond/errors";
import type { MatchEventItem, MatchEventRow, MatchRow } from "@/lib/server/matches/types";
import type {
  MatchSummaryEvent,
  MatchSummaryInput,
  MatchSummaryPlayerTime,
  MatchSummaryPlayerUsed,
  MatchSummaryStartingPlayer,
  MatchSummarySubstitution,
} from "@/lib/server/ai/match-summary/types";

const MATCH_SELECT =
  "id, team_id, title, opponent_name, starts_at, location, format, score_for, score_against, runtime_state";
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
 * Returns only players with ms > 0 and a known name.
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

interface UsedPlayersResult {
  startingPlayers: MatchSummaryStartingPlayer[];
  playersUsedList: MatchSummaryPlayerUsed[];
  playersUsed: number;
}

/**
 * Compute the set of players who appeared in the match using a union of three sources:
 *   1. initialOnFieldPlayerIds — players who started (stable snapshot taken at match creation)
 *   2. Substitution events — player IDs who came on (inPlayerId)
 *   3. playerAccumulatedMs — player IDs with tracked time > 0
 *
 * This ensures playersUsed is never incorrectly low due to missing time tracking
 * or incomplete runtime state. Player names are resolved from the DB map first,
 * then supplemented by names embedded in runtime substitution events.
 */
function extractStartingAndUsedPlayers(
  runtimeState: Record<string, unknown> | null,
  playerNameMap: Map<string, string>
): UsedPlayersResult {
  // 1. Starting lineup snapshot (captured at match creation, never mutated)
  const rawInitialIds = runtimeState?.initialOnFieldPlayerIds;
  const initialIds: string[] = Array.isArray(rawInitialIds)
    ? rawInitialIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  // 2. Players from runtime substitution events
  const runtimeEvents = Array.isArray(runtimeState?.events)
    ? (runtimeState!.events as unknown[])
    : [];

  const subsInIds: string[] = [];
  const subsOutIds: string[] = [];
  for (const e of runtimeEvents) {
    if (!isRecord(e) || e.type !== "substitution") continue;
    const inId = safeString(e.inPlayerId);
    const outId = safeString(e.outPlayerId);
    if (inId) subsInIds.push(inId);
    if (outId) subsOutIds.push(outId);
  }

  // 3. Player IDs with accumulated time > 0
  const accumulated = runtimeState?.playerAccumulatedMs;
  const idsWithTime: string[] = isRecord(accumulated)
    ? Object.entries(accumulated)
        .filter(([, ms]) => typeof ms === "number" && (ms as number) > 0)
        .map(([id]) => id)
    : [];

  // Union of all sources
  const allPlayerIds = new Set([...initialIds, ...subsInIds, ...idsWithTime]);

  // Augment DB name map with names embedded directly in runtime events
  // (covers players who may have been deactivated in the DB since the match)
  const nameMap = new Map(playerNameMap);
  for (const e of runtimeEvents) {
    if (!isRecord(e) || e.type !== "substitution") continue;
    const inId = safeString(e.inPlayerId);
    const inName = safeString(e.inPlayerName);
    if (inId && inName && !nameMap.has(inId)) nameMap.set(inId, inName);
    const outId = safeString(e.outPlayerId);
    const outName = safeString(e.outPlayerName);
    if (outId && outName && !nameMap.has(outId)) nameMap.set(outId, outName);
  }

  const startingSet = new Set(initialIds);
  const subsInSet = new Set(subsInIds);

  const playersUsedList: MatchSummaryPlayerUsed[] = [];
  for (const id of allPlayerIds) {
    const name = nameMap.get(id);
    if (!name) continue; // no name available — skip rather than emit unnamed entry

    const ms = isRecord(accumulated) ? safeNumber((accumulated as Record<string, unknown>)[id]) : null;
    const minutesPlayed = ms !== null && ms > 0 ? Math.round(ms / 60000) : null;

    playersUsedList.push({
      name,
      minutesPlayed,
      started: startingSet.has(id),
      cameOn: !startingSet.has(id) && subsInSet.has(id),
    });
  }

  // Sort: starters first (by minutes desc), then subs (by minutes desc), then others
  playersUsedList.sort((a, b) => {
    if (a.started !== b.started) return a.started ? -1 : 1;
    if (a.cameOn !== b.cameOn) return a.cameOn ? -1 : 1;
    return (b.minutesPlayed ?? 0) - (a.minutesPlayed ?? 0);
  });

  // Starting player list in original squad order (preserving initialOnFieldPlayerIds order)
  const startingPlayers = initialIds
    .map((id) => nameMap.get(id))
    .filter((name): name is string => !!name)
    .map((name) => ({ name }));

  return {
    startingPlayers,
    playersUsedList,
    playersUsed: playersUsedList.length,
  };
}

/**
 * Build a chronological list of match events for AI narrative context.
 * Goal events carry a running score so the AI can describe how the game progressed.
 */
function buildChronologicalMatchEvents(
  teamName: string,
  opponentName: string,
  scoreFor: number,
  scoreAgainst: number,
  goalsFor: Array<{ minute: number | null; scorerName: string | null; assistName: string | null }>,
  goalsAgainst: Array<{ minute: number | null }>,
  substitutions: MatchSummarySubstitution[],
  matchDurationMinutes: number | null
): MatchSummaryEvent[] {
  const events: MatchSummaryEvent[] = [];

  events.push({
    type: "match_start",
    minute: 0,
    detail: `Kampstart: ${teamName} vs ${opponentName}`,
  });

  // Merge all mid-game events to sort chronologically
  type RawMidEvent =
    | { kind: "goal_for"; minute: number | null; scorerName: string | null; assistName: string | null }
    | { kind: "goal_against"; minute: number | null }
    | { kind: "substitution"; minute: number | null; playerInName: string | null; playerOutName: string | null };

  const midEvents: RawMidEvent[] = [
    ...goalsFor.map((g) => ({
      kind: "goal_for" as const,
      minute: g.minute,
      scorerName: g.scorerName,
      assistName: g.assistName,
    })),
    ...goalsAgainst.map((g) => ({ kind: "goal_against" as const, minute: g.minute })),
    ...substitutions.map((s) => ({
      kind: "substitution" as const,
      minute: s.minute,
      playerInName: s.playerInName,
      playerOutName: s.playerOutName,
    })),
  ];

  // Sort by minute (null-minute events go to end)
  midEvents.sort((a, b) => {
    if (a.minute === null && b.minute === null) return 0;
    if (a.minute === null) return 1;
    if (b.minute === null) return -1;
    return a.minute - b.minute;
  });

  // Walk events, tracking running score for context
  let ownGoals = 0;
  let oppGoals = 0;

  for (const ev of midEvents) {
    if (ev.kind === "goal_for") {
      ownGoals += 1;
      let detail = `Mål for ${teamName} (${ownGoals}-${oppGoals})`;
      if (ev.scorerName) detail += ` — scorer: ${ev.scorerName}`;
      if (ev.assistName) detail += `, assist: ${ev.assistName}`;
      events.push({ type: "goal_for", minute: ev.minute, detail });
    } else if (ev.kind === "goal_against") {
      oppGoals += 1;
      events.push({
        type: "goal_against",
        minute: ev.minute,
        detail: `Mål for ${opponentName} (${ownGoals}-${oppGoals})`,
      });
    } else {
      const inn = ev.playerInName;
      const ut = ev.playerOutName;
      let detail = "Bytte";
      if (inn && ut) detail = `Bytte: ${inn} inn, ${ut} ut`;
      else if (inn) detail = `Bytte inn: ${inn}`;
      else if (ut) detail = `Bytte ut: ${ut}`;
      events.push({ type: "substitution", minute: ev.minute, detail });
    }
  }

  events.push({
    type: "match_end",
    minute: matchDurationMinutes,
    detail: `Slutt: ${teamName} ${scoreFor}-${scoreAgainst} ${opponentName}`,
  });

  return events;
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

  // Build player name lookup from DB players (authoritative names for active players)
  const playerNameMap = new Map<string, string>(
    (playersResult.data ?? []).map((p) => [p.id, p.name])
  );

  const runtimeState = isRecord(matchRow.runtime_state) ? matchRow.runtime_state : null;

  // Goals from server events (ordered by timestamp)
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
  const runtimeEvents = Array.isArray(runtimeState?.events)
    ? (runtimeState!.events as unknown[])
    : [];
  const runtimeSubs = extractSubstitutionsFromRuntimeEvents(runtimeEvents);
  const substitutions =
    runtimeSubs.length > 0 ? runtimeSubs : extractSubstitutionsFromServerEvents(events);

  // Player times — derived from live match accumulated time tracking
  const playerTimes = extractPlayerTimesFromRuntimeState(runtimeState, playerNameMap);

  // Players used — union-based calculation (starting lineup + subs + time-tracked)
  const { startingPlayers, playersUsedList, playersUsed } = extractStartingAndUsedPlayers(
    runtimeState,
    playerNameMap
  );

  // Match duration from live match setup
  const matchDurationMinutes = extractMatchDurationMinutes(runtimeState);

  const teamName = team?.name?.trim() || matchRow.title || "Laget";
  const opponentName = matchRow.opponent_name?.trim() || "Motstanderen";
  const scoreForFinal = Math.max(0, Math.floor(matchRow.score_for ?? 0));
  const scoreAgainstFinal = Math.max(0, Math.floor(matchRow.score_against ?? 0));

  // Chronological event timeline for AI narrative context
  const matchEvents = buildChronologicalMatchEvents(
    teamName,
    opponentName,
    scoreForFinal,
    scoreAgainstFinal,
    goalsFor,
    goalsAgainst,
    substitutions,
    matchDurationMinutes
  );

  return {
    matchId,
    teamName,
    opponentName,
    dateTime: matchRow.starts_at ?? null,
    venue: matchRow.location?.trim() ?? null,
    format: matchRow.format ?? null,
    matchDurationMinutes,
    scoreFor: scoreForFinal,
    scoreAgainst: scoreAgainstFinal,
    startingPlayers,
    goalsFor,
    goalsAgainst,
    substitutions,
    playersUsed,
    playersUsedList,
    playerTimes,
    matchEvents,
  };
}
