import { Link } from "@/i18n/navigation";
import { ActiveTeamSwitcher } from "@/components/team/ActiveTeamSwitcher";
import { ProfileMenu } from "@/components/layout/ProfileMenu";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-fp-border bg-background/85 backdrop-blur-xl pt-safe">
      <div className="mx-auto flex h-14 max-w-screen-lg items-center justify-between gap-2 px-4 sm:px-5">
        {/* Logo / Wordmark */}
        <Link href="/" className="flex min-w-0 items-center gap-2.5 group shrink-0">
          {/* Icon mark — pitch field */}
          <div className="relative h-8 w-8 rounded-xl bg-fp-cta flex items-center justify-center overflow-hidden shadow-[0_0_0_1px_rgba(14,15,12,0.12)]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5"
              aria-hidden
            >
              {/* field outline */}
              <rect x="3" y="4" width="18" height="16" rx="2" fill="#163300" fillOpacity="0.15" />
              {/* center line */}
              <line x1="12" y1="4" x2="12" y2="20" stroke="#163300" strokeWidth="1.4" strokeLinecap="round" />
              {/* center circle */}
              <circle cx="12" cy="12" r="3" stroke="#163300" strokeWidth="1.4" />
              {/* left goal */}
              <rect x="3" y="9" width="3.5" height="6" rx="1" stroke="#163300" strokeWidth="1.4" />
              {/* right goal */}
              <rect x="17.5" y="9" width="3.5" height="6" rx="1" stroke="#163300" strokeWidth="1.4" />
            </svg>
          </div>

          {/* Wordmark */}
          <span className="truncate text-[15px] font-bold tracking-tight text-foreground group-hover:opacity-75 transition-opacity">
            FairPlayr
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <ActiveTeamSwitcher />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
