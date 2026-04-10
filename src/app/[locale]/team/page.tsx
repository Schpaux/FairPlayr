import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FpButton } from "@/components/ui/FpButton";

export default function TeamPage() {
  const t = useTranslations("team");

  return (
    <PageShell>
      <SectionHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <FpButton variant="primary" size="sm">
            {t("addPlayer")}
          </FpButton>
        }
      />
      <EmptyState
        icon={Users}
        title={t("empty")}
        action={
          <FpButton variant="secondary" size="sm">
            {t("addPlayer")}
          </FpButton>
        }
      />
    </PageShell>
  );
}
