"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { teamTextInputClassName } from "@/components/team/styles";
import { useAuth } from "@/components/providers/AuthProvider";

type ActiveAction = "google" | "email" | null;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function mapAuthError(message: string, t: ReturnType<typeof useTranslations>) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid email")) {
    return t("validation.emailInvalid");
  }

  return t("errors.generic");
}

export default function SignInPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { supabase, status } = useAuth();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

  const nextPath = useMemo(() => {
    const next = searchParams.get("next");
    return next && next.startsWith("/") ? next : "/team";
  }, [searchParams]);

  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const callbackPath = locale === "en" ? "/auth/callback" : `/${locale}/auth/callback`;
    const callback = new URL(callbackPath, window.location.origin);
    callback.searchParams.set("next", nextPath);
    return callback.toString();
  }, [locale, nextPath]);

  const isBusy = activeAction !== null;
  const normalizedEmail = email.trim();
  const canSubmit = !isBusy && normalizedEmail.length > 0;

  const handleGoogleSignIn = async () => {
    setError(null);
    setMessage(null);
    setActiveAction("google");

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (oauthError) {
      setError(mapAuthError(oauthError.message, t));
      setActiveAction(null);
    }
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!normalizedEmail) {
      setError(t("validation.emailRequired"));
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError(t("validation.emailInvalid"));
      return;
    }

    setError(null);
    setMessage(null);
    setActiveAction("email");

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: callbackUrl,
      },
    });

    if (signInError) {
      setError(mapAuthError(signInError.message, t));
      setActiveAction(null);
      return;
    }

    setMessage(t("messages.emailLinkSent"));
    setActiveAction(null);
  };

  return (
    <PageShell className="space-y-4">
      <SectionHeader title={t("signIn.title")} subtitle={t("signIn.subtitle")} accent />

      {status === "authenticated" ? (
        <AppCard className="space-y-3 p-4">
          <p className="text-sm font-semibold text-foreground">{t("signIn.alreadySignedIn")}</p>
          <Link href="/team">
            <FpButton variant="secondary" size="md" className="tap-target">
              {t("signIn.goToTeam")}
            </FpButton>
          </Link>
        </AppCard>
      ) : (
        <AppCard className="space-y-4 p-4">
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <label htmlFor="magic-email" className="text-xs font-medium text-muted-foreground">
              {t("signIn.emailLabel")}
            </label>
            <input
              id="magic-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              placeholder={t("signIn.emailPlaceholder")}
              className={teamTextInputClassName}
              autoComplete="email"
              inputMode="email"
            />

            <FpButton
              type="submit"
              variant="primary"
              size="md"
              className="tap-target"
              fullWidth
              disabled={!canSubmit}
            >
              {activeAction === "email" ? t("signIn.submitting") : t("signIn.submit")}
            </FpButton>

            <p className="text-xs text-muted-foreground">{t("signIn.helpText")}</p>
          </form>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-fp-border" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("signIn.separator")}
            </span>
            <div className="h-px flex-1 bg-fp-border" />
          </div>

          <FpButton
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            className="tap-target"
            disabled={isBusy}
            onClick={handleGoogleSignIn}
          >
            {activeAction === "google" ? t("actions.connecting") : t("actions.continueWithGoogle")}
          </FpButton>

          {error ? <p className="text-xs text-danger">{error}</p> : null}
          {message ? <p className="text-xs text-fp-accent">{message}</p> : null}
        </AppCard>
      )}
    </PageShell>
  );
}
