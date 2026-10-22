"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Check, Users, UserRound } from "lucide-react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { routing } from "@/i18n/routing";
import { localeConfig } from "@/lib/locales";
import { useMounted } from "@/lib/useMounted";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/ui/PageShell";
import { ButtonLink, ListGroup, ListRow, SegmentedChoice, type SegmentedOption } from "@/components/ui/primitives";
import { SyncStatusRow } from "@/components/layout/SyncStatusRow";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { readProfileMetadata } from "@/components/layout/ProfileMenu";
import { SignOutConfirmSheet } from "@/components/auth/SignOutConfirmSheet";
import { SpondIntegrationCard } from "@/components/team/SpondIntegrationCard";

type ThemeOption = "light" | "dark" | "system";
// "" is "not known yet": before mount no theme segment is selected, so the
// server HTML and the hydration render agree (FP-004 N-5).
type ThemeChoice = ThemeOption | "";

const THEME_OPTIONS: readonly ThemeOption[] = ["light", "dark", "system"];

function isThemeOption(value: string | undefined): value is ThemeOption {
  return THEME_OPTIONS.includes(value as ThemeOption);
}

/** The 13px caps kicker, as `ListGroup` and `SegmentedChoice` draw it. */
const kickerClassName = "mb-2 px-1 text-[13px] font-semibold uppercase leading-tight tracking-[0.06em] text-fp-ink-2";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const authT = useTranslations("auth");
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const auth = useAuth();
  const workspace = useTeamWorkspace();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const profile = useMemo(() => readProfileMetadata(auth.user), [auth.user]);
  const isSignedIn = auth.status === "authenticated";
  const isGuest = auth.status === "guest";
  const activeTeam = workspace.activeTeam;

  const themeValue: ThemeChoice = mounted && isThemeOption(theme) ? theme : "";
  const themeOptions: SegmentedOption<ThemeChoice>[] = [
    { value: "light", label: t("lightMode") },
    { value: "dark", label: t("darkMode") },
    { value: "system", label: t("systemMode") },
  ];
  const languageOptions: SegmentedOption<string>[] = routing.locales.map((l) => ({
    value: l,
    // Locale names are always shown in their own language, never translated.
    label: <span lang={l}>{localeConfig[l as keyof typeof localeConfig]?.full ?? l}</span>,
  }));

  return (
    // gap, not space-y: ListGroup resets its own margin, which beats space-y.
    <PageShell className="flex flex-col gap-6">
      <h1 ref={titleRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-fp-ink outline-none">
        {t("title")}
      </h1>

      {/* Konto */}
      <div className="flex flex-col gap-3">
        <ListGroup title={t("account")} testId="settings-account">
          {auth.status === "loading" ? (
            <ListRow label={authT("status.loading")} />
          ) : isSignedIn ? (
            <>
              <ListRow
                testId="settings-account-row"
                leading={
                  <UserAvatar
                    name={profile.name}
                    email={auth.user?.email ?? null}
                    photoUrl={profile.photoUrl}
                    isGuest={false}
                  />
                }
                label={profile.name ?? auth.user?.email ?? "-"}
                description={profile.name ? auth.user?.email ?? undefined : undefined}
              />
              <SyncStatusRow mode={workspace.mode} hasError={Boolean(workspace.error)} testId="settings-sync" />
            </>
          ) : (
            <ListRow
              testId="settings-guest-row"
              leading={<UserRound size={22} strokeWidth={1.75} />}
              label={t("guestRow")}
            />
          )}
        </ListGroup>

        {isGuest ? (
          <ButtonLink href="/auth/sign-in" variant="primary" block data-testid="settings-sign-in">
            {authT("actions.signIn")}
          </ButtonLink>
        ) : null}
      </div>

      {/* Lag: team defaults stay on Spillere (owner decision B1); this links there. */}
      <ListGroup title={t("team")} testId="settings-team">
        {activeTeam ? (
          <>
            <ListRow
              testId="settings-active-team"
              leading={<Users size={22} strokeWidth={1.75} />}
              label={activeTeam.name}
              description={t("activeTeam")}
            />
            <ListRow
              testId="settings-team-defaults"
              href={{ pathname: "/team", hash: "team-defaults" }}
              label={t("teamDefaults")}
              description={t("teamDefaultsHint")}
            />
          </>
        ) : (
          <ListRow testId="settings-no-team" href="/team" label={t("noTeam")} description={t("noTeamHint")} />
        )}
      </ListGroup>

      {/* Integrasjoner: signed-in cloud only. The card shows its own status. */}
      {isSignedIn && workspace.mode === "cloud" ? (
        <section id="integrations" aria-labelledby="settings-integrations-title" className="scroll-mt-20">
          <h2 id="settings-integrations-title" className={kickerClassName}>
            {t("integrations")}
          </h2>
          {activeTeam ? (
            <SpondIntegrationCard
              // A team switch starts a fresh card: no late status answer for
              // the previous team can land in this one.
              key={activeTeam.id}
              teamId={activeTeam.id}
              mode={workspace.mode}
              onImported={workspace.refresh}
              spondPlayerCount={activeTeam.players.filter((player) => player.source === "spond").length}
            />
          ) : (
            <ListGroup aria-label={t("integrations")}>
              <ListRow label={t("noTeamForIntegrations")} />
            </ListGroup>
          )}
        </section>
      ) : null}

      {/* Utseende og språk */}
      <section aria-labelledby="settings-appearance-title">
        <h2 id="settings-appearance-title" className={kickerClassName}>
          {t("appearanceAndLanguage")}
        </h2>
        <div className="space-y-6 rounded-[14px] border border-fp-rule bg-fp-surface p-4">
          <SegmentedChoice<ThemeChoice>
            label={t("theme")}
            options={themeOptions}
            value={themeValue}
            onValueChange={(value) => {
              if (value) setTheme(value);
            }}
            testId="settings-theme"
          />
          {/* Language switches the page, so it is buttons, not a radio group:
              arrow keys in a radio group would switch it while reading the
              options (WCAG 3.2.2). Same pill track as SegmentedChoice. */}
          <div role="group" aria-labelledby="settings-language-label" data-testid="settings-language">
            <p id="settings-language-label" className={kickerClassName}>
              {t("language")}
            </p>
            <div className="flex gap-1 rounded-full bg-fp-surface-2 p-1">
              {languageOptions.map((option) => {
                const selected = option.value === locale;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      if (!selected) router.replace(pathname, { locale: option.value });
                    }}
                    className={cn(
                      "flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-3 py-1.5 text-[15px] [overflow-wrap:anywhere] transition-transform active:scale-[0.97]",
                      selected ? "bg-fp-lime font-semibold text-fp-on-lime" : "font-medium text-fp-ink-2"
                    )}
                  >
                    {selected ? <Check size={16} strokeWidth={2} aria-hidden className="flex-none" /> : null}
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Logg ut: a secondary row in its own group, last on the page. */}
      {isSignedIn ? (
        <ListGroup aria-label={authT("actions.signOut")} testId="settings-sign-out-group">
          <ListRow
            testId="settings-sign-out"
            label={authT("actions.signOut")}
            onClick={() => setConfirmSignOut(true)}
          />
        </ListGroup>
      ) : null}

      {/* Mounted outside the signed-in branch so it survives the switch to guest. */}
      <SignOutConfirmSheet
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        finalFocus={isSignedIn ? undefined : titleRef}
      />
    </PageShell>
  );
}
