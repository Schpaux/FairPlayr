import type { Metadata, Viewport } from "next";
import { Inter, Urbanist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { TeamWorkspaceProvider } from "@/components/providers/TeamWorkspaceProvider";
import { ActiveMatchProvider } from "@/components/providers/ActiveMatchProvider";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { ActiveMatchBanner } from "@/components/layout/ActiveMatchBanner";
import { NativeAppShell } from "@/components/layout/NativeAppShell";
import { AppShellErrorBoundary } from "@/components/layout/AppShellErrorBoundary";
import "../globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FairPlayr",
    template: "%s — FairPlayr",
  },
  description:
    "Fair playtime tracking for grassroots football coaches. Manage lineups, substitutions, and matchday — so every player gets their moment.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FairPlayr",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // viewport-fit=cover is required so env(safe-area-inset-*) works correctly
  // inside a Capacitor WKWebView and as a PWA on iOS.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f1a" },
  ],
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${urbanist.variable} h-full`}
    >
      <body className="h-full antialiased bg-background text-foreground">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange={false}
          >
            <AuthProvider>
              <TeamWorkspaceProvider>
                <ActiveMatchProvider>
                  <AppShellErrorBoundary>
                    <NativeAppShell>
                      <div className="relative flex min-h-screen flex-col">
                        <Header />
                        <ActiveMatchBanner />
                        <main className="flex-1 pb-20">{children}</main>
                        <BottomNav />
                      </div>
                    </NativeAppShell>
                  </AppShellErrorBoundary>
                </ActiveMatchProvider>
              </TeamWorkspaceProvider>
            </AuthProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
