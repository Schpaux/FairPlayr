import { NextResponse } from "next/server";
import { getSpondGroups } from "@/lib/server/integrations/spond/service";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";

export async function GET() {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const groups = await getSpondGroups(supabase, userId);

    return NextResponse.json({ groups });
  } catch (error) {
    return jsonError(error);
  }
}
