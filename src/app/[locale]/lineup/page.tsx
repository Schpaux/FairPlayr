import { useTranslations } from "next-intl";
import { LayoutGrid } from "lucide-react";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function LineupPage() {
  const t = useTranslations("lineup");

  return (
    <PageShell>
      <SectionHeader title={t("title")} subtitle={t("subtitle")} />
      <EmptyState icon={LayoutGrid} title={t("empty")} />
    </PageShell>
  );
}
