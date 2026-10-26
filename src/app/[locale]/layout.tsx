import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ThemeColorSync } from "@/components/layout/ThemeColorSync";
import "../globals.css";

// Inter is the only UI typeface (DESIGN.md §3). latin-ext covers player names
// such as Łukasz or Şükrü; next/font self-hosts it at build time.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// Barlow Condensed 600 — match numerals only (score, clock, shirt numbers).
// Bundled locally (OFL, see ./fonts) so the scoreboard never depends on the
// network. Not preloaded until the live scoreboard uses it.
const barlowCondensed = localFont({
  src: "../fonts/barlow-condensed-600-latin.woff2",
  weight: "600",
  style: "normal",
  variable: "--font-barlow-condensed",
  display: "block",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "FairPlayr",
    template: "%s — FairPlayr",
  },
  description:
    "Fair playtime tracking for grassroots football coaches. Manage lineups, substitutions, and matchday — so every player gets their moment.",
  // No `manifest` here: src/app/manifest.ts is linked automatically
  // (/manifest.webmanifest, OFF-02).
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
  // UI-A11Y-01 (WCAG 1.4.4): pinch zoom is allowed. Text fields are 16px, so
  // iOS does not zoom on focus (UI-VIEWPORT-01).
  // The on-screen keyboard resizes the layout, so sticky bars stay above it.
  interactiveWidget: "resizes-content",
  // viewport-fit=cover is required so env(safe-area-inset-*) works correctly
  // inside a Capacitor WKWebView and as a PWA on iOS.
  viewportFit: "cover",
  // No `themeColor` here: the app theme is class-based (`enableSystem` is
  // false), so <ThemeColorSync /> renders the one theme-color tag from the
  // active theme instead of the OS colour scheme (OFF-02).
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

  // The locale comes from the URL, not from request headers or cookies: the
  // layout renders the same for every user (cache-safe shells, FP-OFF-01 B6).
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${barlowCondensed.variable} h-full`}
    >
      <body className="h-full antialiased bg-background text-foreground">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange={false}
          >
            <ThemeColorSync />
            {/* The app shell is in (app)/layout.tsx; the public match page
                (FEAT-SHARE-01, (public)/s/[token]) has none of it. */}
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
