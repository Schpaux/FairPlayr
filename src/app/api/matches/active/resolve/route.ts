import { NextResponse } from "next/server";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";
import { getActiveMatchForUser } from "@/lib/server/matches/service";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const requestUrl = new URL(request.url);
    const teamIdRaw = requestUrl.searchParams.get("teamId");
    const teamId = teamIdRaw && isUuid(teamIdRaw) ? teamIdRaw : null;

    const resolution = await getActiveMatchForUser(supabase, userId, teamId);

    return NextResponse.json(resolution);
  } catch (error) {
    return jsonError(error);
  }
}
