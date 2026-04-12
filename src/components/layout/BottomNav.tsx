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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-fp-border bg-background/90 backdrop-blur-md pb-safe">
      <div className="mx-auto flex max-w-screen-lg items-center justify-around px-2 h-16">
        {navItems.map(({ href, icon: Icon, labelKey }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl tap-target transition-colors"
              aria-current={active ? "page" : undefined}
            >
              <div className="relative">
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 -m-1.5 rounded-lg bg-primary/10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon
                  size={20}
                  className={`relative transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                />
              </div>
              <span
                className={`text-[10px] font-medium leading-none transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
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
