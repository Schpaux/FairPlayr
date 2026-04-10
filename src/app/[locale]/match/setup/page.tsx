import { useTranslations } from "next-intl";
import { Settings2 } from "lucide-react";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function MatchSetupPage() {
  const t = useTranslations("matchSetup");

  return (
    <PageShell>
      <SectionHeader title={t("title")} subtitle={t("subtitle")} />
      <EmptyState icon={Settings2} title={t("empty")} />
    </PageShell>
  );
}
