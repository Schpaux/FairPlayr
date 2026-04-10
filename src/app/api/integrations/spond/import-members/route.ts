import { NextResponse } from "next/server";
import { importSelectedSpondMembersToTeam } from "@/lib/server/integrations/spond/service";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePayload(value: unknown): { teamId: string; selectedExternalIds: string[] } {
  if (typeof value !== "object" || value === null) {
    throw new Error("INVALID_PAYLOAD");
  }

  const payload = value as Record<string, unknown>;
  const teamId = typeof payload.teamId === "string" ? payload.teamId : "";
  const selectedExternalIds = Array.isArray(payload.selectedExternalIds)
    ? payload.selectedExternalIds.filter((entry): entry is string => typeof entry === "string")
    : [];

  if (!isUuid(teamId) || selectedExternalIds.length === 0) {
    throw new Error("INVALID_PAYLOAD");
  }

  return { teamId, selectedExternalIds };
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const payload = parsePayload(await request.json());
    const summary = await importSelectedSpondMembersToTeam(
      supabase,
      userId,
      payload.teamId,
      payload.selectedExternalIds
    );

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
