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
        className="h-9 px-3 rounded-xl surface-2 border border-fp-border flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors tap-target"
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
      className="h-9 px-3 rounded-xl surface-2 border border-fp-border flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors tap-target disabled:opacity-60"
    >
      {isPending ? t("actions.signingOut") : t("actions.signOut")}
    </button>
  );
}
