"use client";

import { useId, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { localeConfig } from "@/lib/locales";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { SyncStatusRow } from "@/components/layout/SyncStatusRow";
import { useSpondStatus } from "@/components/team/useSpondStatus";
import { Button, ButtonLink, Sheet } from "@/components/ui/primitives";

function readProfileMetadata(user: ReturnType<typeof useAuth>["user"]) {
  const metadata = user?.user_metadata as Record<string, unknown> | undefined;
  const name =
    (typeof metadata?.full_name === "string" ? metadata.full_name : null) ??
    (typeof metadata?.name === "string" ? metadata.name : null);
  const photoUrl =
    (typeof metadata?.avatar_url === "string" ? metadata.avatar_url : null) ??
    (typeof metadata?.picture === "string" ? metadata.picture : null);

  return {
    name,
    photoUrl,
  };
}

export function ProfileMenu() {
  const t = useTranslations("profileMenu");
  const authT = useTranslations("auth.actions");
  const settingsT = useTranslations("settings");
  const { status, user, signOut } = useAuth();
  const workspace = useTeamWorkspace();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [open, setOpen] = useState(false);
  const languageLabelId = useId();
  const themeLabelId = useId();

  const profile = useMemo(() => readProfileMetadata(user), [user]);
  const isGuest = status !== "authenticated";

  const spondConnected = useSpondStatus(workspace.activeTeamId, workspace.mode);

  return (
    <>
      <button
        type="button"
        className="tap-target inline-flex h-10 w-10 items-center justify-center rounded-full border border-fp-border bg-fp-surface-2"
        onClick={() => setOpen(true)}
        aria-label={t("open")}
      >
        <UserAvatar
          name={profile.name}
          email={user?.email ?? null}
          photoUrl={profile.photoUrl}
          isGuest={isGuest}
          className="h-8 w-8"
        />
      </button>

      {/* A Sheet (UI-A11Y-03): labelled dialog, focus trapped and returned to
          the avatar button, page behind inert, Escape and the scrim close it. */}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        testId="profile-menu"
        actions={
          isGuest ? (
            <ButtonLink href="/auth/sign-in" variant="primary" block onClick={() => setOpen(false)}>
              {authT("signIn")}
            </ButtonLink>
          ) : (
            <Button
              block
              onClick={() => {
                void signOut().finally(() => setOpen(false));
              }}
            >
              {authT("signOut")}
            </Button>
          )
        }
      >
        <div className="flex items-center gap-3 rounded-xl border border-fp-border bg-fp-surface-2 p-3">
          <UserAvatar
            name={profile.name}
            email={user?.email ?? null}
            photoUrl={profile.photoUrl}
            isGuest={isGuest}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {profile.name ?? (isGuest ? t("guestName") : user?.email ?? "-")}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {isGuest ? t("guestEmail") : user?.email ?? "-"}
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <SyncStatusRow mode={workspace.mode} hasError={Boolean(workspace.error)} />

          {workspace.mode === "cloud" ? (
            <div className="flex items-center justify-between rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-2">
              <span className="text-xs font-medium text-foreground">Spond</span>
              <span
                className={
                  spondConnected
                    ? "inline-flex items-center gap-1 text-xs font-medium text-fp-ok-text"
                    : "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
                }
              >
                <span
                  className={
                    spondConnected
                      ? "h-1.5 w-1.5 rounded-full bg-fp-ok-text"
                      : "h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
                  }
                />
                {spondConnected ? t("spondConnected") : t("spondNotConnected")}
              </span>
            </div>
          ) : null}

          <Link
            href="/settings"
            className="tap-target flex items-center justify-between rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-2 text-sm font-medium text-foreground"
            onClick={() => setOpen(false)}
          >
            <span>{settingsT("title")}</span>
            <span className="text-xs text-muted-foreground">›</span>
          </Link>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <p id={languageLabelId} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {settingsT("language")}
            </p>
            <div role="group" aria-labelledby={languageLabelId} className="grid grid-cols-2 gap-2">
              {routing.locales.map((l) => {
                const meta = localeConfig[l as keyof typeof localeConfig];
                const active = l === locale;
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={active}
                    lang={l}
                    className={
                      active
                        ? "tap-target rounded-xl border border-fp-lime bg-fp-lime px-3 py-2 text-sm font-medium text-fp-on-lime"
                        : "tap-target rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-2 text-sm font-medium text-muted-foreground"
                    }
                    onClick={() => {
                      router.replace(pathname, { locale: l });
                      setOpen(false);
                    }}
                  >
                    {meta?.full ?? l}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p id={themeLabelId} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {settingsT("theme")}
            </p>
            <div role="group" aria-labelledby={themeLabelId} className="grid grid-cols-3 gap-2">
              {[
                { value: "light", label: settingsT("lightMode") },
                { value: "dark", label: settingsT("darkMode") },
                { value: "system", label: settingsT("systemMode") },
              ].map((option) => {
                const active = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    className={
                      active
                        ? "tap-target rounded-xl border border-fp-lime bg-fp-lime px-2 py-2 text-xs font-semibold text-fp-on-lime"
                        : "tap-target rounded-xl border border-fp-border bg-fp-surface-2 px-2 py-2 text-xs font-semibold text-muted-foreground"
                    }
                    onClick={() => setTheme(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Sheet>
    </>
  );
}
