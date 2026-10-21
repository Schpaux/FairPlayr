"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { ButtonLink } from "@/components/ui/primitives";
import { teamTextInputClassName } from "@/components/team/styles";
import { useAuth } from "@/components/providers/AuthProvider";

type ActiveAction = "google" | "password" | null;

function mapAuthError(message: string, t: ReturnType<typeof useTranslations>) {
  const normalized = message.toLowerCase();

  if (normalized.includes("user already registered")) {
    return t("errors.userAlreadyRegistered");
  }

  if (normalized.includes("password")) {
    return t("errors.weakPassword");
  }

  return t("errors.generic");
}

export default function SignUpPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { supabase, status } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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

  const handleGoogleSignUp = async () => {
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

  const handlePasswordSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalized = email.trim();

    if (!normalized) {
      setError(t("validation.emailRequired"));
      return;
    }

    if (!password) {
      setError(t("validation.passwordRequired"));
      return;
    }

    if (password.length < 6) {
      setError(t("validation.passwordTooShort"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("validation.passwordMismatch"));
      return;
    }

    setError(null);
    setMessage(null);
    setActiveAction("password");

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalized,
      password,
      options: {
        emailRedirectTo: callbackUrl,
      },
    });

    if (signUpError) {
      setError(mapAuthError(signUpError.message, t));
      setActiveAction(null);
      return;
    }

    if (data.session) {
      router.push(nextPath);
      return;
    }

    setMessage(t("messages.confirmEmail"));
    setActiveAction(null);
  };

  return (
    <PageShell className="space-y-4">
      <SectionHeader title={t("signUp.title")} subtitle={t("signUp.subtitle")} />

      {status === "authenticated" ? (
        <AppCard className="space-y-3 p-4">
          <p className="text-sm font-semibold text-foreground">{t("signUp.alreadySignedIn")}</p>
          <ButtonLink href="/team" variant="secondary" size="sm">
            {t("signUp.goToTeam")}
          </ButtonLink>
        </AppCard>
      ) : (
        <AppCard className="space-y-4 p-4">
          <p className="text-xs text-muted-foreground">{t("optional.subtitle")}</p>

          <FpButton
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            className="tap-target"
            disabled={isBusy}
            onClick={handleGoogleSignUp}
          >
            {activeAction === "google" ? t("actions.connecting") : t("actions.continueWithGoogle")}
          </FpButton>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-fp-border" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("common.or")}
            </span>
            <div className="h-px flex-1 bg-fp-border" />
          </div>

          <form onSubmit={handlePasswordSignUp} className="space-y-3">
            <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
              {t("fields.email")}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              placeholder={t("signUp.emailPlaceholder")}
              className={teamTextInputClassName}
              autoComplete="email"
              inputMode="email"
            />

            <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
              {t("fields.password")}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              placeholder={t("signUp.passwordPlaceholder")}
              className={teamTextInputClassName}
              autoComplete="new-password"
            />

            <label htmlFor="confirm-password" className="text-xs font-medium text-muted-foreground">
              {t("fields.confirmPassword")}
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              placeholder={t("signUp.confirmPasswordPlaceholder")}
              className={teamTextInputClassName}
              autoComplete="new-password"
            />

            <FpButton
              type="submit"
              variant="primary"
              size="md"
              className="tap-target"
              fullWidth
              disabled={isBusy}
            >
              {activeAction === "password" ? t("actions.creatingAccount") : t("actions.signUpWithEmail")}
            </FpButton>
          </form>

          <p className="text-xs text-muted-foreground">{t("signUp.magicAlternative")}</p>
          <Link href={{ pathname: "/auth/sign-in", query: { next: nextPath } }} className="inline-flex min-h-11 items-center text-xs text-fp-ink underline decoration-fp-lime decoration-2 underline-offset-4">
            {t("actions.useMagicLinkInstead")}
          </Link>

          {error ? <p className="text-xs text-fp-danger-text">{error}</p> : null}
          {message ? <p className="text-xs text-fp-ok-text">{message}</p> : null}

          <div className="space-y-2 text-xs text-muted-foreground">
            <p>{t("signUp.haveAccount")}</p>
            <Link href={{ pathname: "/auth/sign-in", query: { next: nextPath } }} className="inline-flex min-h-11 items-center text-fp-ink underline decoration-fp-lime decoration-2 underline-offset-4">
              {t("actions.goToSignIn")}
            </Link>
          </div>

          <Link href={nextPath} className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline underline-offset-2">
            {t("actions.continueAsGuest")}
          </Link>
        </AppCard>
      )}
    </PageShell>
  );
}
