"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { localeConfig } from "@/lib/locales";
import { Sun, Moon, Monitor, Globe } from "lucide-react";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { cn } from "@/lib/utils";

type ThemeOption = "light" | "dark" | "system";

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;

export default function SettingsPage() {
  const t = useTranslations("settings");
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const themeOptions: { value: ThemeOption; labelKey: "lightMode" | "darkMode" | "systemMode" }[] = [
    { value: "light", labelKey: "lightMode" },
    { value: "dark", labelKey: "darkMode" },
    { value: "system", labelKey: "systemMode" },
  ];

  return (
    <PageShell>
      <SectionHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Appearance */}
      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {t("appearance")}
        </p>
        <AppCard className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-fp-border">
            <p className="text-sm font-medium text-foreground">{t("theme")}</p>
          </div>
          <div className="p-3 grid grid-cols-3 gap-2">
            {themeOptions.map(({ value, labelKey }) => {
              const Icon = themeIcons[value];
              return (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl p-3 text-xs font-medium transition-all tap-target",
                    theme === value
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-fp-surface-2 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon size={18} />
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
        </AppCard>
      </section>

      {/* Language */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {t("language")}
        </p>
        <AppCard className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-fp-border flex items-center gap-2">
            <Globe size={14} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{t("language")}</p>
          </div>
          <div className="p-3 flex flex-col gap-1">
            {routing.locales.map((l) => {
              // Locale names always shown in their native language — not translated
              const meta = localeConfig[l as keyof typeof localeConfig];
              return (
                <button
                  key={l}
                  onClick={() => router.replace(pathname, { locale: l })}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all tap-target",
                    l === locale
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-fp-surface-2 hover:text-foreground"
                  )}
                >
                  <span>{meta?.full ?? l}</span>
                  {l === locale && <span className="text-xs text-primary">✓</span>}
                </button>
              );
            })}
          </div>
        </AppCard>
      </section>
    </PageShell>
  );
}
