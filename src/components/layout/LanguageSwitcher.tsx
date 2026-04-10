"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { localeConfig } from "@/lib/locales";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";

export function LanguageSwitcher() {
  const t = useTranslations("a11y");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next });
  }

  const current = localeConfig[locale as keyof typeof localeConfig];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="h-9 px-3 rounded-xl surface-2 border border-fp-border flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors tap-target"
        aria-label={t("switchLanguage")}
      >
        <Globe size={14} />
        <span>{current?.short ?? locale.toUpperCase()}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        {routing.locales.map((l) => {
          const meta = localeConfig[l as keyof typeof localeConfig];
          return (
            <DropdownMenuItem
              key={l}
              onClick={() => switchLocale(l)}
              className={l === locale ? "bg-primary/10 text-primary" : ""}
            >
              <span className="text-sm font-medium">{meta?.full ?? l}</span>
              {l === locale && (
                <span className="ml-auto text-xs text-muted-foreground">✓</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
