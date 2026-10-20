"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Home, Users, Play, History, Settings } from "lucide-react";
import { motion } from "framer-motion";

const navItems = [
  { href: "/" as const, icon: Home, labelKey: "home" },
  { href: "/team" as const, icon: Users, labelKey: "team" },
  { href: "/match" as const, icon: Play, labelKey: "match" },
  { href: "/historikk" as const, icon: History, labelKey: "historikk" },
  { href: "/settings" as const, icon: Settings, labelKey: "settings" },
] as const;

export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-fp-border bg-background/92 backdrop-blur-xl pb-safe pl-safe pr-safe">
      <div className="mx-auto flex max-w-screen-lg items-stretch justify-around px-1 h-[60px]">
        {navItems.map(({ href, icon: Icon, labelKey }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-opacity active:opacity-60"
              aria-current={active ? "page" : undefined}
            >
              <div className="relative flex items-center justify-center">
                {active && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 -mx-3 -my-1 rounded-full bg-fp-cta/20"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}
                <Icon
                  size={21}
                  className={`relative transition-colors ${
                    active ? "text-fp-cta dark:text-fp-cta" : "text-muted-foreground"
                  }`}
                  strokeWidth={active ? 2.2 : 1.8}
                />
              </div>
              <span
                className={`text-[10px] font-semibold leading-none transition-colors ${
                  active ? "text-fp-cta dark:text-fp-cta" : "text-muted-foreground"
                }`}
              >
                {t(labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
