"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FpButton } from "@/components/ui/FpButton";

interface MatchDetails {
  id: string;
  title: string;
  opponentName: string | null;
  startsAt: string;
  location: string | null;
  status: "draft" | "upcoming" | "live" | "completed";
  source: "manual" | "spond";
}

function parseApiError(payload: unknown): { message: string } {
  if (typeof payload !== "object" || payload === null) {
    return { message: "Ukjent feil." };
  }

  const value = payload as Record<string, unknown>;

  return {
    message: typeof value.message === "string" ? value.message : "Ukjent feil.",
  };
}

export function MatchDetailsManager({ matchId }: { matchId: string }) {
  const t = useTranslations("matchPlanner");
  const common = useTranslations("common");
  const locale = useLocale();
  const auth = useAuth();

  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (auth.status !== "authenticated") {
      setIsLoading(false);
      return;
    }

    void (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, {
          method: "GET",
        });

        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          throw new Error(parseApiError(payload).message);
        }

        const data = payload as { match: MatchDetails };
        setMatch(data.match);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("errors.generic"));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [auth.status, matchId, t]);

  if (isLoading || auth.status === "loading") {
    return (
      <PageShell>
        <AppCard className="p-6 text-sm text-muted-foreground">{common("loading")}</AppCard>
      </PageShell>
    );
  }

  if (auth.status !== "authenticated") {
    return (
      <PageShell className="space-y-4">
        <SectionHeader title={t("detailsTitle")} subtitle={t("subtitle")} accent />
        <EmptyState
          icon={ShieldAlert}
          title={t("loginRequiredTitle")}
          description={t("loginRequiredDescription")}
          action={
            <Link href="/auth/sign-in">
              <FpButton variant="primary" size="md">{t("loginCta")}</FpButton>
            </Link>
          }
        />
      </PageShell>
    );
  }

  if (error || !match) {
    return (
      <PageShell className="space-y-4">
        <SectionHeader title={t("detailsTitle")} subtitle={t("subtitle")} accent />
        <AppCard className="p-3 text-xs text-danger">{error ?? t("errors.generic")}</AppCard>
      </PageShell>
    );
  }

  const startsAt = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(match.startsAt));

  return (
    <PageShell className="space-y-4">
      <SectionHeader title={t("detailsTitle")} subtitle={match.title} accent />

      <AppCard className="space-y-2 p-4">
        {match.source === "spond" ? (
          <span className="inline-flex rounded-full border border-fp-accent/40 bg-fp-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fp-accent">
            {t("spondBadge")}
          </span>
        ) : null}
        <p className="text-sm font-semibold text-foreground">{match.title}</p>
        {match.opponentName ? <p className="text-xs text-muted-foreground">{t("vs", { opponent: match.opponentName })}</p> : null}
        <p className="text-xs text-muted-foreground">{t("timeLabel", { value: startsAt })}</p>
        <p className="text-xs text-muted-foreground">{t("locationLabel", { value: match.location ?? t("noLocation") })}</p>
        <p className="text-xs text-muted-foreground">{t("statusLabel", { value: match.status })}</p>
      </AppCard>

      <Link href="/match">
        <FpButton variant="secondary" size="md">{t("backToList")}</FpButton>
      </Link>
    </PageShell>
  );
}
