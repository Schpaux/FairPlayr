import { useTranslations } from "next-intl";
import { ALL_FORMATS, FORMAT_FIELD_COUNT } from "@/domain/match";
import type { MatchFormat } from "@/domain/match";
import { cn } from "@/lib/utils";
import { SelectedLabel } from "@/components/match/SelectedLabel";

interface FormatSelectorProps {
  value: MatchFormat;
  onChange: (format: MatchFormat) => void;
  i18nNamespace?: "matchSetup.format" | "lineup.format";
}

export function FormatSelector({
  value,
  onChange,
  i18nNamespace = "matchSetup.format",
}: FormatSelectorProps) {
  const t = useTranslations(i18nNamespace);

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {ALL_FORMATS.map((format) => {
        const isSelected = format === value;
        const fieldCount = FORMAT_FIELD_COUNT[format];

        return (
          <button
            key={format}
            type="button"
            onClick={() => onChange(format)}
            aria-pressed={isSelected}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[10px] border px-2 py-2 text-center tap-target",
              "transition-[transform,background-color,border-color,color] duration-(--fp-d-quick) ease-fp-out active:scale-[0.97]",
              isSelected
                ? "border-fp-lime bg-fp-lime text-fp-on-lime"
                : "border-fp-control-line bg-fp-surface text-fp-ink"
            )}
          >
            {/* Check left of the label (C1-F3); the tile keeps its size. */}
            <SelectedLabel
              selected={isSelected}
              className="text-base font-bold leading-none tracking-tight"
            >
              {format}
            </SelectedLabel>
            {/* 13px is the type floor (DESIGN.md §3). */}
            <span className={cn("text-[13px] font-medium leading-none", !isSelected && "text-fp-ink-2")}>
              {t("fieldCount", { count: fieldCount })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
