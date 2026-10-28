import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ButtonLink } from "@/components/ui/primitives/Button";
import { HeroLiveDemo } from "@/components/marketing/HeroLiveDemo";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import styles from "@/components/marketing/Landing.module.css";
import { APP_HOME_PATH } from "@/lib/appRoutes";
import { routing } from "@/i18n/routing";
import { websiteMetadata, type WebsiteLocale } from "@/lib/marketing/seo";
import { cn } from "@/lib/utils";

// The front page (WEB-01 phase 1, MARKETING.md §5): a floodlit match moment
// with the app's own live screen, then the minutes it is built around.
// Static and the same for every user (precached by the service worker):
// translations only, no cookies, headers or Supabase (shellRouteSafety.test.ts).

type Props = {
  params: Promise<{ locale: string }>;
};

// Prerendered per locale (SSG, WEB-01 phase 0): the same HTML for everyone,
// cacheable by the CDN. App routes stay dynamic.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.home" });
  return websiteMetadata({ locale: locale as WebsiteLocale, segment: "", title: t("metaTitle"), description: t("metaDescription") });
}

const STORY_ROWS = ["minutes", "gap", "undo"] as const;

/** The centre circle, split across the hero and the next section. */
function CentreArc({ half }: { half: "top" | "bottom" }) {
  return (
    <svg className={cn(styles.arc, half === "top" ? styles.arcTop : styles.arcBottom)} viewBox="0 0 400 200" aria-hidden>
      <path d={half === "top" ? "M2 200 A198 198 0 0 1 398 200" : "M2 0 A198 198 0 0 0 398 0"} pathLength={1} />
      {half === "top" ? <circle cx="200" cy="200" r="5" /> : null}
    </svg>
  );
}

export default async function MarketingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing.home");
  const common = await getTranslations("common");

  return (
    <div className={styles.page} data-testid="marketing-page">
      <a href="#innhold" className={styles.skip}>
        {t("skip")}
      </a>
      <SiteHeader />

      <main id="innhold">
        <section className={cn("dark", styles.hero)} aria-labelledby="hero-title">
          <div className={styles.scene} aria-hidden>
            <div className={styles.turf}>
              <svg className={styles.turfLines} viewBox="0 0 680 1000" preserveAspectRatio="none">
                <rect x="20" y="20" width="640" height="960" />
                <line x1="20" y1="500" x2="660" y2="500" />
                <circle cx="340" cy="500" r="92" />
                <rect x="190" y="20" width="300" height="150" />
                <rect x="270" y="20" width="140" height="56" />
                <rect x="190" y="830" width="300" height="150" />
                <rect x="270" y="924" width="140" height="56" />
              </svg>
            </div>
            <div className={styles.turfFade} />
            <div className={styles.lights} />
            <div className={styles.floor} />
          </div>

          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <p className={styles.kicker}>{t("hero.kicker")}</p>
              <h1 id="hero-title" className={styles.heroTitle}>
                <span className={styles.heroLine}>{t("hero.title")}</span>{" "}
                <span className={styles.heroLine}>{t("hero.titleSecond")}</span>
              </h1>
              <p className={styles.heroLede}>{t("hero.lede")}</p>
              <div className={styles.heroActions}>
                <ButtonLink href={APP_HOME_PATH} variant="primary" className={styles.heroCta}>
                  {t("hero.cta")}
                </ButtonLink>
                <a href="#slik-virker-det" className={styles.heroSecondary}>
                  {t("hero.secondary")}
                </a>
                <a
                  href="https://www.youtube.com/watch?v=pU1dnde4bLo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.heroSecondary}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                    <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
                  </svg>{" "}
                  {t("hero.film")}
                </a>
              </div>
              <p className={styles.assurance}>{t("hero.assurance")}</p>
            </div>
            <HeroLiveDemo />
          </div>

          <CentreArc half="top" />
        </section>

        <section id="slik-virker-det" className={styles.story} aria-labelledby="story-title">
          <CentreArc half="bottom" />
          <div className={styles.storyInner}>
            <header className={styles.storyHead}>
              <h2 id="story-title" className={styles.storyTitle}>
                {t("story.title")}
              </h2>
              <p className={styles.storyLede}>{t("story.lede")}</p>
            </header>

            <ul id="spilletid" className={styles.storyRows}>
              {STORY_ROWS.map((row) => (
                <li key={row} className={styles.storyRow}>
                  <p className={cn(styles.storyFigure, "font-num")} aria-hidden>
                    {t(`story.rows.${row}.figure`)}
                  </p>
                  <div className={styles.storyText}>
                    <h3 className={styles.storyRowTitle}>{t(`story.rows.${row}.title`)}</h3>
                    <p className={styles.storyBody}>{t(`story.rows.${row}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className={styles.storyClose}>
              <div className={styles.offline}>
                <WifiOff size={22} strokeWidth={1.75} aria-hidden className={styles.offlineIcon} />
                <div>
                  <p className={styles.offlineTitle}>{t("story.offlineTitle")}</p>
                  <p className={styles.storyBody}>{t("story.offlineBody")}</p>
                </div>
              </div>
              <ButtonLink href={APP_HOME_PATH} variant="primary">
                {t("story.cta")}
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          {/* The header carries the named logo; this one repeats it. */}
          <div aria-hidden>
            <BrandLogo label={common("appName")} className="w-[150px]" />
          </div>
          <p className={styles.footerNote}>{t("footer.note")}</p>
          <p className={styles.footerNote}>
            {t("footer.contact")}: <a href="mailto:support@fairplayr.app">support@fairplayr.app</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
