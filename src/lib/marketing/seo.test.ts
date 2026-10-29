import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import {
  INDEXABLE_HOST,
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
  it("is indexable since launch, and can still be built without", () => {
    expect(WEBSITE_INDEXABLE).toBe(true);
    expect(websiteMetadata({ locale: "en", segment: "", title: "T", description: "D" }).robots).toEqual({ index: true, follow: true });
    expect(websiteMetadata({ locale: "en", segment: "", title: "T", description: "D", indexable: false }).robots).toEqual({ index: false, follow: false });
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

  it("gives the roadmap its own canonical, hreflang and social metadata", () => {
    expect(websiteMetadata({ locale: "no", segment: "/roadmap", title: "Roadmap", description: "D" })).toMatchObject({
      alternates: { canonical: "https://fairplayr.app/no/roadmap", languages: { en: "https://fairplayr.app/roadmap", nb: "https://fairplayr.app/no/roadmap", "x-default": "https://fairplayr.app/roadmap" } },
      openGraph: { url: "https://fairplayr.app/no/roadmap", locale: "nb_NO" },
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

  it("lists the home and roadmap pages in both languages in the sitemap and names it in robots.txt; neither while not indexable", () => {
    expect(websiteSitemap().map((entry) => entry.url)).toEqual(["https://fairplayr.app/", "https://fairplayr.app/no", "https://fairplayr.app/roadmap", "https://fairplayr.app/no/roadmap"]);
    expect(websiteRobotsTxt()).toEqual({ rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/serwist/"] }, sitemap: "https://fairplayr.app/sitemap.xml" });
    expect(websiteSitemap(false)).toEqual([]);
    expect(websiteRobotsTxt(false).sitemap).toBeUndefined();
  });

  it("sends X-Robots-Tag: noindex from every host but fairplayr.app", async () => {
    expect(INDEXABLE_HOST).toBe("fairplayr.app");
    const [rule] = noindexHostHeaders();
    expect(rule).toEqual({
      source: "/:path*",
      missing: [{ type: "host", value: "fairplayr\\.app" }],
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    });
    // Next.js anchors host values as ^value$ (prepare-destination.js); the
    // header is sent when the host does not match.
    const noindex = (host: string) => !new RegExp(`^${rule.missing[0].value}$`).test(host);
    expect(noindex("fairplayr.app")).toBe(false);
    for (const host of ["fair-playr.vercel.app", "fair-playr-git-x.vercel.app", "fair-playr-abc123-team.vercel.app", "www.fairplayr.app", "fairplayrxapp", "a.fairplayr.app", "fairplayr.app.evil.com", "localhost:3000"]) {
      expect(noindex(host), host).toBe(true);
    }
    const headers = await nextConfig.headers!();
    expect(headers).toEqual(expect.arrayContaining([rule]));
    expect(headers.find((entry) => entry.source === "/serwist/:path*")).toBeDefined();
  });
});
