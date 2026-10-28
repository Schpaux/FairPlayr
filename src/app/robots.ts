import type { MetadataRoute } from "next";
import { websiteRobotsTxt } from "@/lib/marketing/seo";

// /robots.txt (WEB-01g). No sitemap line until the website is indexable.
export default function robots(): MetadataRoute.Robots {
  return websiteRobotsTxt();
}
