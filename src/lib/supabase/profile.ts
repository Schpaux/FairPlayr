import type { SupabaseClient } from "@supabase/supabase-js";

function resolvePreferredLanguage(locale?: string | null) {
  return locale === "no" ? "no" : "en";
}

function resolveDisplayName({
  email,
  metadata,
}: {
  email?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const metadataName =
    typeof metadata?.full_name === "string"
      ? metadata.full_name
      : typeof metadata?.name === "string"
        ? metadata.name
        : null;

  if (metadataName?.trim()) {
    return metadataName.trim();
  }

  return email?.split("@")[0] ?? null;
}

export async function ensureUserProfile({
  supabase,
  userId,
  userEmail,
  userMetadata,
  preferredLanguage,
}: {
  supabase: SupabaseClient;
  userId: string;
  userEmail?: string | null;
  userMetadata?: Record<string, unknown>;
  preferredLanguage?: string;
}) {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      display_name: resolveDisplayName({ email: userEmail, metadata: userMetadata }),
      preferred_language: resolvePreferredLanguage(preferredLanguage),
      preferred_theme: "system",
    },
    { onConflict: "id" }
  );

  if (error) {
    throw new Error(error.message);
  }
}