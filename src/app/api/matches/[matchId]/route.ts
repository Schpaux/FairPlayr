import { NextResponse } from "next/server";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";
import { getMatchById, updateMatchStatus } from "@/lib/server/matches/service";
import type { MatchStatus } from "@/lib/server/matches/types";

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

    const match = await getMatchById(supabase, userId, matchId);
    return NextResponse.json({ match });
  } catch (error) {
    return jsonError(error);
  }
}

function parsePatchPayload(value: unknown): { status: MatchStatus } {
  if (typeof value !== "object" || value === null) {
    throw new Error("INVALID_PAYLOAD");
  }

  const payload = value as Record<string, unknown>;
  const status = payload.status;

  if (status !== "draft" && status !== "upcoming" && status !== "live" && status !== "completed") {
    throw new Error("INVALID_PAYLOAD");
  }

  return { status };
}

export async function PATCH(
  request: Request,
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

    const payload = parsePatchPayload(await request.json());
    const match = await updateMatchStatus(supabase, userId, {
      matchId,
      status: payload.status,
    });

    return NextResponse.json({ match });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PAYLOAD") {
      return NextResponse.json(
        {
          errorCode: "INVALID_PAYLOAD",
          message: "Ugyldig forespørsel.",
        },
        { status: 400 }
      );
    }

    return jsonError(error);
  }
}
