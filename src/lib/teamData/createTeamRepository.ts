import type { SupabaseClient } from "@supabase/supabase-js";
import { createLocalTeamRepository } from "@/lib/teamData/localTeamRepository";
import { createSupabaseTeamRepository } from "@/lib/teamData/supabaseTeamRepository";
import type { TeamRepository } from "@/lib/teamData/types";

export function createTeamRepository({
  supabase,
  userId,
  userEmail,
}: {
  supabase: SupabaseClient;
  userId?: string;
  userEmail?: string | null;
}): TeamRepository {
  if (!userId) {
    return createLocalTeamRepository();
  }

  return createSupabaseTeamRepository({
    supabase,
    userId,
    userEmail,
  });
}
