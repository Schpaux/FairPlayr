import { NextResponse } from "next/server";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";
import { IntegrationError } from "@/lib/server/integrations/spond/errors";
import { getHomeSummary } from "@/lib/server/seasonStats";

// Home's personal data (team stats, player names, the next fixture), moved
// out of the server-rendered Home HTML so the page is a user-agnostic shell
// that a service worker may cache (FP-OFF-01 B6, §S.5). This response is
// per-user and must never be stored by a browser, proxy or service worker.
const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
  return response;
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const teamId = new URL(request.url).searchParams.get("teamId") ?? "";

    if (!isUuid(teamId)) {
      return NextResponse.json(
        { errorCode: "INVALID_TEAM_ID", message: "Ugyldig lag-id." },
        { status: 400, headers: NO_STORE }
      );
    }

    const result = await getHomeSummary(supabase, userId, teamId);

    if (result.status === "forbidden") {
      return NextResponse.json(
        { errorCode: "FORBIDDEN", message: "Du har ikke tilgang til dette laget." },
        { status: 403, headers: NO_STORE }
      );
    }

    return NextResponse.json(result.summary, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof IntegrationError) {
      // 401 from requireAuthenticatedSupabaseClient.
      return withNoStore(jsonError(error));
    }

    // Do not echo database error text to the client.
    console.error("[api/home/summary] failed", error);
    return NextResponse.json(
      { errorCode: "INTERNAL_ERROR", message: "Kunne ikke hente oversikten." },
      { status: 500, headers: NO_STORE }
    );
  }
}
