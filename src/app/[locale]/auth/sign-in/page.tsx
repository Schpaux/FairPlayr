"use client";

import { FormEvent, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button, ButtonLink, Notice } from "@/components/ui/primitives";
import { authInputClassName } from "@/components/auth/authStyles";
import { useAuth } from "@/components/providers/AuthProvider";

type ActiveAction = "google" | "email" | null;

function GoogleMark() {
  return (
    // Google's own mark on a white disc (brand colours; the one allowed
    // hard-coded colour, see designGuard.test.ts).
    <span
      aria-hidden
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white"
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
  // C5-F1: only a problem with the address marks the field invalid; a Google
  // or network failure is not the field's fault.
  const [fieldInvalid, setFieldInvalid] = useState(false);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const helpId = useId();

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
      setFieldInvalid(true);
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError(t("validation.emailInvalid"));
      setFieldInvalid(true);
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
    <PageShell className="space-y-6">
      <SectionHeader title={t("signIn.title")} subtitle={t("signIn.subtitle")} className="mb-0" />

      {status === "authenticated" ? (
        <Notice
          tone="success"
          announce="off"
          title={t("signIn.alreadySignedIn")}
          action={
            <ButtonLink href="/team" size="sm">
              {t("signIn.goToTeam")}
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-5">
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="magic-email" className="block text-sm font-semibold text-fp-ink">
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
                    setFieldInvalid(false);
                  }
                }}
                placeholder={t("signIn.emailPlaceholder")}
                className={authInputClassName}
                autoComplete="email"
                inputMode="email"
                aria-describedby={helpId}
                aria-invalid={fieldInvalid && error ? true : undefined}
              />
              <p id={helpId} className="text-sm text-fp-ink-2">
                {t("signIn.helpText")}
              </p>
            </div>

            <Button type="submit" variant="primary" block disabled={!canSubmit}>
              {activeAction === "email" ? t("signIn.submitting") : t("signIn.submit")}
            </Button>
          </form>

          {error ? (
            <Notice tone="error" testId="sign-in-error">
              {error}
            </Notice>
          ) : null}
          {/* C5-F1: a status region that is always mounted, so «sendt» is
              announced in every screen reader; the notice itself is silent. */}
          <p role="status" className="sr-only">
            {message ?? ""}
          </p>
          {message ? (
            <Notice tone="success" announce="off" testId="sign-in-message">
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

          <Button
            variant="secondary"
            block
            icon={<GoogleMark />}
            disabled={isBusy}
            onClick={handleGoogleSignIn}
          >
            {activeAction === "google" ? t("actions.connecting") : t("actions.continueWithGoogle")}
          </Button>

          <p className="text-sm text-fp-ink-2">
            {t("signIn.noAccount")}{" "}
            <Link
              href={{ pathname: "/auth/sign-up", query: { next: nextPath } }}
              className="inline-flex min-h-11 items-center font-medium text-fp-ink underline decoration-fp-lime decoration-2 underline-offset-4"
            >
              {t("actions.goToSignUp")}
            </Link>
          </p>
        </div>
      )}
    </PageShell>
  );
}
