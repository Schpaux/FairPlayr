import type { Metadata, MetadataRoute } from "next";
import { WEBSITE_SEGMENTS } from "./routes";

/**
 * The website's search metadata (WEB-01g, FP-WEB-01 phase 0). Everything is
 * built behind one switch, `WEBSITE_INDEXABLE`: while it is false the
 * website says `noindex, nofollow`, the sitemap is empty and robots.txt names
 * no sitemap. Turned on for the landing page on 2026-10-28 (owner decision,
 * MARKETING.md §13.2); app, sign-in and public match pages keep their own
 * `noindex`.
 */

/** The canonical host, also when the page is served from another one. */
export const SITE_URL = "https://fairplayr.app";

/**
 * The one switch for indexing (WEB-01g). Only the canonical production host
 * is indexable: every other host gets `X-Robots-Tag: noindex`
 * (`noindexHostHeaders`).
 */
export const WEBSITE_INDEXABLE: boolean = true;

/**
 * The only host that may be indexed. Every other host answers
 * `X-Robots-Tag: noindex` on every response (`next.config.ts`): the Vercel
 * production domain, deployment URLs and every preview deployment. Exact
 * hostname.
 */
export const INDEXABLE_HOST = "fairplayr.app";

export type WebsiteLocale = "en" | "no";
export type WebsiteSegment = (typeof WEBSITE_SEGMENTS)[number];

/** hreflang per locale: `nb` (Bokmål) for Norwegian, as in the manifest. */
const HREFLANG: Record<WebsiteLocale, string> = { en: "en", no: "nb" };
const OG_LOCALE: Record<WebsiteLocale, string> = { en: "en_GB", no: "nb_NO" };
const LOCALES: WebsiteLocale[] = ["en", "no"];

/** Absolute URL of a website page: no query, no trailing slash except the root. */
export function websiteUrl(locale: WebsiteLocale, segment: WebsiteSegment): string {
  const path = locale === "en" ? segment || "/" : `/${locale}${segment}`;
  return `${SITE_URL}${path}`;
}

/** Canonical and language alternates; `x-default` is English. */
export function websiteAlternates(locale: WebsiteLocale, segment: WebsiteSegment): NonNullable<Metadata["alternates"]> {
  return {
    canonical: websiteUrl(locale, segment),
    languages: {
      ...Object.fromEntries(LOCALES.map((candidate) => [HREFLANG[candidate], websiteUrl(candidate, segment)])),
      "x-default": websiteUrl("en", segment),
    },
  };
}

export function websiteRobots(indexable = WEBSITE_INDEXABLE): NonNullable<Metadata["robots"]> {
  return indexable ? { index: true, follow: true } : { index: false, follow: false };
}

interface WebsiteMetadataInput {
  locale: WebsiteLocale;
  segment: WebsiteSegment;
  title: string;
  description: string;
  /** Absolute or site-relative; none until the Open Graph image (WEB-01g). */
  image?: string;
  indexable?: boolean;
}

/** Title, description, alternates, Open Graph, Twitter and robots for one page. */
export function websiteMetadata({ locale, segment, title, description, image, indexable = WEBSITE_INDEXABLE }: WebsiteMetadataInput): Metadata {
  const url = websiteUrl(locale, segment);
  return {
    title,
    description,
    alternates: websiteAlternates(locale, segment),
    openGraph: {
      type: "website",
      siteName: "FairPlayr",
      url,
      title,
      description,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((candidate) => candidate !== locale).map((candidate) => OG_LOCALE[candidate]),
      ...(image ? { images: [image] } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image] } : {}) },
    robots: websiteRobots(indexable),
  };
}

/** One entry per website page and locale, or none while the website is not indexable. */
export function websiteSitemap(indexable = WEBSITE_INDEXABLE): MetadataRoute.Sitemap {
  if (!indexable) return [];
  return WEBSITE_SEGMENTS.flatMap((segment) =>
    LOCALES.map((locale) => ({
      url: websiteUrl(locale, segment),
      alternates: { languages: websiteAlternates(locale, segment).languages as Record<string, string> },
    })),
  );
}

export function websiteRobotsTxt(indexable = WEBSITE_INDEXABLE): MetadataRoute.Robots {
  return {
    // No Disallow on app pages: a crawler must be able to read their noindex.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/serwist/"] },
    ...(indexable ? { sitemap: `${SITE_URL}/sitemap.xml` } : {}),
  };
}

/** `next.config.ts` headers: `X-Robots-Tag: noindex` on every response from any host but `INDEXABLE_HOST`. */
export function noindexHostHeaders() {
  return [
    {
      source: "/:path*",
      missing: [{ type: "host" as const, value: INDEXABLE_HOST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }],
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    },
  ];
}
