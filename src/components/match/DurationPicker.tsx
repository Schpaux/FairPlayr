import { useId } from "react";
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
  const uid = useId();
  const currentHalves = value.halves as 1 | 2;

  return (
    <div className="space-y-4">
      {/* Halves selector */}
      <div className="space-y-2">
        <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2">
          {t("halvesTitle")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={cn(
              "min-h-11 rounded-full border px-3 text-base font-semibold tap-target transition-[transform,background-color,border-color,color] duration-(--fp-d-quick) ease-fp-out active:scale-[0.97]",
              currentHalves === 2
                ? "border-fp-lime bg-fp-lime text-fp-on-lime"
                : "border-fp-control-line bg-fp-surface text-fp-ink"
            )}
            aria-pressed={currentHalves === 2}
            onClick={() => onHalvesChange(2)}
          >
            {t("halvesOn")}
          </button>
          <button
            type="button"
            className={cn(
              "min-h-11 rounded-full border px-3 text-base font-semibold tap-target transition-[transform,background-color,border-color,color] duration-(--fp-d-quick) ease-fp-out active:scale-[0.97]",
              currentHalves === 1
                ? "border-fp-lime bg-fp-lime text-fp-on-lime"
                : "border-fp-control-line bg-fp-surface text-fp-ink"
            )}
            aria-pressed={currentHalves === 1}
            onClick={() => onHalvesChange(1)}
          >
            {t("halvesOff")}
          </button>
        </div>
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {ALL_DURATION_PRESETS.map((presetId) => {
          const preset = MATCH_DURATION_PRESETS[presetId];
          const isSelected = value.mode === "preset" && value.presetId === presetId;
          const minutesLabel =
            currentHalves === 1 ? preset.totalMinutes : preset.minutesPerHalf;

          return (
            <button
              key={presetId}
              onClick={() => onPresetChange(presetId)}
              aria-pressed={isSelected}
              className={cn(
                "min-h-11 min-w-[72px] rounded-full border px-3 text-base font-semibold tap-target transition-[transform,background-color,border-color,color] duration-(--fp-d-quick) ease-fp-out active:scale-[0.97]",
                isSelected
                  ? "border-fp-lime bg-fp-lime text-fp-on-lime"
                  : "border-fp-control-line bg-fp-surface text-fp-ink"
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

      {/* Custom duration */}
      <div className="space-y-2 rounded-[14px] border border-fp-rule bg-fp-surface p-4">
        <p id={`${uid}-custom`} className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2">
          {t("customTitle")}
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={5}
            max={240}
            step={1}
            aria-labelledby={`${uid}-custom`}
            aria-describedby={`${uid}-suffix`}
            value={value.totalMinutes}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isNaN(next)) return;
              onCustomChange(next);
            }}
            className="h-12 w-28 rounded-[10px] border border-fp-rule bg-fp-surface px-4 text-base font-medium tabular-nums text-fp-ink transition-colors"
          />
          <span id={`${uid}-suffix`} className="text-sm text-fp-ink-2">{t("customSuffix")}</span>
        </div>
        <p className="text-sm text-fp-ink-2">
          {t("totalLabel", { minutes: value.totalMinutes })}
        </p>
      </div>
    </div>
  );
}
