import { useTranslations } from "next-intl";
import { FORMAT_DURATION_PRESETS } from "@/domain/match";
import type { MatchFormat } from "@/domain/match";
import { cn } from "@/lib/utils";

interface DurationPickerProps {
  format: MatchFormat;
  value: number;
  onChange: (minutes: number) => void;
}

export function DurationPicker({ format, value, onChange }: DurationPickerProps) {
  const t = useTranslations("matchSetup.duration");
  const presets = FORMAT_DURATION_PRESETS[format];

  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((minutes) => {
        const isSelected = value === minutes;
        return (
          <button
            key={minutes}
            onClick={() => onChange(minutes)}
            aria-pressed={isSelected}
            className={cn(
              "h-10 min-w-[64px] rounded-xl border px-4 text-sm font-medium transition-all duration-150 tap-target",
              isSelected
                ? "border-primary/30 bg-primary/10 text-primary glow-primary-sm"
                : "border-fp-border bg-fp-surface-2 text-muted-foreground hover:border-primary/20 hover:text-foreground"
            )}
          >
            {t("presetLabel", { minutes })}
          </button>
        );
      })}
    </div>
  );
}
