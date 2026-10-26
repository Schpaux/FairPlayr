import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OfflineActions } from "@/components/pwa/OfflineActions";

// The service worker's fallback for pages that need the network
// (FP-OFF-01 §2.1). Precached per build and served for any navigation that
// fails offline, so it must be the same for every user: translations only,
// no cookies, headers or server data (shellRouteSafety.test.ts).

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pwa.offline");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function OfflinePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pwa.offline");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-10 pb-8" data-testid="offline-page">
      <div className="flex flex-col gap-2">
        <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-fp-ink">{t("title")}</h1>
        <p className="text-base text-fp-ink-2">{t("body")}</p>
      </div>
      <OfflineActions />
    </div>
  );
}
