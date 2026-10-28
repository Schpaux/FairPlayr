import type { MetadataRoute } from "next";
import { websiteSitemap } from "@/lib/marketing/seo";

// /sitemap.xml (WEB-01g): the website's pages only (/ and /no).
export default function sitemap(): MetadataRoute.Sitemap {
  return websiteSitemap();
}
