import type { Metadata } from "next";
import { cache } from "react";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";
import { getPublicMatchShare } from "@/lib/server/share/service";
import { shareSignalTopic } from "@/lib/server/share/signal";
import { PublicMatchView } from "@/components/share/PublicMatchView";

/**
 * FEAT-SHARE-01: the public page of one shared match, the same link before,
 * during and after it. No app shell, no session, no service worker. The
 * answer is filtered in the database for the share's level; this page only
 * ever sees (and sends) that. Never indexed; the token is not passed on as
 * a referrer.
 */

type Props = { params: Promise<{ locale: string; token: string }> };

const loadShare = cache(async (token: string) => {
  try {
    return await getPublicMatchShare(createSupabaseAnonClient(), token);
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, token } = await params;
  await connection();
  const t = await getTranslations({ locale, namespace: "publicMatch" });
  const share = await loadShare(token);

  return {
    title: share
      ? t("metaTitle", { team: share.teamName, opponent: share.opponentName ?? t("opponentFallback") })
      : t("metaTitleFallback"),
    description: null,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    referrer: "no-referrer",
  };
}

export default async function PublicMatchPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  await connection();

  const share = await loadShare(token);

  return (
    <PublicMatchView
      token={token}
      locale={locale === "no" ? "no" : "en"}
      initialShare={share}
      initialFetchedAt={new Date().toISOString()}
      // Only for a working link; the topic is a hash, never the token itself.
      signalTopic={share ? shareSignalTopic(token) : null}
    />
  );
}
