import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSerwist } from "@serwist/turbopack";
import { noindexHostHeaders } from "./src/lib/marketing/seo";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /* PWA-ready headers */
  async headers() {
    return [
      {
        // The service worker (src/app/serwist/[path]/route.ts): never cached
        // by the browser or a CDN, so a new build (or the kill switch) is seen
        // on the next update check. FP-OFF-01 §2.2.
        source: "/serwist/:path*",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // The Vercel production domain serves the same site as fairplayr.app
      // and is never indexed (WEB-01g, src/lib/marketing/seo.ts).
      ...noindexHostHeaders(),
    ];
  },
};

// withSerwist only marks esbuild as a server-external package; the worker is
// built by the route handler above.
export default withSerwist(withNextIntl(nextConfig));
