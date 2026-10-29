import type { Metadata } from "next";
import { ArrowDown, ArrowLeft, ArrowUpRight, Check, MoveRight } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ButtonLink } from "@/components/ui/primitives/Button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { APP_HOME_PATH } from "@/lib/appRoutes";
import { formatRoadmapDate, getWebsiteRoadmap, type PublicMilestone } from "@/lib/marketing/roadmap";
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
  const { developing, planned, released, latest } = getWebsiteRoadmap(locale);
  const groups = Map.groupBy(released, (item) => item.date?.slice(0, 7) ?? "undated");
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
            <Link href="/" className={styles.back}><ArrowLeft size={16} aria-hidden />{t("home")}</Link>
            <div className={styles.heroGrid}>
              <div>
                <p className={styles.eyebrow}>{t("eyebrow")}</p>
                <h1 id="roadmap-title" className={styles.title}>{t("title")}<br />{t("titleSecond")}</h1>
                <p className={styles.intro}>{t("intro")}</p>
                <div className={styles.heroActions}>
                  <ButtonLink href={APP_HOME_PATH} variant="primary">{t("openApp")}<ArrowUpRight size={18} aria-hidden /></ButtonLink>
                  <a href="#upcoming" className={styles.textLink}>{t("explore")}<ArrowDown size={16} aria-hidden /></a>
                </div>
              </div>
              {latest && (
                <aside className={styles.latest} aria-labelledby="latest-title">
                  <div className={styles.latestArc} aria-hidden />
                  <p className={styles.eyebrow}><Check size={15} aria-hidden />{t("latest")}</p>
                  <h2 id="latest-title">{latest.title}</h2>
                  <p className={styles.latestBody}>{latest.summary}</p>
                  <p className={styles.date}>{date(latest)}</p>
                  <a href="#history" className={styles.textLink}>{t("seeHistory")}<MoveRight size={17} aria-hidden /></a>
                </aside>
              )}
            </div>
          </div>
        </section>

        <nav className={styles.sectionNav} aria-label={t("sectionNav")}>
          <div className={styles.sectionNavInner}>
            <a href="#upcoming"><span className={styles.activeDot} aria-hidden />{t("developing")}</a>
            <a href="#planned">{t("planned")}</a>
            <a href="#history">{t("released")}<ArrowDown size={14} aria-hidden /></a>
          </div>
        </nav>

        <section id="upcoming" className={styles.upcoming} aria-labelledby="upcoming-title">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>{t("nextChapter")}</p>
            <h2 id="upcoming-title">{t("upcomingTitle")}</h2>
            <p>{t("upcomingIntro")}</p>
          </div>
          <div className={styles.forwardGrid}>
            <div className={styles.developing}>
              <h3 className={styles.stateHeading}><span className={styles.activeDot} aria-hidden />{t("developing")}</h3>
              {developing.length === 0 ? <p className={styles.empty}>{t("emptyDeveloping")}</p> : developing.map((item) => (
                <article key={item.id} className={styles.forwardItem}>
                  <h4>{item.title}</h4><p>{item.summary}</p>
                </article>
              ))}
              <p className={styles.progressNote}>{t("developingNote")}</p>
            </div>
            <div id="planned" className={styles.planned}>
              <h3 className={styles.stateHeading}>{t("planned")}</h3>
              {planned.length === 0 ? <p className={styles.empty}>{t("emptyPlanned")}</p> : planned.map((item) => (
                <article key={item.id} className={styles.forwardItem}>
                  <h4>{item.title}</h4><p>{item.summary}</p>
                </article>
              ))}
              <p className={styles.progressNote}>{t("planNote")}</p>
            </div>
          </div>
        </section>

        <section id="history" className={styles.history} aria-labelledby="history-title">
          <div className={styles.historyHead}>
            <div><p className={styles.eyebrow}>{t("historyEyebrow")}</p><h2 id="history-title">{t("historyTitle")}</h2></div>
            <p>{t("historyIntro")}</p>
          </div>
          {released.length === 0 && <p className={styles.empty}>{t("emptyHistory")}</p>}
          {Array.from(groups, ([month, items]) => (
            <section key={month} className={styles.month} aria-labelledby={`month-${month}`}>
              <h3 id={`month-${month}`} className={styles.monthTitle}>{month === "undated" ? t("undated") : formatRoadmapDate(month, locale, true)}</h3>
              <ol className={styles.timeline} role="list">
                {items.map((item) => (
                  <li key={item.id} className={item.milestone ? styles.milestone : styles.update}>
                    <span className={styles.timelineDot} aria-hidden><Check size={12} /></span>
                    <div className={styles.entryMeta}><span>{t(item.milestone ? "milestone" : "improvement")}</span><span className={styles.date}>{date(item)}</span></div>
                    <h4>{item.title}</h4><p className={styles.entryBody}>{item.summary}</p>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <div><p className={styles.eyebrow}>{t("closingEyebrow")}</p><h2 id="closing-title">{t("closingTitle")}</h2><p>{t("closingBody")}</p></div>
          <ButtonLink href={APP_HOME_PATH} variant="primary">{t("openApp")}<ArrowUpRight size={18} aria-hidden /></ButtonLink>
        </section>
      </main>
      <footer className={styles.footer}>
        <Link href="/" aria-label={t("home")}><BrandLogo label={common("appName")} className="w-[150px]" /></Link>
        <p>{t("footer")}</p><Link href="/" className={styles.textLink}>{t("home")}<ArrowUpRight size={16} aria-hidden /></Link>
      </footer>
    </div>
  );
}
