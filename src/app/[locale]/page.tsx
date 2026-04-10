"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  Timer,
  LayoutGrid,
  Shuffle,
  ChevronRight,
  ShieldCheck,
  Link2,
} from "lucide-react";
import type { ElementType } from "react";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { variants, transitions } from "@/lib/tokens";
import type { AppCardProps } from "@/components/ui/AppCard";

/* ─── Animation variants ─────────────────────────────────────────────────── */
// Hero items animate slower for a more premium feel than the default fadeInUp
const heroItem = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: transitions.slow },
};

/* ─── Feature card configuration ─────────────────────────────────────────── */
type ValueKey = "format" | "realtime" | "fair";
type ProblemKey = "overview" | "randomSubs" | "unevenTime" | "parentQuestions";
type FeatureKey = "smartBuilder" | "livePlaytime" | "smartSubs" | "alwaysFair";
type SpondBenefitKey = "autoImport" | "attendance" | "lessDoubleWork" | "fasterSetup";

const features: Array<{
  key: FeatureKey;
  icon: ElementType;
  glow: AppCardProps["glow"];
}> = [
  { key: "smartBuilder", icon: LayoutGrid, glow: "primary" },
  { key: "livePlaytime", icon: Timer, glow: "none" },
  { key: "smartSubs", icon: Shuffle, glow: "accent" },
  { key: "alwaysFair", icon: ShieldCheck, glow: "none" },
];

const valueProps: ValueKey[] = ["format", "realtime", "fair"];
const problems: ProblemKey[] = ["overview", "randomSubs", "unevenTime", "parentQuestions"];
const spondBenefits: SpondBenefitKey[] = ["autoImport", "attendance", "lessDoubleWork", "fasterSetup"];
const spondSteps = [1, 2, 3] as const;

const featureIconClass: Record<NonNullable<AppCardProps["glow"]>, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-fp-accent/10 text-fp-accent",
  none: "bg-fp-surface-2 text-muted-foreground",
};

export default function HomePage() {
  const t = useTranslations("home");

  return (
    <div className="relative overflow-hidden">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[calc(100svh-4rem)] flex flex-col justify-center px-4 pt-8 pb-16">
        {/* Atmospheric background glows */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4 h-[500px] w-[500px] rounded-full bg-primary/20 blur-[120px]" />
          <div className="absolute right-0 bottom-0 translate-x-1/4 translate-y-1/4 h-[300px] w-[300px] rounded-full bg-fp-accent/10 blur-[100px]" />
        </div>

        <div className="mx-auto w-full max-w-screen-sm">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={variants.staggerContainer}
            className="flex flex-col items-center text-center gap-6"
          >
            {/* Badge */}
            <motion.div variants={heroItem}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-fp-accent/35 bg-fp-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-fp-accent">
                <Link2 size={12} />
                {t("hero.spondBadge")}
              </span>
            </motion.div>

            {/* Headline */}
            <motion.div variants={heroItem} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("hero.eyebrow")}
              </p>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                {t("hero.headline")}
              </h1>
            </motion.div>

            {/* Subtitle */}
            <motion.p
              variants={heroItem}
              className="max-w-sm text-base text-muted-foreground leading-relaxed"
            >
              {t("hero.subtitle")}
            </motion.p>

            {/* CTAs */}
            <motion.div
              variants={heroItem}
              className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto"
            >
              <Link href="/match/setup" className="w-full sm:w-auto">
                <FpButton variant="primary" size="lg" fullWidth className="group">
                  {t("hero.ctaPrimary")}
                  <ArrowRight
                    size={18}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </FpButton>
              </Link>
              <Link href="/team" className="w-full sm:w-auto">
                <FpButton variant="secondary" size="lg" fullWidth>
                  {t("hero.ctaSecondary")}
                </FpButton>
              </Link>
            </motion.div>

            {/* Value props */}
            <motion.div
              variants={heroItem}
              className="grid grid-cols-3 gap-4 w-full max-w-xs mt-2"
            >
              {valueProps.map((item) => (
                <div key={item} className="flex flex-col items-center gap-0.5">
                  <span className="text-sm font-semibold text-foreground">
                    {t(`valueProps.${item}.value`)}
                  </span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">
                    {t(`valueProps.${item}.label`)}
                  </span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Problem -> solution ───────────────────────────────────────────── */}
      <section className="px-4 pb-16">
        <div className="mx-auto w-full max-w-screen-sm">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={variants.staggerContainer}
          >
            <motion.div variants={heroItem} className="text-center mb-8">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                {t("problem.title")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
                {t("problem.intro")}
              </p>
            </motion.div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {problems.map((item) => (
                <motion.div key={item} variants={heroItem}>
                  <AppCard className="space-y-2 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-danger">
                      {t("problem.problemLabel")}
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {t(`problem.items.${item}.problem`)}
                    </p>
                    <div className="h-px bg-fp-border" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-fp-accent">
                      {t("problem.solutionLabel")}
                    </p>
                    <p className="text-sm text-foreground">
                      {t(`problem.items.${item}.solution`)}
                    </p>
                  </AppCard>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="px-4 pb-16">
        <div className="mx-auto w-full max-w-screen-sm">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={variants.staggerContainer}
          >
            <motion.div variants={heroItem} className="text-center mb-8">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                {t("features.title")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
                {t("features.subtitle")}
              </p>
            </motion.div>

            <div className="flex flex-col gap-3">
              {features.map(({ key, icon: Icon, glow }) => (
                <motion.div key={key} variants={heroItem}>
                  <AppCard glow={glow} className="flex items-start gap-4 p-5">
                    <div
                      className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-xl ${featureIconClass[glow ?? "none"]}`}
                    >
                      <Icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground text-sm">
                        {t(`features.items.${key}.title`)}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        {t(`features.items.${key}.description`)}
                      </p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-muted-foreground mt-0.5" />
                  </AppCard>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Spond section ───────────────────────────────────────────────── */}
      <section className="px-4 pb-16">
        <div className="mx-auto w-full max-w-screen-sm">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={variants.staggerContainer}
          >
            <motion.div variants={heroItem}>
              <AppCard glow="accent" className="space-y-5 p-5">
                <div className="space-y-2">
                  <span className="inline-flex rounded-full border border-fp-accent/35 bg-fp-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-fp-accent">
                    {t("spond.badge")}
                  </span>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">
                    {t("spond.title")}
                  </h2>
                  <p className="text-sm text-muted-foreground">{t("spond.subtitle")}</p>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {spondBenefits.map((item) => (
                    <div key={item} className="rounded-xl border border-fp-border bg-fp-surface-2 p-3">
                      <p className="text-sm font-semibold text-foreground">{t(`spond.benefits.${item}.title`)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t(`spond.benefits.${item}.description`)}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {spondSteps.map((step) => (
                    <div key={step} className="rounded-xl border border-fp-border bg-background px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("spond.stepLabel", { number: step })}
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {t(`spond.steps.${step}`)}
                      </p>
                    </div>
                  ))}
                </div>
              </AppCard>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── CTA banner ───────────────────────────────────────────────────── */}
      <section className="px-4 pb-16">
        <div className="mx-auto w-full max-w-screen-sm">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={variants.fadeInUp}
          >
            <AppCard
              glow="primary"
              className="relative overflow-hidden text-center py-10 px-6"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-transparent to-fp-accent/5 rounded-2xl"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 border border-primary/20 rounded-2xl"
              />
              <div className="space-y-2 mb-6">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  {t("finalCta.title")}
                </h2>
                <p className="text-sm text-muted-foreground">{t("finalCta.subtitle")}</p>
              </div>
              <Link href="/match/setup">
                <FpButton variant="primary" size="lg" fullWidth className="group">
                  {t("finalCta.button")}
                  <ArrowRight
                    size={18}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </FpButton>
              </Link>
            </AppCard>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
