"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { teamTextInputClassName } from "@/components/team/styles";
import { useAuth } from "@/components/providers/AuthProvider";

type ActiveAction = "google" | "magic" | "password" | null;

function mapAuthError(message: string, t: ReturnType<typeof useTranslations>) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return t("errors.invalidCredentials");
  }

  if (normalized.includes("email not confirmed")) {
    return t("errors.emailNotConfirmed");
  }

  return t("errors.generic");
}

export default function SignInPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { supabase, status } = useAuth();

  const [magicEmail, setMagicEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const handleMagicSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalized = magicEmail.trim();

    if (!normalized) {
      setError(t("validation.emailRequired"));
      return;
    }

    setError(null);
    setMessage(null);
    setActiveAction("magic");

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        emailRedirectTo: callbackUrl,
      },
    });

    if (signInError) {
      setError(mapAuthError(signInError.message, t));
      setActiveAction(null);
      return;
    }

    setMessage(t("messages.magicLinkSent"));
    setActiveAction(null);
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
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

    setError(null);
    setMessage(null);
    setActiveAction("password");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalized,
      password,
    });

    if (signInError) {
      setError(mapAuthError(signInError.message, t));
      setActiveAction(null);
      return;
    }

    router.push(nextPath);
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
          <p className="text-xs text-muted-foreground">{t("optional.subtitle")}</p>

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

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-fp-border" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("common.or")}
            </span>
            <div className="h-px flex-1 bg-fp-border" />
          </div>

          <form onSubmit={handleMagicSubmit} className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("signIn.magicTitle")}
            </p>
            <label htmlFor="magic-email" className="text-xs font-medium text-muted-foreground">
              {t("signIn.emailLabel")}
            </label>
            <input
              id="magic-email"
              type="email"
              value={magicEmail}
              onChange={(event) => {
                setMagicEmail(event.target.value);
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
              disabled={isBusy}
            >
              {activeAction === "magic" ? t("signIn.submitting") : t("actions.continueWithMagicLink")}
            </FpButton>
          </form>

          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("signIn.passwordTitle")}
            </p>
            <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
              {t("signIn.emailLabel")}
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
              placeholder={t("signIn.emailPlaceholder")}
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
              placeholder={t("signIn.passwordPlaceholder")}
              className={teamTextInputClassName}
              autoComplete="current-password"
            />

            <FpButton
              type="submit"
              variant="secondary"
              size="md"
              className="tap-target"
              fullWidth
              disabled={isBusy}
            >
              {activeAction === "password" ? t("actions.signingIn") : t("actions.signInWithEmail")}
            </FpButton>
          </form>

          {error ? <p className="text-xs text-danger">{error}</p> : null}
          {message ? <p className="text-xs text-fp-accent">{message}</p> : null}

          <div className="space-y-2 text-xs text-muted-foreground">
            <p>{t("signIn.noAccount")}</p>
            <Link href={{ pathname: "/auth/sign-up", query: { next: nextPath } }} className="text-primary">
              {t("actions.goToSignUp")}
            </Link>
          </div>

          <Link href={nextPath} className="text-xs text-muted-foreground underline underline-offset-2">
            {t("actions.continueAsGuest")}
          </Link>
        </AppCard>
      )}
    </PageShell>
  );
}
