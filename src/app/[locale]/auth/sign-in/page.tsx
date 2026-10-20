"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { ButtonLink } from "@/components/ui/primitives";
import { teamTextInputClassName } from "@/components/team/styles";
import { useAuth } from "@/components/providers/AuthProvider";

type ActiveAction = "google" | "email" | null;

function GoogleMark() {
  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" role="presentation">
        <path
          fill="#4285F4"
          d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.51 5.51 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.57-5.14 3.57-8.65z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.08 7.93-2.92l-3.86-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.12-6.72-4.97H1.3v3.11A11.99 11.99 0 0 0 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.28 14.26A7.2 7.2 0 0 1 4.9 12c0-.78.13-1.54.38-2.26V6.63H1.3A12 12 0 0 0 0 12c0 1.93.46 3.75 1.3 5.37l3.98-3.11z"
        />
        <path
          fill="#EA4335"
          d="M12 4.77c1.76 0 3.34.6 4.58 1.76l3.43-3.43C17.95 1.17 15.24 0 12 0A11.99 11.99 0 0 0 1.3 6.63l3.98 3.11c.94-2.85 3.59-4.97 6.72-4.97z"
        />
      </svg>
    </span>
  );
}

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
          <ButtonLink href="/team" variant="secondary" size="sm">
            {t("signIn.goToTeam")}
          </ButtonLink>
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
            className="tap-target border border-fp-border bg-white text-foreground hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            disabled={isBusy}
            onClick={handleGoogleSignIn}
          >
            <GoogleMark />
            {activeAction === "google" ? t("actions.connecting") : t("actions.continueWithGoogle")}
          </FpButton>

          {error ? <p className="text-xs text-danger">{error}</p> : null}
          {message ? <p className="text-xs text-fp-accent">{message}</p> : null}
        </AppCard>
      )}
    </PageShell>
  );
}
