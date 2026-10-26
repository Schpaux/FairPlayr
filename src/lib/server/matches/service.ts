import type { SupabaseClient } from "@supabase/supabase-js";
import { IntegrationError } from "@/lib/server/integrations/spond/errors";
import { generateMatchSummaryByMatchId } from "@/lib/server/ai/match-summary";
import type {
  CreateMatchInput,
  ExternalEventLinkRow,
  MatchEventItem,
  MatchEventRow,
  MatchEventTeamSide,
  MatchEventType,
  MatchFormat,
  MatchListItem,
  MatchReportStatus,
  MatchRow,
  UpdateMatchStatusInput,
} from "@/lib/server/matches/types";
import { isCompletionReplay, planMatchUpdate, resolveCompletionEndedAt } from "@/domain/matchLifecycle";
import { ALL_FORMATS } from "@/domain/match";

const MATCH_SELECT_LEGACY = "id, team_id, title, opponent_name, starts_at, location, status, runtime_state, created_by, created_at, updated_at";
const MATCH_SELECT_ENHANCED = `${MATCH_SELECT_LEGACY}, started_at, ended_at, format, report_enabled, report_status, report_text, report_generated_at, score_for, score_against`;
const MATCH_EVENT_SELECT = "id, match_id, type, minute, timestamp_ms, team_side, primary_player_id, secondary_player_id, payload, created_at, updated_at";

interface CreateMatchEventInput {
  matchId: string;
  type: MatchEventType;
  minute?: number | null;
  timestampMs?: number | null;
  teamSide?: MatchEventTeamSide;
  primaryPlayerId?: string | null;
  secondaryPlayerId?: string | null;
  payload?: Record<string, unknown> | null;
}

interface UpdateMatchEventInput {
  eventId: string;
  minute?: number | null;
  timestampMs?: number | null;
  teamSide?: MatchEventTeamSide;
  primaryPlayerId?: string | null;
  secondaryPlayerId?: string | null;
  payload?: Record<string, unknown> | null;
}

function isMissingMatchTimestampColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) {
    return false;
  }

  // Postgres undefined_column error
  if (error.code === "42703") {
    return true;
  }

  const msg = error.message ?? "";

  // PostgREST schema cache error: "Could not find the 'X' column of 'matches' in the schema cache"
  if (/could not find the '[^']+' column of 'matches' in the schema cache/i.test(msg)) {
    return true;
  }

  // Legacy pattern: "column matches.X does not exist"
  return /column\s+matches\.(started_at|ended_at|format|report_enabled|report_status|report_text|report_generated_at|score_for|score_against)\s+does\s+not\s+exist/i.test(msg);
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

function mapMatchRows(rows: MatchRow[], links: ExternalEventLinkRow[]): MatchListItem[] {
  const linksByMatchId = new Map(links.map((row) => [row.match_id, row]));

  return rows.map((row) => {
    const link = linksByMatchId.get(row.id);

    return {
      id: row.id,
      teamId: row.team_id,
      title: row.title,
      opponentName: row.opponent_name,
      startsAt: row.starts_at,
      location: row.location,
      format: (row.format ?? "5v5") as MatchFormat,
      status: row.status,
      reportEnabled: row.report_enabled ?? false,
      reportStatus: (row.report_status ?? "not_requested") as MatchReportStatus,
      reportText: row.report_text ?? null,
      reportGeneratedAt: row.report_generated_at ?? null,
      scoreFor: row.score_for ?? 0,
      scoreAgainst: row.score_against ?? 0,
      startedAt: row.started_at ?? null,
      endedAt: row.ended_at ?? null,
      runtimeState:
        row.runtime_state && typeof row.runtime_state === "object"
          ? (row.runtime_state as Record<string, unknown>)
          : null,
      source: link ? "spond" : "manual",
      externalEventId: link?.external_event_id ?? null,
      rsvpLastSyncedAt: link?.rsvp_last_synced_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

function mapMatchEventRows(rows: MatchEventRow[]): MatchEventItem[] {
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

export async function getTeamMatches(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<MatchListItem[]> {
  await requireTeamMembership(supabase, userId, teamId);

  const primaryQuery = supabase
    .from("matches")
    .select(MATCH_SELECT_ENHANCED)
    .eq("team_id", teamId)
    .order("starts_at", { ascending: true })
    .returns<MatchRow[]>();

  let { data: matchRows, error: matchError } = await primaryQuery;

  if (isMissingMatchTimestampColumnError(matchError)) {
    const fallback = await supabase
      .from("matches")
      .select(MATCH_SELECT_LEGACY)
      .eq("team_id", teamId)
      .order("starts_at", { ascending: true })
      .returns<MatchRow[]>();

    matchRows = fallback.data;
    matchError = fallback.error;
  }

  if (matchError) {
    throw new IntegrationError("MATCH_LIST_FAILED", matchError.message, 500);
  }

  const rows = matchRows ?? [];

  if (rows.length === 0) {
    return [];
  }

  const matchIds = rows.map((row) => row.id);

  const { data: links, error: linksError } = await supabase
    .from("external_event_links")
    .select("id, match_id, team_id, provider, external_event_id, external_team_id, external_event_name, rsvp_last_synced_at, imported_at, created_at")
    .in("match_id", matchIds)
    .eq("provider", "spond")
    .returns<ExternalEventLinkRow[]>();

  if (linksError) {
    throw new IntegrationError("MATCH_LINKS_FAILED", linksError.message, 500);
  }

  return mapMatchRows(rows, links ?? []);
}

export async function getMatchById(
  supabase: SupabaseClient,
  userId: string,
  matchId: string
): Promise<MatchListItem> {
  const primary = await supabase
    .from("matches")
    .select(MATCH_SELECT_ENHANCED)
    .eq("id", matchId)
    .maybeSingle<MatchRow>();

  let { data: row, error } = primary;

  if (isMissingMatchTimestampColumnError(error)) {
    const fallback = await supabase
      .from("matches")
      .select(MATCH_SELECT_LEGACY)
      .eq("id", matchId)
      .maybeSingle<MatchRow>();

    row = fallback.data;
    error = fallback.error;
  }
  
  if (error) {
    throw new IntegrationError("MATCH_READ_FAILED", error.message, 500);
  }

  if (!row) {
    throw new IntegrationError("MATCH_NOT_FOUND", "Fant ikke kampen.", 404);
  }

  await requireTeamMembership(supabase, userId, row.team_id);

  const { data: link, error: linkError } = await supabase
    .from("external_event_links")
    .select("id, match_id, team_id, provider, external_event_id, external_team_id, external_event_name, rsvp_last_synced_at, imported_at, created_at")
    .eq("match_id", row.id)
    .eq("provider", "spond")
    .maybeSingle<ExternalEventLinkRow>();

  if (linkError) {
    throw new IntegrationError("MATCH_LINK_READ_FAILED", linkError.message, 500);
  }

  return mapMatchRows([row], link ? [link] : [])[0];
}

export async function getActiveMatchForTeam(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<MatchListItem | null> {
  await requireTeamMembership(supabase, userId, teamId);

  const primary = await supabase
    .from("matches")
    .select(MATCH_SELECT_ENHANCED)
    .eq("team_id", teamId)
    .eq("status", "live")
    .order("started_at", { ascending: false })
    .maybeSingle<MatchRow>();

  let { data: row, error } = primary;

  if (isMissingMatchTimestampColumnError(error)) {
    const fallback = await supabase
      .from("matches")
      .select(MATCH_SELECT_LEGACY)
      .eq("team_id", teamId)
      .eq("status", "live")
      .order("updated_at", { ascending: false })
      .maybeSingle<MatchRow>();

    row = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new IntegrationError("MATCH_READ_FAILED", error.message, 500);
  }

  if (!row) {
    return null;
  }

  return mapMatchRows([row], [])[0];
}

export async function getActiveMatchForUser(
  supabase: SupabaseClient,
  userId: string,
  preferredTeamId?: string | null
): Promise<{ activeMatch: MatchListItem | null; recoverableMatch: MatchListItem | null }> {
  let teamIds: string[] = [];

  if (preferredTeamId) {
    await requireTeamMembership(supabase, userId, preferredTeamId);
    teamIds = [preferredTeamId];
  } else {
    const { data: memberships, error: membershipError } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", userId)
      .returns<Array<{ team_id: string }>>();

    if (membershipError) {
      throw new IntegrationError("TEAM_LOOKUP_FAILED", membershipError.message, 500);
    }

    teamIds = (memberships ?? []).map((row) => row.team_id);
  }

  if (teamIds.length === 0) {
    return {
      activeMatch: null,
      recoverableMatch: null,
    };
  }

  const primary = await supabase
    .from("matches")
    .select(MATCH_SELECT_ENHANCED)
    .in("team_id", teamIds)
    .eq("status", "live")
    .order("started_at", { ascending: false })
    .limit(1)
    .returns<MatchRow[]>();

  let { data: activeRows, error: activeError } = primary;

  if (isMissingMatchTimestampColumnError(activeError)) {
    const fallback = await supabase
      .from("matches")
      .select(MATCH_SELECT_LEGACY)
      .in("team_id", teamIds)
      .eq("status", "live")
      .order("updated_at", { ascending: false })
      .limit(1)
      .returns<MatchRow[]>();

    activeRows = fallback.data;
    activeError = fallback.error;
  }

  if (activeError) {
    throw new IntegrationError("MATCH_READ_FAILED", activeError.message, 500);
  }

  const activeMatch = activeRows && activeRows[0] ? mapMatchRows([activeRows[0]], [])[0] : null;

  if (activeMatch) {
    return {
      activeMatch,
      recoverableMatch: null,
    };
  }

  const recoverable = await supabase
    .from("matches")
    .select(MATCH_SELECT_ENHANCED)
    .in("team_id", teamIds)
    .neq("status", "completed")
    .not("runtime_state", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .returns<MatchRow[]>();

  let { data: recoverableRows, error: recoverableError } = recoverable;

  if (isMissingMatchTimestampColumnError(recoverableError)) {
    const fallback = await supabase
      .from("matches")
      .select(MATCH_SELECT_LEGACY)
      .in("team_id", teamIds)
      .neq("status", "completed")
      .not("runtime_state", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .returns<MatchRow[]>();

    recoverableRows = fallback.data;
    recoverableError = fallback.error;
  }

  if (recoverableError) {
    throw new IntegrationError("MATCH_READ_FAILED", recoverableError.message, 500);
  }

  return {
    activeMatch: null,
    recoverableMatch:
      recoverableRows && recoverableRows[0]
        ? mapMatchRows([recoverableRows[0]], [])[0]
        : null,
  };
}

function resolveStatusTimestamps(
  mode: "start" | "complete" | "reset" | "keep",
  completedAt: () => string
) {
  if (mode === "start") {
    return {
      started_at: new Date().toISOString(),
      ended_at: null,
    };
  }

  if (mode === "complete") {
    return {
      ended_at: completedAt(),
    };
  }

  if (mode === "reset") {
    return {
      started_at: null,
      ended_at: null,
    };
  }

  return {};
}

function matchCompletedError(): IntegrationError {
  return new IntegrationError("MATCH_COMPLETED", "Kampen er allerede avsluttet.", 409);
}

/** Raised by the matches_completed_is_terminal trigger, where it is installed. */
function isCompletedTriggerError(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && error.code === "P0001" && /MATCH_COMPLETED/.test(error.message ?? ""));
}

export async function updateMatchStatus(
  supabase: SupabaseClient,
  userId: string,
  input: UpdateMatchStatusInput
): Promise<MatchListItem> {
  const existing = await getMatchById(supabase, userId, input.matchId);

  // Completed is terminal (FP-P0-F2). See src/domain/matchLifecycle.ts.
  const plan = planMatchUpdate(existing.status, {
    status: input.status,
    runtimeState: input.runtimeState,
    hasScore: input.scoreFor !== undefined || input.scoreAgainst !== undefined,
  });

  if (!plan.allowed) {
    throw matchCompletedError();
  }

  if (input.status === "live") {
    const active = await getActiveMatchForTeam(supabase, userId, existing.teamId);

    if (active && active.id !== existing.id) {
      throw new IntegrationError("ACTIVE_MATCH_EXISTS", "En annen kamp pågår allerede.", 409);
    }
  }

  // The coach's end time on the device, not the time the request arrived
  // (a match ended offline may sync hours later).
  const timestamps = resolveStatusTimestamps(plan.timestamps, () =>
    resolveCompletionEndedAt({
      requestedEndedAt: input.endedAt,
      runtimeState: input.runtimeState,
      startedAt: existing.startedAt,
      nowMs: Date.now(),
    })
  );
  const nextStatus = input.status ?? existing.status;

  // A replayed completion (offline retry, lost response, second tab) leaves
  // the report exactly as it is: no regeneration, no reset, no clear.
  const replay = isCompletionReplay(existing, {
    status: input.status,
    runtimeState: input.runtimeState,
    hasScore: input.scoreFor !== undefined || input.scoreAgainst !== undefined,
    reportStatus: input.reportStatus,
  });

  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    ...timestamps,
  };

  if (plan.writeScore && input.scoreFor !== undefined) {
    updatePayload.score_for = Math.max(0, Math.floor(input.scoreFor));
  }

  if (plan.writeScore && input.scoreAgainst !== undefined) {
    updatePayload.score_against = Math.max(0, Math.floor(input.scoreAgainst));
  }

  if (input.reportEnabled !== undefined && !replay) {
    updatePayload.report_enabled = input.reportEnabled;
    if (!input.reportEnabled) {
      updatePayload.report_status = "not_requested";
      updatePayload.report_text = null;
      updatePayload.report_generated_at = null;
    }
  }

  if (input.reportStatus !== undefined) {
    updatePayload.report_status = input.reportStatus;
  }

  if (input.reportText !== undefined) {
    updatePayload.report_text = input.reportText;
  }

  if (input.reportGeneratedAt !== undefined) {
    updatePayload.report_generated_at = input.reportGeneratedAt;
  }

  const nextReportEnabled = replay
    ? existing.reportEnabled
    : input.reportEnabled ?? existing.reportEnabled;
  const shouldGenerateReport =
    !replay &&
    nextStatus === "completed" &&
    nextReportEnabled === true &&
    (
      input.status === "completed" ||
      (input.reportEnabled === true && existing.reportStatus !== "ready") ||
      input.reportStatus === "pending"
    );

  if (shouldGenerateReport) {
    updatePayload.report_status = "pending";
    updatePayload.report_generated_at = null;
  }

  if (plan.writeRuntimeState && input.runtimeState !== undefined) {
    updatePayload.runtime_state = input.runtimeState;

    // MATCH-14: the format the match was played in is the one in its own
    // state. A planned or Spond row was created with the column default
    // ("5v5"), so it follows the state; a state without one changes nothing.
    const playedFormat = ALL_FORMATS.find((format) => format === input.runtimeState?.format);
    if (playedFormat) {
      updatePayload.format = playedFormat;
    }
  }

  // A write that is not itself a completion only applies while the row is
  // still open, so a completion that lands after our read is never undone.
  // The transition to completed is conditional too: when two completions race
  // (a retry and the live screen, two tabs), exactly one performs it, stamps
  // the end time and requests the report; the other is re-planned below as
  // the repeat it now is.
  const completesNow = plan.timestamps === "complete";
  const onlyWhileOpen = plan.requireNotCompleted || completesNow;

  let primaryQuery = supabase.from("matches").update(updatePayload).eq("id", input.matchId);
  if (onlyWhileOpen) {
    primaryQuery = primaryQuery.neq("status", "completed");
  }

  const primary = await primaryQuery.select(MATCH_SELECT_ENHANCED).maybeSingle<MatchRow>();

  let { data: row, error } = primary;

  if (isMissingMatchTimestampColumnError(error)) {
    let fallbackQuery = supabase.from("matches").update({ status: nextStatus }).eq("id", input.matchId);
    if (onlyWhileOpen) {
      fallbackQuery = fallbackQuery.neq("status", "completed");
    }

    const fallback = await fallbackQuery.select(MATCH_SELECT_LEGACY).maybeSingle<MatchRow>();

    row = fallback.data;
    error = fallback.error;
  }

  if (isCompletedTriggerError(error)) {
    throw matchCompletedError();
  }

  if (error) {
    throw new IntegrationError("MATCH_UPDATE_FAILED", error.message, 500);
  }

  if (!row) {
    // The row exists (read above), so the guard filtered it out: it was
    // completed in the meantime.
    if (completesNow) {
      // Another completion won. Re-read: the row is now completed, so this
      // request is planned as a repeat (keeps that end time and report).
      return updateMatchStatus(supabase, userId, input);
    }

    if (plan.requireNotCompleted) {
      throw matchCompletedError();
    }

    throw new IntegrationError("MATCH_NOT_FOUND", "Fant ikke kampen.", 404);
  }

  let mapped = mapMatchRows([row], [])[0];

  if (shouldGenerateReport) {
    console.info("[match-report] generation requested", {
      matchId: mapped.id,
    });

    try {
      const summary = await generateMatchSummaryByMatchId(supabase, userId, mapped.id);
      const generatedAt = new Date().toISOString();

      const { data: reportRow, error: reportError } = await supabase
        .from("matches")
        .update({
          report_status: "ready",
          report_text:
            summary.result.source === "fallback"
              ? `${summary.result.text}\n\n(Standardoppsummering brukt fordi AI-svar ikke var tilgjengelig.${summary.result.failureReason ? ` Grunn: ${summary.result.failureReason}` : ""})`
              : summary.result.text,
          report_generated_at: generatedAt,
        })
        .eq("id", mapped.id)
        .select(MATCH_SELECT_ENHANCED)
        .single<MatchRow>();

      if (reportError) {
        throw reportError;
      }

      if (reportRow) {
        mapped = mapMatchRows([reportRow], [])[0];
      }

      console.info("[match-report] generation completed", {
        matchId: mapped.id,
        source: summary.result.source,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown report generation error";
      const { data: failedRow } = await supabase
        .from("matches")
        .update({
          report_status: "failed",
          report_generated_at: null,
        })
        .eq("id", mapped.id)
        .select(MATCH_SELECT_ENHANCED)
        .single<MatchRow>();

      if (failedRow) {
        mapped = mapMatchRows([failedRow], [])[0];
      }

      console.error("[match-report] generation failed", {
        matchId: mapped.id,
        message,
      });
    }
  }

  return mapped;
}

export async function createManualMatch(
  supabase: SupabaseClient,
  userId: string,
  input: CreateMatchInput
): Promise<MatchListItem> {
  await requireTeamMembership(supabase, userId, input.teamId);

  const clientChosen = {
    ...(input.id ? { id: input.id } : {}),
  };

  const primary = await supabase
    .from("matches")
    .insert({
      ...clientChosen,
      ...(input.startedAt ? { started_at: input.startedAt } : {}),
      team_id: input.teamId,
      title: input.title,
      opponent_name: input.opponentName ?? null,
      starts_at: input.startsAt,
      location: input.location ?? null,
      format: input.format ?? "5v5",
      report_enabled: input.reportEnabled ?? false,
      report_status: input.reportEnabled ? "not_requested" : "not_requested",
      score_for: 0,
      score_against: 0,
      status: input.status ?? "upcoming",
      created_by: userId,
    })
    .select(MATCH_SELECT_ENHANCED)
    .single<MatchRow>();

  let { data: row, error } = primary;

  if (isMissingMatchTimestampColumnError(error)) {
    const fallback = await supabase
      .from("matches")
      .insert({
        ...clientChosen,
        team_id: input.teamId,
        title: input.title,
        opponent_name: input.opponentName ?? null,
        starts_at: input.startsAt,
        location: input.location ?? null,
        format: input.format ?? "5v5",
        report_enabled: input.reportEnabled ?? false,
        report_status: "not_requested",
        score_for: 0,
        score_against: 0,
        status: input.status ?? "upcoming",
        created_by: userId,
      })
      .select(MATCH_SELECT_LEGACY)
      .single<MatchRow>();

    row = fallback.data;
    error = fallback.error;
  }

  if (input.id && isUniqueViolation(error)) {
    // A repeat of a create whose answer was lost (MATCH-13): the row the
    // device asked for already exists. It is returned as it is, never
    // changed, and only when it is that same team's match.
    const existing = await getMatchById(supabase, userId, input.id).catch(() => null);

    if (existing && existing.teamId === input.teamId) {
      return existing;
    }

    throw new IntegrationError("MATCH_ID_CONFLICT", "Kamp-id-en er allerede i bruk.", 409);
  }

  if (error) {
    throw new IntegrationError("MATCH_CREATE_FAILED", error.message, 500);
  }

  if (!row) {
    throw new IntegrationError("MATCH_CREATE_FAILED", "Kunne ikke opprette kamp.", 500);
  }

  return mapMatchRows([row], [])[0];
}

/** Postgres unique_violation (here: a match id that already exists). */
function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function deleteMatch(
  supabase: SupabaseClient,
  userId: string,
  matchId: string
): Promise<void> {
  const match = await getMatchById(supabase, userId, matchId);

  const { error } = await supabase
    .from("matches")
    .delete()
    .eq("id", match.id);

  if (error) {
    throw new IntegrationError("MATCH_DELETE_FAILED", error.message, 500);
  }
}

export async function getMatchEvents(
  supabase: SupabaseClient,
  userId: string,
  matchId: string
): Promise<MatchEventItem[]> {
  await getMatchById(supabase, userId, matchId);

  const { data, error } = await supabase
    .from("match_events")
    .select(MATCH_EVENT_SELECT)
    .eq("match_id", matchId)
    .order("timestamp_ms", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .returns<MatchEventRow[]>();

  if (error) {
    throw new IntegrationError("MATCH_EVENTS_READ_FAILED", error.message, 500);
  }

  return mapMatchEventRows(data ?? []);
}

export async function createMatchEvent(
  supabase: SupabaseClient,
  userId: string,
  input: CreateMatchEventInput
): Promise<MatchEventItem> {
  await getMatchById(supabase, userId, input.matchId);

  const { data, error } = await supabase
    .from("match_events")
    .insert({
      match_id: input.matchId,
      type: input.type,
      minute: input.minute ?? null,
      timestamp_ms: input.timestampMs ?? null,
      team_side: input.teamSide ?? null,
      primary_player_id: input.primaryPlayerId ?? null,
      secondary_player_id: input.secondaryPlayerId ?? null,
      payload: input.payload ?? null,
    })
    .select(MATCH_EVENT_SELECT)
    .single<MatchEventRow>();

  if (error || !data) {
    throw new IntegrationError("MATCH_EVENT_CREATE_FAILED", error?.message ?? "Kunne ikke opprette hendelse.", 500);
  }

  return mapMatchEventRows([data])[0];
}

export async function updateMatchEvent(
  supabase: SupabaseClient,
  userId: string,
  input: UpdateMatchEventInput
): Promise<MatchEventItem> {
  const { data: existing, error: eventError } = await supabase
    .from("match_events")
    .select("id, match_id")
    .eq("id", input.eventId)
    .maybeSingle<{ id: string; match_id: string }>();

  if (eventError) {
    throw new IntegrationError("MATCH_EVENT_READ_FAILED", eventError.message, 500);
  }

  if (!existing) {
    throw new IntegrationError("MATCH_EVENT_NOT_FOUND", "Fant ikke hendelsen.", 404);
  }

  await getMatchById(supabase, userId, existing.match_id);

  const updatePayload: Record<string, unknown> = {};
  if (input.minute !== undefined) updatePayload.minute = input.minute;
  if (input.timestampMs !== undefined) updatePayload.timestamp_ms = input.timestampMs;
  if (input.teamSide !== undefined) updatePayload.team_side = input.teamSide;
  if (input.primaryPlayerId !== undefined) updatePayload.primary_player_id = input.primaryPlayerId;
  if (input.secondaryPlayerId !== undefined) updatePayload.secondary_player_id = input.secondaryPlayerId;
  if (input.payload !== undefined) updatePayload.payload = input.payload;

  const { data, error } = await supabase
    .from("match_events")
    .update(updatePayload)
    .eq("id", input.eventId)
    .select(MATCH_EVENT_SELECT)
    .single<MatchEventRow>();

  if (error || !data) {
    throw new IntegrationError("MATCH_EVENT_UPDATE_FAILED", error?.message ?? "Kunne ikke oppdatere hendelsen.", 500);
  }

  return mapMatchEventRows([data])[0];
}

export async function deleteMatchEvent(
  supabase: SupabaseClient,
  userId: string,
  eventId: string
): Promise<void> {
  const { data: existing, error: eventError } = await supabase
    .from("match_events")
    .select("id, match_id")
    .eq("id", eventId)
    .maybeSingle<{ id: string; match_id: string }>();

  if (eventError) {
    throw new IntegrationError("MATCH_EVENT_READ_FAILED", eventError.message, 500);
  }

  if (!existing) {
    throw new IntegrationError("MATCH_EVENT_NOT_FOUND", "Fant ikke hendelsen.", 404);
  }

  await getMatchById(supabase, userId, existing.match_id);

  const { error } = await supabase
    .from("match_events")
    .delete()
    .eq("id", eventId);

  if (error) {
    throw new IntegrationError("MATCH_EVENT_DELETE_FAILED", error.message, 500);
  }
}
