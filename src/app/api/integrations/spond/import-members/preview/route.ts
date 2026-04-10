import { NextResponse } from "next/server";
import { getSpondMemberImportPreview } from "@/lib/server/integrations/spond/service";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const teamId = requestUrl.searchParams.get("teamId") ?? "";

    if (!isUuid(teamId)) {
      return NextResponse.json(
        {
          errorCode: "INVALID_PAYLOAD",
          message: "Ugyldig forespørsel.",
        },
        { status: 400 }
      );
    }

    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const preview = await getSpondMemberImportPreview(supabase, userId, teamId);

    return NextResponse.json(preview);
  } catch (error) {
    return jsonError(error);
  }
}
