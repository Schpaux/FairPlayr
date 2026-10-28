import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { APP_HOME_PATH } from "@/lib/appRoutes";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ActiveTeamSwitcher } from "@/components/team/ActiveTeamSwitcher";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { OfflineIndicator } from "@/components/layout/OfflineIndicator";

export function Header() {
  const t = useTranslations("common");
  return (
    <header className="sticky top-0 z-50 w-full border-b border-fp-border bg-fp-canvas pt-safe">
      {/* UI-VIEWPORT-01: the side gutters include the left/right safe area
          (landscape iPhone, Capacitor), like the 16px gutter elsewhere. */}
      <div className="mx-auto flex h-14 max-w-screen-lg items-center justify-between gap-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(1.25rem,env(safe-area-inset-left))] sm:pr-[max(1.25rem,env(safe-area-inset-right))]">
        {/* BRAND-01: the horizontal logo at its 150px minimum (BRAND.md §2),
            in a 44px tall hit area (DESIGN.md §4). -ml-[7px] cancels the
            master's left clear space (39/863 of 150px), so the F lines up with
            the page gutter like the titles below it. */}
        <Link href={APP_HOME_PATH} className="-ml-[7px] flex min-h-11 shrink-0 items-center transition-opacity hover:opacity-75">
          <BrandLogo label={t("appName")} />
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <OfflineIndicator />
          <ActiveTeamSwitcher />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
