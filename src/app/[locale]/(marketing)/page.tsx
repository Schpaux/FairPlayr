import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ButtonLink } from "@/components/ui/primitives/Button";
import { APP_HOME_PATH } from "@/lib/appRoutes";

// Temporary front page (WEB-01d) until the website (WEB-01B) replaces it:
// the logo, one line and the way into the app. Static and the same for every
// user (precached by the service worker): translations only, no cookies,
// headers or Supabase (shellRouteSafety.test.ts).

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.placeholder" });
  return { title: t("metaTitle"), description: t("body") };
}

export default async function MarketingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing.placeholder");
  const common = await getTranslations("common");

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 pt-safe pb-safe pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
      data-testid="marketing-page"
    >
      <BrandLogo label={common("appName")} className="-ml-[7px] w-[200px]" />
      <div className="flex flex-col gap-2">
        <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-fp-ink">{t("title")}</h1>
        <p className="text-base text-fp-ink-2">{t("body")}</p>
      </div>
      <ButtonLink href={APP_HOME_PATH} variant="primary" block>
        {t("openApp")}
      </ButtonLink>
    </main>
  );
}
