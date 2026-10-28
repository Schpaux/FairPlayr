import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { StandaloneRedirect } from "@/components/marketing/StandaloneRedirect";
import { WEBSITE_CLIENT_NAMESPACES, pickMessages } from "@/i18n/clientMessages";
import { SITE_URL, websiteRobots } from "@/lib/marketing/seo";

/**
 * The website (WEB-01d, FP-WEB-01A §3): `/` and `/no`. No app shell, like
 * `(public)`: no session, team, active match, service worker registration,
 * header or bottom nav. The pages are precached by the worker
 * (`src/sw/shellRoutes.ts`), so they must stay user-agnostic
 * (`shellRouteSafety.test.ts`). Indexable on `fairplayr.app` only
 * (`WEBSITE_INDEXABLE`, WEB-01g); canonical URLs always point at `SITE_URL`.
 *
 * The browser gets only `WEBSITE_CLIENT_NAMESPACES` (none in phase 0): the
 * text is rendered on the server. The list is always passed explicitly,
 * because a provider without `messages` would inherit all of them.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  robots: websiteRobots(),
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function MarketingLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = pickMessages(await getMessages(), WEBSITE_CLIENT_NAMESPACES);

  return (
    <NextIntlClientProvider messages={messages}>
      {/* An installed app that still opens here goes straight to the app. */}
      <StandaloneRedirect />
      {children}
    </NextIntlClientProvider>
  );
}
