"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Home, Users, Play, History } from "lucide-react";
import { APP_HOME_PATH } from "@/lib/appRoutes";

// Four tabs; settings live under the profile menu (DESIGN.md §7, U8).
const navItems = [
  { href: APP_HOME_PATH, icon: Home, labelKey: "home" },
  { href: "/team" as const, icon: Users, labelKey: "team" },
  { href: "/match" as const, icon: Play, labelKey: "match" },
  { href: "/historikk" as const, icon: History, labelKey: "historikk" },
] as const;

export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === APP_HOME_PATH) return pathname === APP_HOME_PATH;
    return pathname.startsWith(href);
  }

  // Solid canvas, no blur and no spring (DESIGN.md §2.5, §4). The active tab is
  // a solid lime pill with `on-lime` icon and label; labels are 13px and wrap
  // rather than truncate with large text. Lime on the light canvas is only
  // ~1.4 : 1, so the active tab also gets a bold label and, in light mode, an
  // `on-lime` outline (WCAG 1.4.11); aria-current carries it for screen readers.
  return (
    <nav
      aria-label={t("label")}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-fp-border bg-fp-canvas pb-safe pl-safe pr-safe"
    >
      <div className="mx-auto flex min-h-16 max-w-screen-lg items-stretch gap-1 px-2">
        {navItems.map(({ href, icon: Icon, labelKey }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="group flex min-w-0 flex-1 items-center justify-center py-1.5"
              aria-current={active ? "page" : undefined}
            >
              <span
                className={`flex h-full w-full max-w-24 flex-col items-center justify-center gap-0.5 rounded-[26px] px-1 py-1 transition-[scale] duration-[90ms] ease-[var(--fp-ease-out)] group-active:scale-[0.97] ${
                  active
                    ? "bg-fp-lime text-fp-on-lime shadow-[inset_0_0_0_1.5px_var(--fp-on-lime)] dark:shadow-none"
                    : "text-fp-ink-2"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.75} aria-hidden />
                <span
                  className={`max-w-full text-center text-[13px] leading-tight [overflow-wrap:break-word] ${
                    active ? "font-bold" : "font-semibold"
                  }`}
                >
                  {t(labelKey)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
