"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ButtonLink } from "@/components/ui/primitives";
import { useAuth } from "@/components/providers/AuthProvider";
import { SignOutConfirmSheet } from "@/components/auth/SignOutConfirmSheet";

/**
 * Compact sign-in / sign-out action. Not rendered anywhere today; signing
 * out goes through the shared confirmation (owner decision B4).
 */
export function AuthActionButton() {
  const t = useTranslations("auth");
  const { status } = useAuth();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  if (status === "loading") {
    return null;
  }

  if (status === "guest") {
    return (
      <ButtonLink href="/auth/sign-in" size="sm">
        {t("actions.signIn")}
      </ButtonLink>
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setConfirmSignOut(true)}>
        {t("actions.signOut")}
      </Button>
      <SignOutConfirmSheet open={confirmSignOut} onOpenChange={setConfirmSignOut} />
    </>
  );
}
