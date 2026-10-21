import type { SupabaseClient } from "@supabase/supabase-js";
import { createLocalTeamRepository } from "@/lib/teamData/localTeamRepository";
import { createMirroredTeamRepository } from "@/lib/teamData/mirroredTeamRepository";
import { createSupabaseTeamRepository } from "@/lib/teamData/supabaseTeamRepository";
import type { TeamRepository } from "@/lib/teamData/types";

export function createTeamRepository({
  supabase,
  userId,
  userEmail,
  serverAvailable = true,
}: {
  supabase: SupabaseClient;
  userId?: string;
  userEmail?: string | null;
  /**
   * False while the session is deferred (B10) or the device is offline: the
   * cloud repository then reads the local mirror only, read-only.
   */
  serverAvailable?: boolean;
}): TeamRepository {
  if (!userId) {
    return createLocalTeamRepository();
  }

  return createMirroredTeamRepository({
    inner: createSupabaseTeamRepository({
      supabase,
      userId,
      userEmail,
    }),
    userId,
    serverAvailable,
  });
}
