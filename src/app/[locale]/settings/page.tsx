"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { routing } from "@/i18n/routing";
import { localeConfig } from "@/lib/locales";
import { Sun, Moon, Monitor, Globe, Cloud, Link2 } from "lucide-react";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { AuthStatusCard } from "@/components/auth/AuthStatusCard";
import { SpondIntegrationCard } from "@/components/team/SpondIntegrationCard";
import { cn } from "@/lib/utils";

type ThemeOption = "light" | "dark" | "system";

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;

export default function SettingsPage() {
  const t = useTranslations("settings");
  const { theme, setTheme } = useTheme();
  const auth = useAuth();
  const workspace = useTeamWorkspace();
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

      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {t("account")}
        </p>
        <AuthStatusCard />
      </section>

      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {t("storageSync")}
        </p>
        <AppCard className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cloud size={14} className="text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">{t("syncStatus")}</p>
            </div>
            <span className={workspace.mode === "cloud" ? "text-xs font-medium text-fp-ok-text" : "text-xs font-medium text-fp-warn-text"}>
              {workspace.mode === "cloud" ? t("syncCloud") : t("syncLocal")}
            </span>
          </div>
          {workspace.error ? (
            <p className="text-xs text-fp-warn-text">{t("syncAttention")}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {workspace.mode === "cloud" ? t("syncCloudHint") : t("syncLocalHint")}
            </p>
          )}
        </AppCard>
      </section>

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
                    "flex flex-col items-center gap-2 rounded-xl p-3 text-xs font-medium transition tap-target",
                    theme === value
                      ? "bg-fp-lime text-fp-on-lime border border-fp-lime"
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
                    "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition tap-target",
                    l === locale
                      ? "bg-fp-lime text-fp-on-lime font-semibold"
                      : "text-muted-foreground hover:bg-fp-surface-2 hover:text-foreground"
                  )}
                >
                  <span>{meta?.full ?? l}</span>
                  {l === locale && <span className="text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        </AppCard>
      </section>

      {auth.status === "authenticated" && workspace.mode === "cloud" ? (
        <section className="mt-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("integrations")}
          </p>
          {workspace.activeTeam ? (
            <SpondIntegrationCard
              teamId={workspace.activeTeam.id}
              mode={workspace.mode}
              onImported={workspace.refresh}
            />
          ) : (
            <AppCard className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <Link2 size={14} className="text-fp-spond" />
                <p className="text-sm font-medium text-foreground">{t("integrations")}</p>
              </div>
              <p className="text-xs text-muted-foreground">{t("noTeamForIntegrations")}</p>
            </AppCard>
          )}
        </section>
      ) : null}
    </PageShell>
  );
}
