import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IntegrationError } from "@/lib/server/integrations/spond/errors";

export async function requireAuthenticatedSupabaseClient(): Promise<{
  supabase: SupabaseClient;
  userId: string;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new IntegrationError("UNAUTHORIZED", "Du må være logget inn.", 401);
  }

  return {
    supabase,
    userId: data.user.id,
  };
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof IntegrationError) {
    return NextResponse.json(
      {
        errorCode: error.code,
        message: error.message,
      },
      { status: error.status }
    );
  }

  const fallbackMessage = error instanceof Error ? error.message : "Ukjent feil.";

  return NextResponse.json(
    {
      errorCode: "INTERNAL_ERROR",
      message: fallbackMessage,
    },
    { status: 500 }
  );
}
