import type { Metadata } from "next";
import { StandaloneRedirect } from "@/components/marketing/StandaloneRedirect";

/**
 * The website (WEB-01d, FP-WEB-01A §3): `/` and `/no`. No app shell, like
 * `(public)`: no session, team, active match, service worker registration,
 * header or bottom nav. The pages are precached by the worker
 * (`src/sw/shellRoutes.ts`), so they must stay user-agnostic
 * (`shellRouteSafety.test.ts`). Not indexed until WEB-01B/WEB-01g.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* An installed app that still opens here goes straight to the app. */}
      <StandaloneRedirect />
      {children}
    </>
  );
}
