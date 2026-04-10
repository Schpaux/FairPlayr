"use client";

import { FormEvent, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { teamTextInputClassName } from "@/components/team/styles";
import { useAuth } from "@/components/providers/AuthProvider";

export default function SignInPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const { supabase, status } = useAuth();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const callbackPath = locale === "en" ? "/auth/callback" : `/${locale}/auth/callback`;
    return new URL(callbackPath, window.location.origin).toString();
  }, [locale]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalized = email.trim();

    if (!normalized) {
      setError(t("validation.emailRequired"));
      return;
    }

    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        emailRedirectTo: callbackUrl,
      },
    });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
      return;
    }

    setMessage(t("messages.magicLinkSent"));
    setIsSubmitting(false);
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
          <form onSubmit={handleSubmit} className="space-y-3">
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

            {error ? <p className="text-xs text-danger">{error}</p> : null}
            {message ? <p className="text-xs text-fp-accent">{message}</p> : null}

            <FpButton
              type="submit"
              variant="primary"
              size="md"
              className="tap-target"
              disabled={isSubmitting}
            >
              {isSubmitting ? t("signIn.submitting") : t("signIn.submit")}
            </FpButton>
          </form>

          <p className="text-xs text-muted-foreground">{t("signIn.disclaimer")}</p>
        </AppCard>
      )}
    </PageShell>
  );
}
