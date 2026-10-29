import type { Metadata } from "next";
import { ArrowDown, ArrowUpRight, Check } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { RoadmapShareDemo } from "@/components/marketing/RoadmapShareDemo";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Link } from "@/i18n/navigation";
import { pickMessages } from "@/i18n/clientMessages";
import { routing } from "@/i18n/routing";
import { formatRoadmapDate, getWebsiteRoadmap, hasMilestonePreview, type PublicMilestone } from "@/lib/marketing/roadmap";
import { websiteMetadata, type WebsiteLocale } from "@/lib/marketing/seo";
import styles from "@/components/marketing/Roadmap.module.css";
import landing from "@/components/marketing/Landing.module.css";

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.roadmap" });
  return websiteMetadata({ locale: locale as WebsiteLocale, segment: "/roadmap", title: t("metaTitle"), description: t("metaDescription") });
}

export default async function RoadmapPage({ params }: Props) {
  const { locale: value } = await params;
  setRequestLocale(value);
  const locale = value as WebsiteLocale;
  const t = await getTranslations("marketing.roadmap");
  const common = await getTranslations("common");
  const { upcoming, released, latest } = getWebsiteRoadmap(locale);
  // Preview capability is presentation code, never a second roadmap/content list.
  const hasPreview = hasMilestonePreview(latest);
  const previewMessages = hasPreview ? pickMessages(await getMessages(), ["publicMatch", "eventTimeline", "marketing.roadmap.demo"]) : {};
  const date = (item: PublicMilestone) => item.date ? (
    <span>{t(item.dateKind === "available_by" ? "availableBy" : "releasedOn")} <time dateTime={item.date}>{formatRoadmapDate(item.date, locale)}</time></span>
  ) : <span>{t("releaseUndated")}</span>;

  return (
    <div className={`dark ${styles.page}`} data-testid="roadmap-page">
      <a href="#content" className={landing.skip}>{t("skip")}</a>
      <SiteHeader segment="/roadmap" />
      <main id="content">
        <section className={styles.hero} aria-labelledby="roadmap-title">
          <div className={styles.heroInner}>
            <header className={styles.pageIntro}>
              <h1 id="roadmap-title">{t("metaTitle")}</h1>
              <p>{t("intro")}</p>
            </header>
            {latest && <div className={`${styles.heroGrid} ${hasPreview ? "" : styles.textOnly}`} data-preview={hasPreview ? "live" : "static"}>
              <div className={styles.featureCopy}>
                <p className={styles.eyebrow}><Check size={15} aria-hidden />{t("latest")}</p>
                <h2 className={styles.title}>{latest.title}</h2>
              </div>
              {hasPreview && <NextIntlClientProvider locale={locale} messages={previewMessages}>
                <RoadmapShareDemo />
              </NextIntlClientProvider>}
              <div className={styles.featureDetails}>
                <p className={styles.featureBody}>{latest.summary}</p>
                <p className={styles.date}>{date(latest)}</p>
                <a href="#history" className={styles.textLink}>{t("seeHistory")}<ArrowDown size={16} aria-hidden /></a>
              </div>
            </div>}
          </div>
        </section>

        <section id="history" className={styles.history} aria-labelledby="history-title">
          <header className={styles.historyHead}>
            <h2 id="history-title">{t("timelineTitle")}</h2>
            <p>{t("planNote")}</p>
          </header>
          <ol className={styles.timeline} role="list" data-testid="roadmap-timeline">
            {[...upcoming, ...released].map((item, index) => {
              const future = item.state !== "released";
              const groupStart = index === 0 || index === upcoming.length;
              return (
                <li key={item.id} className={`${future ? styles.future : styles.released} ${item.milestone ? styles.milestone : styles.update}`} data-state={future ? "upcoming" : "released"}>
                  {groupStart && <h3 className={styles.groupTitle}>{t(future ? "coming" : "released")}</h3>}
                  <article className={styles.entry}>
                    <span className={styles.timelineDot} aria-hidden>{future ? null : <Check size={12} />}</span>
                    {!future && <p className={styles.entryDate}>{date(item)}</p>}
                    <h4>{item.title}</h4><p className={styles.entryBody}>{item.summary}</p>
                  </article>
                </li>
              );
            })}
          </ol>
          {upcoming.length + released.length === 0 && <p className={styles.empty}>{t("emptyHistory")}</p>}
        </section>
      </main>
      <footer className={styles.footer}>
        <Link href="/" aria-label={t("home")}><BrandLogo label={common("appName")} className="w-[150px]" /></Link>
        <Link href="/" className={styles.textLink}>{t("home")}<ArrowUpRight size={16} aria-hidden /></Link>
      </footer>
    </div>
  );
}
