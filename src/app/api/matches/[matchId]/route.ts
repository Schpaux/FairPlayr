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

function parsePatchPayload(value: unknown): {
  status?: MatchStatus;
  runtimeState?: Record<string, unknown> | null;
} {
  if (typeof value !== "object" || value === null) {
    throw new Error("INVALID_PAYLOAD");
  }

  const payload = value as Record<string, unknown>;
  const status = payload.status;
  const hasStatus =
    status === "draft" || status === "upcoming" || status === "live" || status === "completed";
  const hasRuntimeState = "runtimeState" in payload;

  if (!hasStatus && !hasRuntimeState) {
    throw new Error("INVALID_PAYLOAD");
  }

  if (hasStatus) {
    return {
      status,
      runtimeState:
        hasRuntimeState && typeof payload.runtimeState === "object"
          ? (payload.runtimeState as Record<string, unknown>)
          : payload.runtimeState === null
            ? null
            : undefined,
    };
  }

  if (hasRuntimeState && payload.runtimeState !== null && typeof payload.runtimeState !== "object") {
    throw new Error("INVALID_PAYLOAD");
  }

  return {
    runtimeState: payload.runtimeState === null ? null : (payload.runtimeState as Record<string, unknown>),
  };
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
      runtimeState: payload.runtimeState,
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
