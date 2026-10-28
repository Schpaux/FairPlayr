import { setRequestLocale } from "next-intl/server";
import { HomeFixturePanel, HomeSeasonSummary, HomeSummaryProvider } from "@/components/home/HomeSeasonSummary";

// Home (`/play`, WEB-01d) is a user-agnostic shell (FP-OFF-01 B6, §S.5): the server renders only
// translations and static blocks, so the HTML is the same for every user and a
// service worker may cache it. The fixture panel and the season stats are
// client islands (`HomeSeasonSummary.tsx`). Do not read cookies, headers,
// Supabase or `@/lib/server/*` here; `shellRouteSafety.test.ts` enforces that.
//
// Layout (DESIGN.md §7, C2): one club-green fixture panel with the screen's
// only lime action, then the season as quiet numbers. The bottom nav covers
// the other destinations.

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <HomeSummaryProvider>
      <div className="flex flex-col gap-6 px-4 pt-4 pb-8">
        <HomeFixturePanel />
        <HomeSeasonSummary />
      </div>
    </HomeSummaryProvider>
  );
}
