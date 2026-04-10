import { Link } from "@/i18n/navigation";
import { ActiveTeamSwitcher } from "@/components/team/ActiveTeamSwitcher";
import { ProfileMenu } from "@/components/layout/ProfileMenu";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-fp-border bg-background/80 backdrop-blur-md pt-safe">
      <div className="mx-auto flex h-14 max-w-screen-lg items-center justify-between gap-2 px-3 sm:px-4">
        {/* Logo / Wordmark */}
        <Link href="/" className="flex min-w-0 items-center gap-2 group">
          {/* Icon mark */}
          <div className="relative h-8 w-8 rounded-lg bg-primary flex items-center justify-center glow-primary-sm overflow-hidden">
            {/* Simple football-field-inspired mark */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5 text-white"
              aria-hidden
            >
              <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" fillOpacity="0.2" />
              <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
              <rect x="3" y="9" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="17" y="9" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>

          {/* Wordmark */}
          <span className="truncate font-semibold text-base tracking-tight text-foreground group-hover:text-primary transition-colors">
            FairPlayr
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <ActiveTeamSwitcher />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
