import { NextResponse } from "next/server";
import { getSpondStatus } from "@/lib/server/integrations/spond/service";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const requestUrl = new URL(request.url);
    const teamId = requestUrl.searchParams.get("teamId") ?? undefined;
    const status = await getSpondStatus(supabase, userId, teamId);

    return NextResponse.json(status);
  } catch (error) {
    return jsonError(error);
  }
}
