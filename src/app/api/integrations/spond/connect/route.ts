import { NextResponse } from "next/server";
import { connectSpond } from "@/lib/server/integrations/spond/service";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";

function parsePayload(value: unknown): { email: string; password: string } {
  if (typeof value !== "object" || value === null) {
    throw new Error("INVALID_PAYLOAD");
  }

  const payload = value as Record<string, unknown>;
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!email || !password || !email.includes("@")) {
    throw new Error("INVALID_PAYLOAD");
  }

  return { email, password };
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const payload = parsePayload(await request.json());

    const result = await connectSpond(supabase, userId, payload);

    return NextResponse.json({
      connected: true,
      accountLabel: result.accountLabel,
    });
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
