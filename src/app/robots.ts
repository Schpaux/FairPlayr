import type { MetadataRoute } from "next";
import { websiteRobotsTxt } from "@/lib/marketing/seo";

// /robots.txt (WEB-01g). Names the sitemap while the website is indexable.
export default function robots(): MetadataRoute.Robots {
  return websiteRobotsTxt();
}
