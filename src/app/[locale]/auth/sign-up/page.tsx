"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button, ButtonLink, Notice } from "@/components/ui/primitives";
import { authInputClassName } from "@/components/auth/authStyles";
import { useAuth } from "@/components/providers/AuthProvider";

type ActiveAction = "google" | "password" | null;

/** A text link with a 44px touch area (DESIGN.md §4). */
const linkClassName =
  "inline-flex min-h-11 items-center font-medium text-fp-ink underline decoration-fp-lime decoration-2 underline-offset-4";

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
    <PageShell className="space-y-6">
      <SectionHeader title={t("signUp.title")} subtitle={t("signUp.subtitle")} className="mb-0" />

      {status === "authenticated" ? (
        <Notice
          tone="success"
          announce="off"
          title={t("signUp.alreadySignedIn")}
          action={
            <ButtonLink href="/team" size="sm">
              {t("signUp.goToTeam")}
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-fp-ink-2">{t("optional.subtitle")}</p>

          <form onSubmit={handlePasswordSignUp} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-semibold text-fp-ink">
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
                className={authInputClassName}
                autoComplete="email"
                inputMode="email"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-semibold text-fp-ink">
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
                className={authInputClassName}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="block text-sm font-semibold text-fp-ink">
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
                className={authInputClassName}
                autoComplete="new-password"
              />
            </div>

            <Button type="submit" variant="primary" block disabled={isBusy}>
              {activeAction === "password" ? t("actions.creatingAccount") : t("actions.signUpWithEmail")}
            </Button>
          </form>

          {error ? (
            <Notice tone="error" testId="sign-up-error">
              {error}
            </Notice>
          ) : null}
          {message ? (
            <Notice tone="success" testId="sign-up-message">
              {message}
            </Notice>
          ) : null}

          <div className="flex items-center gap-3" aria-hidden>
            <div className="h-px flex-1 bg-fp-rule" />
            <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2">
              {t("common.or")}
            </span>
            <div className="h-px flex-1 bg-fp-rule" />
          </div>

          <Button variant="secondary" block disabled={isBusy} onClick={handleGoogleSignUp}>
            {activeAction === "google" ? t("actions.connecting") : t("actions.continueWithGoogle")}
          </Button>

          <ul role="list" className="space-y-1 text-sm text-fp-ink-2">
            <li>
              {t("signUp.magicAlternative")}{" "}
              <Link href={{ pathname: "/auth/sign-in", query: { next: nextPath } }} className={linkClassName}>
                {t("actions.useMagicLinkInstead")}
              </Link>
            </li>
            <li>
              {t("signUp.haveAccount")}{" "}
              <Link href={{ pathname: "/auth/sign-in", query: { next: nextPath } }} className={linkClassName}>
                {t("actions.goToSignIn")}
              </Link>
            </li>
            <li>
              <Link href={nextPath} className={linkClassName}>
                {t("actions.continueAsGuest")}
              </Link>
            </li>
          </ul>
        </div>
      )}
    </PageShell>
  );
}
