import { NextResponse } from "next/server";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";
import { createManualMatch, getTeamMatches } from "@/lib/server/matches/service";
import type { MatchFormat, MatchStatus } from "@/lib/server/matches/types";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseCreatePayload(value: unknown): {
  teamId: string;
  title: string;
  opponentName: string | null;
  startsAt: string;
  location: string | null;
  format: MatchFormat;
  reportEnabled: boolean;
  status: MatchStatus;
} {
  if (typeof value !== "object" || value === null) {
    throw new Error("INVALID_PAYLOAD");
  }

  const payload = value as Record<string, unknown>;
  const teamId = typeof payload.teamId === "string" ? payload.teamId : "";
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const startsAt = typeof payload.startsAt === "string" ? payload.startsAt : "";
  const opponentName =
    typeof payload.opponentName === "string" && payload.opponentName.trim()
      ? payload.opponentName.trim()
      : null;
  const location =
    typeof payload.location === "string" && payload.location.trim()
      ? payload.location.trim()
      : null;
  const status = payload.status === "draft" || payload.status === "live" || payload.status === "completed"
    ? payload.status
    : "upcoming";
  const format =
    payload.format === "3v3" ||
    payload.format === "5v5" ||
    payload.format === "7v7" ||
    payload.format === "9v9" ||
    payload.format === "11v11"
      ? payload.format
      : "5v5";
  const reportEnabled = payload.reportEnabled === true;

  if (!isUuid(teamId) || !title || !startsAt || Number.isNaN(Date.parse(startsAt))) {
    throw new Error("INVALID_PAYLOAD");
  }

  return {
    teamId,
    title,
    opponentName,
    startsAt,
    location,
    format,
    reportEnabled,
    status,
  };
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const requestUrl = new URL(request.url);
    const teamId = requestUrl.searchParams.get("teamId") ?? "";

    if (!isUuid(teamId)) {
      return NextResponse.json(
        {
          errorCode: "INVALID_TEAM_ID",
          message: "Ugyldig lag-id.",
        },
        { status: 400 }
      );
    }

    const matches = await getTeamMatches(supabase, userId, teamId);
    return NextResponse.json({ matches });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const payload = parseCreatePayload(await request.json());
    const match = await createManualMatch(supabase, userId, payload);
    return NextResponse.json({ match }, { status: 201 });
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
