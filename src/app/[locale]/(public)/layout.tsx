import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

/**
 * The public match page (FEAT-SHARE-01, `/s/<token>`): no app shell. The
 * client gets all messages, as it did before WEB-01 phase 0 moved the
 * provider out of [locale]/layout.tsx.
 */
type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function PublicLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();

  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
