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
              "h-10 rounded-xl border px-4 text-sm font-semibold transition duration-150 tap-target",
              isSelected
                ? "border-fp-lime bg-fp-lime text-fp-on-lime"
                : "border-fp-border bg-fp-surface-2 text-muted-foreground hover:text-foreground"
            )}
          >
            {t("presetLabel", { shape: formation.shape })}
          </button>
        );
      })}
    </div>
  );
}
