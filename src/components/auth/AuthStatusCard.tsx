"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { ButtonLink } from "@/components/ui/primitives";
import { useAuth } from "@/components/providers/AuthProvider";

export function AuthStatusCard() {
  const t = useTranslations("auth");
  const { status, user, signOut } = useAuth();
  const [isPending, startTransition] = useTransition();

  if (status === "loading") {
    return (
      <AppCard className="p-4 text-sm text-muted-foreground">{t("status.loading")}</AppCard>
    );
  }

  if (status === "guest") {
    return (
      <AppCard className="space-y-3 p-4">
        <p className="text-sm font-semibold text-foreground">{t("status.guestTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("status.guestDescription")}</p>
        <ButtonLink href="/auth/sign-in" variant="primary" size="sm">
          {t("actions.signIn")}
        </ButtonLink>
      </AppCard>
    );
  }

  return (
    <AppCard className="space-y-3 p-4">
      <p className="text-sm font-semibold text-foreground">{t("status.signedInTitle")}</p>
      <p className="text-xs text-muted-foreground">
        {t("status.signedInAs", { email: user?.email ?? "-" })}
      </p>
      <FpButton
        variant="secondary"
        size="md"
        onClick={() => {
          startTransition(async () => {
            await signOut();
          });
        }}
        disabled={isPending}
        className="tap-target"
      >
        {isPending ? t("actions.signingOut") : t("actions.signOut")}
      </FpButton>
    </AppCard>
  );
}
