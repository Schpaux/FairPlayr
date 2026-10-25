import type { User } from "@supabase/supabase-js";

/**
 * The display name and photo from the signed-in user's metadata (Google sets
 * `full_name`/`avatar_url`, others `name`/`picture`). Shared by the profile
 * sheet and Settings (C5-F5); nothing else is read.
 */
export function readProfileMetadata(user: Pick<User, "user_metadata"> | null | undefined) {
  const metadata = user?.user_metadata as Record<string, unknown> | undefined;
  const name =
    (typeof metadata?.full_name === "string" ? metadata.full_name : null) ??
    (typeof metadata?.name === "string" ? metadata.name : null);
  const photoUrl =
    (typeof metadata?.avatar_url === "string" ? metadata.avatar_url : null) ??
    (typeof metadata?.picture === "string" ? metadata.picture : null);

  return {
    name,
    photoUrl,
  };
}
