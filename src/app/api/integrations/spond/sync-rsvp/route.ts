import { NextResponse } from "next/server";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";
import { syncSpondRsvpForMatch } from "@/lib/server/integrations/spond/service";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePayload(value: unknown): { matchId: string } {
  if (typeof value !== "object" || value === null) {
    throw new Error("INVALID_PAYLOAD");
  }

  const payload = value as Record<string, unknown>;
  const matchId = typeof payload.matchId === "string" ? payload.matchId : "";

  if (!isUuid(matchId)) {
    throw new Error("INVALID_PAYLOAD");
  }

  return { matchId };
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const payload = parsePayload(await request.json());
    const snapshot = await syncSpondRsvpForMatch(supabase, userId, payload.matchId);
    return NextResponse.json(snapshot);
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
