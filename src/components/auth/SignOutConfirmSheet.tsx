"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button, ButtonLink, Sheet } from "@/components/ui/primitives";
import { hasActiveStoredMatch } from "@/lib/storage/matchStorage";

/**
 * The one sign-out confirmation (C5, owner decision B4). Every sign-out entry
 * point opens this first; only its confirm button calls `signOut()`, which is
 * unchanged. The copy states what happens on this device: the coach is signed
 * out here, and the matches stored here are not deleted (`signOut()` clears
 * the auth identity, this account's cloud-team mirror and the squad snapshot,
 * never match storage).
 *
 * While a match is active on this device, sign-out is blocked (owner
 * decision, C5): the sheet explains why and offers the match instead, and
 * `signOut()` is never called. The stored match status is read when the sheet
 * renders and again right before signing out, so a match started in another
 * tab while the sheet is open still blocks it.
 *
 * Render it unconditionally (not inside a signed-in-only branch), so it stays
 * mounted while the sign-out finishes and the page switches to guest.
 */
export function SignOutConfirmSheet({
  open,
  onOpenChange,
  finalFocus,
  onSignedOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes on close, when the trigger is gone after signing out. */
  finalFocus?: RefObject<HTMLElement | null>;
  onSignedOut?: () => void;
}) {
  const t = useTranslations("auth.signOutConfirm");
  const { signOut } = useAuth();
  const [pending, setPending] = useState(false);
  const [blockedAtConfirm, setBlockedAtConfirm] = useState(false);

  const goToMatchRef = useRef<HTMLAnchorElement>(null);

  // Blocked at confirm: the focused confirm button is gone, so focus moves to
  // the way forward instead of falling to the page.
  useEffect(() => {
    if (blockedAtConfirm) goToMatchRef.current?.focus();
  }, [blockedAtConfirm]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setBlockedAtConfirm(false);
    onOpenChange(next);
  };

  // `open &&` keeps the storage read out of the server render.
  const blocked = open && (blockedAtConfirm || hasActiveStoredMatch());

  // One Sheet whose content switches, not two dialogs: when the confirm-time
  // re-check blocks, the dialog stays mounted and focus stays inside it.
  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      title={blocked ? t("blockedTitle") : t("title")}
      description={blocked ? t("blockedDescription") : t("description")}
      closeButton={blocked}
      finalFocus={finalFocus}
      testId={blocked ? "sign-out-blocked" : "sign-out-confirm"}
      actions={
        blocked ? (
          <ButtonLink ref={goToMatchRef} href="/match/live" variant="primary" block onClick={() => handleOpenChange(false)}>
            {t("blockedGoToMatch")}
          </ButtonLink>
        ) : (
          <>
            <Button
              variant="primary"
              block
              aria-disabled={pending || undefined}
              aria-busy={pending || undefined}
              onClick={() => {
                if (pending) return;
                if (hasActiveStoredMatch()) {
                  setBlockedAtConfirm(true);
                  return;
                }
                setPending(true);
                void signOut().finally(() => {
                  setPending(false);
                  handleOpenChange(false);
                  onSignedOut?.();
                });
              }}
            >
              {t("confirm")}
            </Button>
            <Button variant="secondary" block onClick={() => handleOpenChange(false)}>
              {t("cancel")}
            </Button>
          </>
        )
      }
    />
  );
}
