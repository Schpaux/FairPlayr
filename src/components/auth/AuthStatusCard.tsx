"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AppCard } from "@/components/ui/AppCard";
import { Button, ButtonLink } from "@/components/ui/primitives";
import { useAuth } from "@/components/providers/AuthProvider";
import { SignOutConfirmSheet } from "@/components/auth/SignOutConfirmSheet";

/**
 * Account status card. Not rendered by Settings since C5 (Settings builds its
 * own account rows); kept for reuse. Signing out goes through the shared
 * confirmation (owner decision B4).
 */
export function AuthStatusCard() {
  const t = useTranslations("auth");
  const { status, user } = useAuth();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  if (status === "loading") {
    return <AppCard className="p-4 text-sm text-muted-foreground">{t("status.loading")}</AppCard>;
  }

  if (status === "guest") {
    return (
      <AppCard className="space-y-3 p-4">
        <p className="text-base font-semibold text-foreground">{t("status.guestTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("status.guestDescription")}</p>
        <ButtonLink href="/auth/sign-in" variant="primary" size="sm">
          {t("actions.signIn")}
        </ButtonLink>
      </AppCard>
    );
  }

  return (
    <AppCard className="space-y-3 p-4">
      <p className="text-base font-semibold text-foreground">{t("status.signedInTitle")}</p>
      <p className="text-sm text-muted-foreground">{t("status.signedInAs", { email: user?.email ?? "-" })}</p>
      <Button variant="secondary" onClick={() => setConfirmSignOut(true)}>
        {t("actions.signOut")}
      </Button>
      <SignOutConfirmSheet open={confirmSignOut} onOpenChange={setConfirmSignOut} />
    </AppCard>
  );
}
