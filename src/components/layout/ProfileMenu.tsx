"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, CircleDashed, CircleOff } from "lucide-react";
import { usePathname } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { SyncStatusRow } from "@/components/layout/SyncStatusRow";
import { StatusValue } from "@/components/layout/StatusValue";
import { useSpondConnection, type SpondConnectionState } from "@/components/team/useSpondStatus";
import { SignOutConfirmSheet } from "@/components/auth/SignOutConfirmSheet";
import { Button, ButtonLink, ListGroup, ListRow, Sheet } from "@/components/ui/primitives";
import { readProfileMetadata } from "@/lib/utils/profileMetadata";


const SPOND_GLYPHS = {
  checking: CircleDashed,
  connected: CircleCheck,
  disconnected: CircleOff,
  unavailable: CircleAlert,
} as const;

/** Spond status as one row: checking, connected, not connected, could not check. */
function SpondStatusRow({ state }: { state: Exclude<SpondConnectionState, "guest"> }) {
  const t = useTranslations("profileMenu.spond");

  return (
    <ListRow
      testId="spond-status-row"
      label={t("title")}
      trailing={
        <StatusValue
          icon={SPOND_GLYPHS[state]}
          tone={state === "connected" ? "ok" : state === "unavailable" ? "warn" : "quiet"}
          status={state}
          testId="spond-status-value"
        >
          {t(state)}
        </StatusValue>
      }
    />
  );
}

/**
 * The profile sheet (C5, owner decision B2): account, sync status, Spond
 * status and the way to Settings, plus sign-in or sign-out. Theme and
 * language are chosen in Settings only.
 */
export function ProfileMenu() {
  const t = useTranslations("profileMenu");
  const authT = useTranslations("auth.actions");
  const settingsT = useTranslations("settings");
  const { status, user } = useAuth();
  const workspace = useTeamWorkspace();
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);

  // The sheet is open for the page it was opened on: following a link in it
  // (Settings, Logg inn) changes the path and so closes it, with no effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  // Forget it once the path has changed, so coming back to that page does not
  // reopen the sheet by itself (state adjusted during render, no effect).
  if (openOn !== null && openOn !== pathname) setOpenOn(null);
  const open = openOn !== null && openOn === pathname;
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const profile = useMemo(() => readProfileMetadata(user), [user]);
  const isGuest = status !== "authenticated";

  const spondState = useSpondConnection(workspace.activeTeamId, workspace.mode);

  const displayName = profile.name ?? (isGuest ? t("guestName") : user?.email ?? "-");
  const secondary = isGuest ? t("guestEmail") : profile.name ? user?.email ?? null : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="tap-target inline-flex h-10 w-10 items-center justify-center rounded-full border border-fp-border bg-fp-surface-2"
        onClick={() => setOpenOn(pathname)}
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
        onOpenChange={(next) => setOpenOn(next ? pathname : null)}
        title={t("title")}
        testId="profile-menu"
        actions={
          isGuest ? (
            <ButtonLink href="/auth/sign-in" variant="primary" block onClick={() => setOpenOn(null)}>
              {authT("signIn")}
            </ButtonLink>
          ) : (
            <Button
              block
              onClick={() => {
                // One sheet at a time: the confirmation replaces this one.
                setOpenOn(null);
                setConfirmSignOut(true);
              }}
            >
              {authT("signOut")}
            </Button>
          )
        }
      >
        <div className="space-y-4">
          <ListGroup aria-label={t("accountGroup")} testId="profile-menu-status">
            <ListRow
              testId="profile-account-row"
              leading={
                <UserAvatar
                  name={profile.name}
                  email={user?.email ?? null}
                  photoUrl={profile.photoUrl}
                  isGuest={isGuest}
                />
              }
              label={displayName}
              description={secondary ?? undefined}
            />
            <SyncStatusRow mode={workspace.mode} hasError={Boolean(workspace.error)} />
            {spondState !== "guest" ? <SpondStatusRow state={spondState} /> : null}
          </ListGroup>

          {/* On Settings itself the link would go nowhere (and not close the sheet). */}
          {pathname !== "/settings" ? (
            <ListGroup aria-label={settingsT("title")}>
              <ListRow href="/settings" label={settingsT("title")} testId="profile-settings-link" />
            </ListGroup>
          ) : null}
        </div>
      </Sheet>

      <SignOutConfirmSheet
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        finalFocus={triggerRef}
      />
    </>
  );
}
