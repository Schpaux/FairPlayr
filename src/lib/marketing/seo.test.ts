import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import {
  NOINDEX_HOSTS,
  SITE_URL,
  WEBSITE_INDEXABLE,
  noindexHostHeaders,
  websiteAlternates,
  websiteMetadata,
  websiteRobotsTxt,
  websiteSitemap,
  websiteUrl,
} from "./seo";

describe("website SEO (WEB-01g, phase 0)", () => {
  it("is not indexable until launch", () => {
    expect(WEBSITE_INDEXABLE).toBe(false);
    expect(websiteMetadata({ locale: "en", segment: "", title: "T", description: "D" }).robots).toEqual({ index: false, follow: false });
  });

  it("builds canonical URLs on fairplayr.app, with hreflang nb and x-default English", () => {
    expect(SITE_URL).toBe("https://fairplayr.app");
    expect(websiteUrl("en", "")).toBe("https://fairplayr.app/");
    expect(websiteUrl("no", "")).toBe("https://fairplayr.app/no");
    expect(websiteAlternates("no", "")).toEqual({
      canonical: "https://fairplayr.app/no",
      languages: { en: "https://fairplayr.app/", nb: "https://fairplayr.app/no", "x-default": "https://fairplayr.app/" },
    });
  });

  it("fills Open Graph and Twitter for a page", () => {
    const metadata = websiteMetadata({ locale: "no", segment: "", title: "Tittel", description: "Beskrivelse" });
    expect(metadata).toMatchObject({
      title: "Tittel",
      description: "Beskrivelse",
      alternates: { canonical: "https://fairplayr.app/no" },
      openGraph: { type: "website", siteName: "FairPlayr", url: "https://fairplayr.app/no", locale: "nb_NO", alternateLocale: ["en_GB"] },
      twitter: { card: "summary" },
    });
    const withImage = websiteMetadata({ locale: "en", segment: "", title: "T", description: "D", image: "/marketing/og.png", indexable: true });
    expect(withImage).toMatchObject({ openGraph: { images: ["/marketing/og.png"] }, twitter: { card: "summary_large_image" }, robots: { index: true, follow: true } });
  });

  it("has an empty sitemap and no sitemap line while not indexable", () => {
    expect(websiteSitemap()).toEqual([]);
    expect(websiteRobotsTxt()).toEqual({ rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/serwist/"] } });
    expect(websiteSitemap(true).map((entry) => entry.url)).toEqual(["https://fairplayr.app/", "https://fairplayr.app/no"]);
    expect(websiteRobotsTxt(true).sitemap).toBe("https://fairplayr.app/sitemap.xml");
  });

  it("sends X-Robots-Tag: noindex for the exact Vercel production host only", async () => {
    expect(NOINDEX_HOSTS).toEqual(["fair-playr.vercel.app"]);
    const [rule] = noindexHostHeaders();
    expect(rule).toEqual({
      source: "/:path*",
      has: [{ type: "host", value: "fair-playr\\.vercel\\.app" }],
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    });
    // Next.js anchors host values as ^value$ (prepare-destination.js).
    const matches = (host: string) => new RegExp(`^${rule.has[0].value}$`).test(host);
    expect(matches("fair-playr.vercel.app")).toBe(true);
    for (const host of ["fairplayr.app", "www.fairplayr.app", "fair-playr-git-x.vercel.app", "fair-playrxvercel.app", "a.fair-playr.vercel.app", "fair-playr.vercel.app.evil.com"]) {
      expect(matches(host), host).toBe(false);
    }
    const headers = await nextConfig.headers!();
    expect(headers).toEqual(expect.arrayContaining([rule]));
    expect(headers.find((entry) => entry.source === "/serwist/:path*")).toBeDefined();
  });
});
