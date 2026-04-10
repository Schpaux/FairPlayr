"use client";

import { useTranslations } from "next-intl";
import type { FormationPreset } from "@/domain/match";
import { cn } from "@/lib/utils";

interface FormationSelectorProps {
  formations: FormationPreset[];
  value: string;
  onChange: (formationId: string) => void;
}

export function FormationSelector({
  formations,
  value,
  onChange,
}: FormationSelectorProps) {
  const t = useTranslations("matchSetup.formation");

  return (
    <div className="flex flex-wrap gap-2">
      {formations.map((formation) => {
        const isSelected = value === formation.id;

        return (
          <button
            key={formation.id}
            type="button"
            onClick={() => onChange(formation.id)}
            aria-pressed={isSelected}
            className={cn(
              "h-10 rounded-xl border px-3 text-sm font-medium transition-all duration-150 tap-target",
              isSelected
                ? "border-primary/30 bg-primary/10 text-primary glow-primary-sm"
                : "border-fp-border bg-fp-surface-2 text-muted-foreground hover:border-primary/20 hover:text-foreground"
            )}
          >
            {t("presetLabel", { shape: formation.shape })}
          </button>
        );
      })}
    </div>
  );
}
