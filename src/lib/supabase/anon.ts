import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * A client without any session, for public reads (FEAT-SHARE-01). It never
 * reads or sets cookies, so a public page answers the same for everyone and
 * a signed-in visitor's session is not involved.
 */
export function createSupabaseAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
