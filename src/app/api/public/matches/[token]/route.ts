import { NextResponse } from "next/server";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";
import { getPublicMatchShare } from "@/lib/server/share/service";

/**
 * FEAT-SHARE-01: the public view of a shared match, for the page's refresh.
 * No session; the answer is filtered in the database for the share's level.
 * Never cached, never indexed. An unknown and a turned-off link answer alike.
 */
const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
};

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  try {
    const share = await getPublicMatchShare(createSupabaseAnonClient(), token);
    if (!share) {
      return NextResponse.json({ share: null }, { status: 404, headers: HEADERS });
    }
    return NextResponse.json({ share, fetchedAt: new Date().toISOString() }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ share: null }, { status: 503, headers: HEADERS });
  }
}
