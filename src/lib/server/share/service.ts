import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IntegrationError } from "@/lib/server/integrations/spond/errors";
import { getMatchById } from "@/lib/server/matches/service";
import { generatePublicSummary } from "@/lib/server/share/publicSummary";
import {
  generateShareToken,
  isShareEnabled,
  isShareToken,
  normalizeKickoffAt,
  normalizeShareSettings,
  publicSummaryBasis,
  sanitizePublicMatchShare,
  type MatchShareSettings,
  type PublicMatchShare,
  type ShareAgeGroup,
  type ShareDetailLevel,
} from "@/domain/matchShare";

/**
 * FEAT-SHARE-01: the coach's side of a match share (read, change, turn off)
 * and the public read. A share row exists only while sharing is on; turning
 * it off deletes the row, so the old link stops working at once.
 */

const SHARE_SELECT =
  "match_id, team_id, token, share_live, share_summary, detail_level, age_group, public_summary_text, public_summary_level";

interface MatchShareRow {
  match_id: string;
  team_id: string;
  token: string;
  share_live: boolean;
  share_summary: boolean;
  detail_level: ShareDetailLevel;
  age_group: ShareAgeGroup;
  public_summary_text: string | null;
  public_summary_level: ShareDetailLevel | null;
}

export interface MatchShareItem extends MatchShareSettings {
  token: string;
}

function mapShare(row: MatchShareRow): MatchShareItem {
  return {
    token: row.token,
    ...normalizeShareSettings({
      live: row.share_live,
      summary: row.share_summary,
      detailLevel: row.detail_level,
      ageGroup: row.age_group,
    }),
  };
}

/**
 * Whether a completed, shared match should check its public summary. The
 * check itself (refreshPublicSummary) compares the stored text's basis with
 * the current data and does nothing when they match.
 */
function needsPublicSummary(row: MatchShareRow, matchStatus: string): boolean {
  return matchStatus === "completed" && row.share_summary;
}

/** Postgres undefined_table / PostgREST "relation not in schema cache": the migration is not applied. */
function isMissingShareTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));
}

function shareFailed(error: { code?: string; message: string }): IntegrationError {
  if (isMissingShareTable(error)) {
    return new IntegrationError("SHARE_UNAVAILABLE", "Deling er ikke tilgjengelig ennå.", 503);
  }
  return new IntegrationError("SHARE_FAILED", error.message, 500);
}

async function readShareRow(supabase: SupabaseClient, matchId: string): Promise<MatchShareRow | null> {
  const { data, error } = await supabase
    .from("match_shares")
    .select(SHARE_SELECT)
    .eq("match_id", matchId)
    .maybeSingle<MatchShareRow>();

  if (error) throw shareFailed(error);
  return data;
}

export async function getMatchShare(
  supabase: SupabaseClient,
  userId: string,
  matchId: string
): Promise<{ share: MatchShareItem | null; summaryNeeded: boolean }> {
  const match = await getMatchById(supabase, userId, matchId);
  const row = await readShareRow(supabase, matchId);

  return {
    share: row ? mapShare(row) : null,
    summaryNeeded: row ? needsPublicSummary(row, match.status) : false,
  };
}

export interface SaveMatchShareInput {
  live?: unknown;
  summary?: unknown;
  detailLevel?: unknown;
  ageGroup?: unknown;
  /** A token made on the device (so the link is known offline); used only for a new share. */
  token?: unknown;
  /**
   * Only from setup for a new match: its own kick-off (a time, or null for
   * none), never the match row's placeholder start. Left out, the share keeps
   * what it has (a new one uses the match's time).
   */
  kickoffAt?: unknown;
  /**
   * With both switches off: the coach discarded the setup this match was
   * made for. A planned placeholder that never started is marked discarded
   * (kept, but no longer listed as a coming match).
   */
  discardPlaceholder?: unknown;
}

/** A match row that is only planned: not started, never live or completed. */
function isUnstartedPlan(match: { status: string; startedAt?: string | null }): boolean {
  return (match.status === "upcoming" || match.status === "draft") && !match.startedAt;
}

/** Postgres undefined_column / PostgREST unknown column: the migration is not applied. */
function isMissingColumn(error: { code?: string } | null): boolean {
  return Boolean(error && (error.code === "42703" || error.code === "PGRST204"));
}

/**
 * Sets the share of a match. Both switches off removes it (the link stops
 * working). An existing share keeps its token, so the link stays the same
 * when the level or the switches change.
 */
export async function saveMatchShare(
  supabase: SupabaseClient,
  userId: string,
  matchId: string,
  input: SaveMatchShareInput
): Promise<{ share: MatchShareItem | null; summaryNeeded: boolean }> {
  const match = await getMatchById(supabase, userId, matchId);
  const settings = normalizeShareSettings(input);

  if (!isShareEnabled(settings)) {
    const { error } = await supabase.from("match_shares").delete().eq("match_id", matchId);
    if (error && !isMissingShareTable(error)) throw shareFailed(error);

    if (input.discardPlaceholder === true && isUnstartedPlan(match)) {
      const { error: discardError } = await supabase
        .from("matches")
        .update({ discarded_at: new Date().toISOString() })
        .eq("id", matchId)
        .in("status", ["upcoming", "draft"])
        .is("started_at", null);
      if (discardError && !isMissingColumn(discardError)) throw shareFailed(discardError);
    }
    return { share: null, summaryNeeded: false };
  }

  const kickoffAt = input.kickoffAt !== undefined ? normalizeKickoffAt(input.kickoffAt) : undefined;

  const columns = {
    share_live: settings.live,
    share_summary: settings.summary,
    detail_level: settings.detailLevel,
    age_group: settings.ageGroup,
    ...(kickoffAt !== undefined ? { kickoff_from_match: false, kickoff_at: kickoffAt } : {}),
  };

  // A kick-off the coach set in setup is the planned match's time everywhere
  // (the match list too), not only on the public page. Only before the
  // start; the real start stays in started_at.
  if (kickoffAt && isUnstartedPlan(match) && Date.parse(kickoffAt) !== Date.parse(match.startsAt)) {
    const { error } = await supabase
      .from("matches")
      .update({ starts_at: kickoffAt })
      .eq("id", matchId)
      .in("status", ["upcoming", "draft"])
      .is("started_at", null);
    if (error) throw shareFailed(error);
  }

  const existing = await readShareRow(supabase, matchId);
  if (existing) {
    const { data, error } = await supabase
      .from("match_shares")
      .update(columns)
      .eq("match_id", matchId)
      .select(SHARE_SELECT)
      .single<MatchShareRow>();

    if (error) throw shareFailed(error);
    return { share: mapShare(data), summaryNeeded: needsPublicSummary(data, match.status) };
  }

  // A device token keeps the link it already showed; otherwise one is made here.
  const candidates = [isShareToken(input.token) ? input.token : null, generateShareToken()].filter(
    (token): token is string => token !== null
  );

  for (const token of candidates) {
    const { data, error } = await supabase
      .from("match_shares")
      .insert({ match_id: matchId, team_id: match.teamId, token, ...columns, created_by: userId })
      .select(SHARE_SELECT)
      .single<MatchShareRow>();

    if (!error) {
      return { share: mapShare(data), summaryNeeded: needsPublicSummary(data, match.status) };
    }

    if (error.code !== "23505") throw shareFailed(error);

    // Created meanwhile (another tab or a retry): change that one instead.
    if (await readShareRow(supabase, matchId)) {
      return saveMatchShare(supabase, userId, matchId, { ...input, token: undefined });
    }
    // Otherwise the token was taken: try the next (server-made) one.
  }

  throw new IntegrationError("SHARE_FAILED", "Kunne ikke lage delingslenke.", 500);
}

/** The public view of a shared match, or null (unknown, malformed or turned-off link). */
export async function getPublicMatchShare(supabase: SupabaseClient, token: string): Promise<PublicMatchShare | null> {
  if (!isShareToken(token)) return null;

  const { data, error } = await supabase.rpc("get_public_match_share", { p_token: token });

  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw new IntegrationError("SHARE_READ_FAILED", error.message, 500);
  }

  return sanitizePublicMatchShare(data);
}

/**
 * Writes the public summary of a completed, shared match from the public view
 * itself (see publicSummary.ts), tagged with the basis (fingerprint) of the
 * data it was written from. Nothing happens while the stored text already
 * matches the current data; a correction makes a new one, and until then the
 * public answer leaves the old text out (sanitizePublicMatchShare).
 *
 * The write is conditional, so a slow generation cannot win over newer data:
 * the data is read again after generating and the text is dropped when it
 * changed; it only lands on the same share (token) and level; and never over
 * a text that was started from later data. Errors are logged, never thrown:
 * this runs after the response.
 */
export async function refreshPublicSummary(supabase: SupabaseClient, matchId: string): Promise<void> {
  try {
    const row = await readShareRow(supabase, matchId);
    if (!row || !row.share_summary) return;

    const startedAt = new Date().toISOString();
    const view = await getPublicMatchShare(supabase, row.token);
    if (!view || view.phase !== "completed") return;

    const basis = publicSummaryBasis(view);
    if (view.summary?.status === "ready") return; // already written from exactly this data

    const { data: players } = await supabase.from("players").select("name").eq("team_id", row.team_id);
    const squadNames = (players ?? [])
      .map((player: { name?: unknown }) => (typeof player.name === "string" ? player.name : ""))
      .filter(Boolean);

    const summary = await generatePublicSummary(view, { squadNames });

    // The data changed while the text was written (a correction, a new
    // level, the link turned off): this text is old, the newer run writes.
    const current = await getPublicMatchShare(supabase, row.token);
    if (!current || current.phase !== "completed" || publicSummaryBasis(current) !== basis) {
      console.info("[public-summary] dropped, data changed", { matchId });
      return;
    }

    // Same share (a re-made link has a new token), same level, and no text
    // from a later run stored meanwhile (generated_at is when its run read).
    const { error } = await supabase
      .from("match_shares")
      .update({
        public_summary_text: summary.text,
        public_summary_level: view.detailLevel,
        public_summary_basis: basis,
        public_summary_generated_at: startedAt,
      })
      .eq("match_id", matchId)
      .eq("token", row.token)
      .eq("detail_level", view.detailLevel)
      .or(`public_summary_generated_at.is.null,public_summary_generated_at.lt."${startedAt}"`);

    if (error) throw error;
    console.info("[public-summary] stored", { matchId, source: summary.source });
  } catch (error) {
    console.error("[public-summary] failed", {
      matchId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
