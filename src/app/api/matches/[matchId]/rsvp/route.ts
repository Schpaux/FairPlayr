import { NextResponse } from "next/server";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";
import { getLatestSpondRsvpSnapshotForMatch } from "@/lib/server/integrations/spond/service";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ matchId: string }> }
) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const { matchId } = await context.params;

    if (!isUuid(matchId)) {
      return NextResponse.json(
        {
          errorCode: "INVALID_MATCH_ID",
          message: "Ugyldig kamp-id.",
        },
        { status: 400 }
      );
    }

    const snapshot = await getLatestSpondRsvpSnapshotForMatch(supabase, userId, matchId);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return jsonError(error);
  }
}
