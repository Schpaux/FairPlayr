import { NextResponse } from "next/server";
import { getSpondStatus, upsertTeamSpondLink } from "@/lib/server/integrations/spond/service";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePayload(value: unknown): { teamId: string; externalTeamId: string; externalTeamName: string } {
  if (typeof value !== "object" || value === null) {
    throw new Error("INVALID_PAYLOAD");
  }

  const payload = value as Record<string, unknown>;
  const teamId = typeof payload.teamId === "string" ? payload.teamId : "";
  const externalTeamId = typeof payload.externalTeamId === "string" ? payload.externalTeamId.trim() : "";
  const externalTeamName = typeof payload.externalTeamName === "string" ? payload.externalTeamName.trim() : "";

  if (!isUuid(teamId) || !externalTeamId || !externalTeamName) {
    throw new Error("INVALID_PAYLOAD");
  }

  return {
    teamId,
    externalTeamId,
    externalTeamName,
  };
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const requestUrl = new URL(request.url);
    const teamId = requestUrl.searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ teamLink: null });
    }

    const status = await getSpondStatus(supabase, userId, teamId);

    return NextResponse.json({ teamLink: status.teamLink });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const payload = parsePayload(await request.json());

    await upsertTeamSpondLink(
      supabase,
      userId,
      payload.teamId,
      payload.externalTeamId,
      payload.externalTeamName
    );

    return NextResponse.json({ success: true });
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
