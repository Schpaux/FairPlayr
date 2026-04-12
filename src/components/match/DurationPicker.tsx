import { useTranslations } from "next-intl";
import {
  ALL_DURATION_PRESETS,
  MATCH_DURATION_PRESETS,
  type MatchDurationPresetId,
  type MatchDurationConfig,
} from "@/domain/match";
import { cn } from "@/lib/utils";

interface DurationPickerProps {
  value: MatchDurationConfig;
  onPresetChange: (presetId: MatchDurationPresetId) => void;
  onCustomChange: (minutes: number) => void;
  onHalvesChange: (halves: 1 | 2) => void;
}

export function DurationPicker({
  value,
  onPresetChange,
  onCustomChange,
  onHalvesChange,
}: DurationPickerProps) {
  const t = useTranslations("matchSetup.duration");
  const currentHalves = value.halves as 1 | 2;

  return (
    <div className="space-y-3">
      {/* Halves selector comes first so users pick mode before duration */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("halvesTitle")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={cn(
              "h-9 rounded-xl border px-3 text-xs font-semibold tap-target",
              currentHalves === 2
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-fp-border bg-background text-muted-foreground"
            )}
            onClick={() => onHalvesChange(2)}
          >
            {t("halvesOn")}
          </button>
          <button
            type="button"
            className={cn(
              "h-9 rounded-xl border px-3 text-xs font-semibold tap-target",
              currentHalves === 1
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-fp-border bg-background text-muted-foreground"
            )}
            onClick={() => onHalvesChange(1)}
          >
            {t("halvesOff")}
          </button>
        </div>
      </div>

      {/* Preset buttons — labels update dynamically based on halves selection */}
      <div className="flex flex-wrap gap-2">
        {ALL_DURATION_PRESETS.map((presetId) => {
          const preset = MATCH_DURATION_PRESETS[presetId];
          const isSelected = value.mode === "preset" && value.presetId === presetId;
          // Show "1x20" when 1 half, "2x10" when 2 halves
          const minutesLabel =
            currentHalves === 1 ? preset.totalMinutes : preset.minutesPerHalf;

          return (
            <button
              key={presetId}
              onClick={() => onPresetChange(presetId)}
              aria-pressed={isSelected}
              className={cn(
                "h-10 min-w-[68px] rounded-xl border px-3 text-sm font-medium transition-all duration-150 tap-target",
                isSelected
                  ? "border-primary/30 bg-primary/10 text-primary glow-primary-sm"
                  : "border-fp-border bg-fp-surface-2 text-muted-foreground hover:border-primary/20 hover:text-foreground"
              )}
            >
              {t("presetLabel", {
                halves: currentHalves,
                minutes: minutesLabel,
              })}
            </button>
          );
        })}
      </div>

      <div className="space-y-2 rounded-xl border border-fp-border bg-fp-surface-2 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("customTitle")}
        </p>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min={5}
            max={240}
            step={1}
            value={value.totalMinutes}
            onChange={(event) => {
              const next = Number(event.target.value);

              if (Number.isNaN(next)) {
                return;
              }

              onCustomChange(next);
            }}
            className="h-10 w-24 rounded-lg border border-fp-border bg-background px-3 text-sm text-foreground"
          />

          <span className="text-sm text-muted-foreground">{t("customSuffix")}</span>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("totalLabel", { minutes: value.totalMinutes })}
        </p>
      </div>
    </div>
  );
}
