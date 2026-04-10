import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function resolveLocaleFromCookie(request: NextRequest) {
  const locale = request.cookies.get("NEXT_LOCALE")?.value;
  return locale === "no" ? "no" : "en";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const locale = resolveLocaleFromCookie(request);
  const fallbackRedirect = locale === "no" ? "/no/team" : "/team";
  const next = requestUrl.searchParams.get("next") ?? fallbackRedirect;

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
