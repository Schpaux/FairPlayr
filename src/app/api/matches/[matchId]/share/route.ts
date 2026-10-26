import { NextResponse, after } from "next/server";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";
import { getMatchShare, refreshPublicSummary, saveMatchShare } from "@/lib/server/share/service";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function invalidMatchId() {
  return NextResponse.json({ errorCode: "INVALID_MATCH_ID", message: "Ugyldig kamp-id." }, { status: 400 });
}

/** FEAT-SHARE-01: the coach reads the match's share. */
export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const { matchId } = await context.params;
    if (!isUuid(matchId)) return invalidMatchId();

    const { share, summaryNeeded } = await getMatchShare(supabase, userId, matchId);
    // A completed match whose public summary was never written gets it now (once).
    if (summaryNeeded) after(() => refreshPublicSummary(supabase, matchId));

    return NextResponse.json({ share });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * FEAT-SHARE-01: the coach sets the share (switches, level, age group).
 * Both switches off removes it, and the old link stops working.
 */
export async function PUT(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const { matchId } = await context.params;
    if (!isUuid(matchId)) return invalidMatchId();

    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ errorCode: "INVALID_PAYLOAD", message: "Ugyldig forespørsel." }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const { share, summaryNeeded } = await saveMatchShare(supabase, userId, matchId, {
      live: input.live,
      summary: input.summary,
      detailLevel: input.detailLevel,
      ageGroup: input.ageGroup,
      token: input.token,
      kickoffAt: "kickoffAt" in input ? input.kickoffAt : undefined,
      discardPlaceholder: input.discardPlaceholder,
    });

    if (summaryNeeded) after(() => refreshPublicSummary(supabase, matchId));

    return NextResponse.json({ share });
  } catch (error) {
    return jsonError(error);
  }
}
