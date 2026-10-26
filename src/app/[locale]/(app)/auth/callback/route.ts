import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ locale: string }> }
) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const { locale } = await context.params;
  const fallbackRedirect = locale === "no" ? "/no/team" : "/team";
  const next = requestUrl.searchParams.get("next") ?? fallbackRedirect;

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
