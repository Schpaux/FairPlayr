import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { TeamWorkspaceProvider } from "@/components/providers/TeamWorkspaceProvider";
import { ActiveMatchProvider } from "@/components/providers/ActiveMatchProvider";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { ActiveMatchBanner } from "@/components/layout/ActiveMatchBanner";
import { NativeAppShell } from "@/components/layout/NativeAppShell";
import { AppShellErrorBoundary } from "@/components/layout/AppShellErrorBoundary";
import { PwaRoot } from "@/components/pwa/PwaRoot";

/**
 * The coach app's shell: session, team, active match, service worker, header
 * and bottom nav. Moved out of [locale]/layout.tsx unchanged (FEAT-SHARE-01),
 * so the public match page can render without any of it. The client gets all
 * messages, as before (WEB-01 phase 0 moved the provider here).
 */

// The app is never indexed (WEB-01g); only the website may be, at launch.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AppLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <AuthProvider>
        <TeamWorkspaceProvider>
          <ActiveMatchProvider>
            <PwaRoot />
            <AppShellErrorBoundary>
              <NativeAppShell>
                <div className="relative flex min-h-dvh flex-col">
                  <Header />
                  <ActiveMatchBanner />
                  {/* Clears the bottom nav (64px + safe area). */}
                  <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</main>
                  <BottomNav />
                </div>
              </NativeAppShell>
            </AppShellErrorBoundary>
          </ActiveMatchProvider>
        </TeamWorkspaceProvider>
      </AuthProvider>
    </NextIntlClientProvider>
  );
}
