import { useTranslations } from "next-intl";
import { Play } from "lucide-react";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function MatchLivePage() {
  const t = useTranslations("matchLive");

  return (
    <PageShell>
      <SectionHeader title={t("title")} subtitle={t("subtitle")} />
      <EmptyState icon={Play} title={t("empty")} />
    </PageShell>
  );
}
