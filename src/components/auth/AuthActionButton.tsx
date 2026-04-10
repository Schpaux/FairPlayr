"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";

export function AuthActionButton() {
  const t = useTranslations("auth");
  const { status, signOut } = useAuth();
  const [isPending, startTransition] = useTransition();

  if (status === "loading") {
    return null;
  }

  if (status === "guest") {
    return (
      <Link
        href="/auth/sign-in"
        className="tap-target rounded-lg border border-fp-border bg-fp-surface-2 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {t("actions.signIn")}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        startTransition(async () => {
          await signOut();
        });
      }}
      disabled={isPending}
      className="tap-target rounded-lg border border-fp-border bg-fp-surface-2 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
    >
      {isPending ? t("actions.signingOut") : t("actions.signOut")}
    </button>
  );
}
