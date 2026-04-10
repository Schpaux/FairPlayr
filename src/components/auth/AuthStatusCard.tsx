"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
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
        <Link href="/auth/sign-in">
          <FpButton variant="secondary" size="md" className="tap-target">
            {t("actions.signIn")}
          </FpButton>
        </Link>
      </AppCard>
    );
  }

  return (
    <AppCard className="space-y-3 p-4">
      <p className="text-sm font-semibold text-foreground">{t("status.signedInTitle")}</p>
      <p className="text-xs text-muted-foreground">
        {t("status.signedInAs", { email: user?.email ?? "-" })}
      </p>
      <button
        type="button"
        onClick={() => {
          startTransition(async () => {
            await signOut();
          });
        }}
        disabled={isPending}
        className="tap-target inline-flex h-10 items-center rounded-xl border border-fp-border bg-fp-surface-2 px-4 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        {isPending ? t("actions.signingOut") : t("actions.signOut")}
      </button>
    </AppCard>
  );
}
