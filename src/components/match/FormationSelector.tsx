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
              "min-h-11 rounded-full border px-4 text-base font-semibold tap-target",
              "transition-[transform,background-color,border-color,color] duration-(--fp-d-quick) ease-fp-out active:scale-[0.97]",
              isSelected
                ? "border-fp-lime bg-fp-lime text-fp-on-lime"
                : "border-fp-control-line bg-fp-surface text-fp-ink"
            )}
          >
            {t("presetLabel", { shape: formation.shape })}
          </button>
        );
      })}
    </div>
  );
}
