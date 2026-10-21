import { Link } from "@/i18n/navigation";
import { ActiveTeamSwitcher } from "@/components/team/ActiveTeamSwitcher";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { OfflineIndicator } from "@/components/layout/OfflineIndicator";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-fp-border bg-fp-canvas pt-safe">
      {/* UI-VIEWPORT-01: the side gutters include the left/right safe area
          (landscape iPhone, Capacitor), like the 16px gutter elsewhere. */}
      <div className="mx-auto flex h-14 max-w-screen-lg items-center justify-between gap-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(1.25rem,env(safe-area-inset-left))] sm:pr-[max(1.25rem,env(safe-area-inset-right))]">
        {/* Logo / Wordmark (44px tall hit area, DESIGN.md §4) */}
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2.5 group shrink-0">
          {/* Icon mark — pitch field */}
          <div className="relative h-8 w-8 rounded-xl bg-fp-lime flex items-center justify-center overflow-hidden text-fp-on-lime">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5"
              aria-hidden
            >
              {/* field outline */}
              <rect x="3" y="4" width="18" height="16" rx="2" fill="currentColor" fillOpacity="0.15" />
              {/* center line */}
              <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              {/* center circle */}
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" />
              {/* left goal */}
              <rect x="3" y="9" width="3.5" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
              {/* right goal */}
              <rect x="17.5" y="9" width="3.5" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </div>

          {/* Wordmark */}
          <span className="truncate text-[15px] font-bold tracking-tight text-foreground group-hover:opacity-75 transition-opacity">
            FairPlayr
          </span>
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
