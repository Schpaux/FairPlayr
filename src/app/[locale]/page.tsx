"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  Link2,
  Check,
  Users,
  Zap,
  Clock,
  FileText,
} from "lucide-react";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { variants, transitions } from "@/lib/tokens";

/* ─── Animation variants ─────────────────────────────────────────────────── */
const heroItem = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: transitions.slow },
};

const valueProps = ["format", "realtime", "fair"] as const;
const howItWorksSteps = [1, 2, 3, 4] as const;
const spondBenefitKeys = ["benefit1", "benefit2", "benefit3"] as const;
const featureBulletKeys = ["point1", "point2"] as const;

export default function HomePage() {
  const t = useTranslations("home");

  return (
    <div className="relative overflow-hidden">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[calc(100svh-4rem)] flex flex-col justify-center px-4 pt-8 pb-16">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4 h-[500px] w-[500px] rounded-full bg-fp-accent/15 blur-[120px]" />
        </div>

        <div className="mx-auto w-full max-w-screen-sm">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={variants.staggerContainer}
            className="flex flex-col items-center text-center gap-6"
          >
            <motion.div variants={heroItem}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-fp-accent/35 bg-fp-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-fp-accent">
                <Link2 size={12} />
                {t("hero.spondBadge")}
              </span>
            </motion.div>

            <motion.div variants={heroItem} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("hero.eyebrow")}
              </p>
              <h1 className="heading-display text-[3rem] text-foreground sm:text-[4rem]">
                {t("hero.headline")}
              </h1>
            </motion.div>

            <motion.p
              variants={heroItem}
              className="max-w-sm text-base text-muted-foreground leading-relaxed"
            >
              {t("hero.subtitle")}
            </motion.p>

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

      {/* ── Features bento ──────────────────────────────────────────────── */}
      <section className="px-4 pb-16">
        <div className="mx-auto w-full max-w-screen-sm">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            variants={variants.staggerContainer}
          >
            <div className="grid grid-cols-2 gap-3">
              {/* Card 1: Styr laget ditt */}
              <motion.div variants={heroItem}>
                <AppCard glow="primary" className="p-4 h-full flex flex-col gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-fp-accent/10">
                    <Users size={18} className="text-fp-accent" />
                  </div>
                  <div>
                    <h3 className="font-display font-black text-sm tracking-tight text-foreground">
                      {t("features.items.teamControl.title")}
                    </h3>
                    <ul className="mt-2 space-y-1.5">
                      {featureBulletKeys.map((k) => (
                        <li key={k} className="flex items-start gap-1.5">
                          <span className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full bg-fp-accent/20 ring-1 ring-fp-accent/30" />
                          <span className="text-[11px] leading-tight text-muted-foreground">
                            {t(`features.items.teamControl.${k}`)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </AppCard>
              </motion.div>

              {/* Card 2: Full kontroll live */}
              <motion.div variants={heroItem}>
                <AppCard className="p-4 h-full flex flex-col gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-fp-surface-2">
                    <Zap size={18} className="text-foreground" />
                  </div>
                  <div>
                    <h3 className="font-display font-black text-sm tracking-tight text-foreground">
                      {t("features.items.liveControl.title")}
                    </h3>
                    <ul className="mt-2 space-y-1.5">
                      {featureBulletKeys.map((k) => (
                        <li key={k} className="flex items-start gap-1.5">
                          <span className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full bg-fp-surface-3" />
                          <span className="text-[11px] leading-tight text-muted-foreground">
                            {t(`features.items.liveControl.${k}`)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </AppCard>
              </motion.div>

              {/* Card 3: Rettferdig spilletid — full width */}
              <motion.div variants={heroItem} className="col-span-2">
                <AppCard glow="accent" className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fp-accent/10">
                      <Clock size={20} className="text-fp-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-black text-base tracking-tight text-foreground">
                        {t("features.items.fairPlaytime.title")}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                        {featureBulletKeys.map((k) => (
                          <span key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Check size={12} className="shrink-0 text-fp-accent" />
                            {t(`features.items.fairPlaytime.${k}`)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </AppCard>
              </motion.div>

              {/* Card 4: Automatisk kampoppsummering — full width */}
              <motion.div variants={heroItem} className="col-span-2">
                <AppCard className="p-4 bg-fp-surface-2">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fp-surface-3">
                      <FileText size={20} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-black text-base tracking-tight text-foreground">
                        {t("features.items.autoReport.title")}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                        {featureBulletKeys.map((k) => (
                          <span key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Check size={12} className="shrink-0 text-muted-foreground/50" />
                            {t(`features.items.autoReport.${k}`)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </AppCard>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="px-4 pb-16">
        <div className="mx-auto w-full max-w-screen-sm">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={variants.staggerContainer}
          >
            <motion.h2
              variants={heroItem}
              className="font-display text-2xl font-black tracking-tight text-foreground mb-6"
            >
              {t("howItWorks.title")}
            </motion.h2>

            <div>
              {howItWorksSteps.map((step, idx) => (
                <motion.div key={step} variants={heroItem} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fp-accent text-[13px] font-black text-background">
                      {step}
                    </div>
                    {idx < howItWorksSteps.length - 1 && (
                      <div className="w-px flex-1 bg-fp-border min-h-[1.5rem] my-1" />
                    )}
                  </div>
                  <p
                    className={`text-sm font-semibold text-foreground pt-1 ${
                      idx < howItWorksSteps.length - 1 ? "pb-6" : "pb-0"
                    }`}
                  >
                    {t(`howItWorks.steps.${step}`)}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Spond ────────────────────────────────────────────────────────── */}
      <section className="px-4 pb-16">
        <div className="mx-auto w-full max-w-screen-sm">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={variants.staggerContainer}
          >
            <motion.div variants={heroItem}>
              <AppCard glow="accent" className="p-5 space-y-4">
                <div className="space-y-2">
                  <span className="inline-flex rounded-full border border-fp-accent/35 bg-fp-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-fp-accent">
                    {t("spond.badge")}
                  </span>
                  <h2 className="font-display text-2xl font-black tracking-tight text-foreground">
                    {t("spond.title")}
                  </h2>
                </div>

                <ul className="space-y-3">
                  {spondBenefitKeys.map((key) => (
                    <li key={key} className="flex items-center gap-3">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fp-accent/15">
                        <Check size={12} className="text-fp-accent" />
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {t(`spond.${key}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </AppCard>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Trust quote ──────────────────────────────────────────────────── */}
      <section className="px-4 pb-16">
        <div className="mx-auto w-full max-w-screen-sm">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={variants.fadeInUp}
          >
            <div className="text-center px-4">
              <p className="font-display text-xl font-black tracking-tight text-foreground/75">
                &ldquo;{t("trust.quote")}&rdquo;
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="px-4 pb-16">
        <div className="mx-auto w-full max-w-screen-sm">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={variants.fadeInUp}
          >
            <AppCard glow="primary" className="text-center py-10 px-6 bg-fp-accent/6">
              <div className="space-y-2 mb-6">
                <h2 className="font-display text-3xl font-black tracking-tight text-foreground">
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
