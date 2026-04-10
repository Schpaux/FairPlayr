import { NextResponse } from "next/server";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";
import { syncSpondUpcomingEventsForTeam } from "@/lib/server/integrations/spond/service";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePayload(value: unknown): { teamId: string } {
  if (typeof value !== "object" || value === null) {
    throw new Error("INVALID_PAYLOAD");
  }

  const payload = value as Record<string, unknown>;
  const teamId = typeof payload.teamId === "string" ? payload.teamId : "";

  if (!isUuid(teamId)) {
    throw new Error("INVALID_PAYLOAD");
  }

  return { teamId };
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const payload = parsePayload(await request.json());
    const summary = await syncSpondUpcomingEventsForTeam(supabase, userId, payload.teamId);
    return NextResponse.json(summary);
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
