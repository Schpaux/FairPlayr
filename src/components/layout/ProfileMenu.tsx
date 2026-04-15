"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { localeConfig } from "@/lib/locales";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { SyncStatusRow } from "@/components/layout/SyncStatusRow";

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

  const profile = useMemo(() => readProfileMetadata(user), [user]);
  const isGuest = status !== "authenticated";

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

      {open ? createPortal(
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            className="absolute inset-0 bg-background/65"
            aria-label={t("close")}
            onClick={() => setOpen(false)}
          />

          <div className="absolute inset-x-0 bottom-0 top-[max(env(safe-area-inset-top),0.5rem)] flex items-end px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
            <div className="mx-auto flex h-full w-full max-w-screen-sm flex-col overflow-hidden rounded-2xl border border-fp-border bg-background shadow-xl">
              <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
                <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-fp-border" />

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
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {settingsT("language")}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {routing.locales.map((l) => {
                        const meta = localeConfig[l as keyof typeof localeConfig];
                        const active = l === locale;
                        return (
                          <button
                            key={l}
                            type="button"
                            className={
                              active
                                ? "tap-target rounded-xl border border-primary/35 bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
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
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {settingsT("theme")}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
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
                            className={
                              active
                                ? "tap-target rounded-xl border border-primary/35 bg-primary/10 px-2 py-2 text-xs font-semibold text-primary"
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
              </div>

              <div className="border-t border-fp-border px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
                {isGuest ? (
                  <Link
                    href="/auth/sign-in"
                    onClick={() => setOpen(false)}
                    className="tap-target inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-primary/35 bg-primary/10 px-4 text-sm font-semibold text-primary"
                  >
                    {authT("signIn")}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="tap-target inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-fp-border bg-fp-surface-2 px-4 text-sm font-semibold text-foreground"
                    onClick={() => {
                      void signOut().finally(() => setOpen(false));
                    }}
                  >
                    {authT("signOut")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      , document.body) : null}
    </>
  );
}
