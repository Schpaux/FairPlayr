import { getLocale, getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Link } from "@/i18n/navigation";
import { APP_HOME_PATH } from "@/lib/appRoutes";
import { cn } from "@/lib/utils";
import styles from "./Landing.module.css";

/**
 * The website's header (WEB-01 phase 1). It sits on the night scene, so it is
 * always dark (`.dark`): the chalk master of the logo (BRAND.md §5), anchors
 * into the page, the other language and a quiet way into the app. The lime
 * action stays in the hero (one lime action per viewport, MARKETING.md §3).
 */
export async function SiteHeader() {
  const locale = await getLocale();
  const t = await getTranslations("marketing.home.nav");
  const common = await getTranslations("common");
  const otherLocale = locale === "no" ? "en" : "no";

  return (
    <header className={cn("dark", styles.header)}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.headerLogo} aria-label={common("appName")}>
          <BrandLogo label={common("appName")} className="w-[150px]" />
        </Link>
        <nav className={styles.headerNav} aria-label={t("label")}>
          <a href="#slik-virker-det" className={styles.headerLink}>
            {t("how")}
          </a>
          <a href="#spilletid" className={cn(styles.headerLink, styles.headerLinkWide)}>
            {t("minutes")}
          </a>
          <Link href="/" locale={otherLocale} className={styles.headerLink} hrefLang={otherLocale === "no" ? "nb" : "en"} aria-label={t("languageLabel")}>
            {t("language")}
          </Link>
          <Link href={APP_HOME_PATH} className={styles.headerApp}>
            {t("openApp")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
