import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ALL_DURATION_PRESETS,
  MATCH_DURATION_PRESETS,
  getCustomPeriodBounds,
  type MatchDurationPresetId,
  type MatchDurationConfig,
} from "@/domain/match";
import { cn } from "@/lib/utils";
import { SelectedLabel } from "@/components/match/SelectedLabel";

interface DurationPickerProps {
  value: MatchDurationConfig;
  onPresetChange: (presetId: MatchDurationPresetId) => void;
  /** A valid custom length: minutes per half with two halves, else in total. */
  onCustomChange: (halves: 1 | 2, minutesPerPeriod: number) => void;
  onHalvesChange: (halves: 1 | 2) => void;
}

/** A whole number in range, or null for anything else (empty, "1e2", "18.5"). */
function parseMinutes(text: string, bounds: { min: number; max: number }): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const minutes = Number(text.trim());
  return minutes >= bounds.min && minutes <= bounds.max ? minutes : null;
}

/**
 * Halves, presets and a custom length (DESIGN.md §7.1, UI-DURATION-01).
 *
 * The custom field holds exactly what the coach types. Only a whole number in
 * range is applied; anything else shows an inline error and is not applied,
 * so clearing the field or typing "1" on the way to "18" never rewrites it.
 * Leaving the field shows the applied value again.
 */

export function DurationPicker({
  value,
  onPresetChange,
  onCustomChange,
  onHalvesChange,
}: DurationPickerProps) {
  const t = useTranslations("matchSetup.duration");
  const uid = useId();
  const currentHalves = value.halves as 1 | 2;
  const bounds = getCustomPeriodBounds(currentHalves);
  const appliedPerPeriod = currentHalves === 2 ? value.minutesPerHalf : value.totalMinutes;
  // What the coach is typing; null shows the applied value.
  const [draft, setDraft] = useState<string | null>(null);
  const showError = draft !== null && parseMinutes(draft, bounds) === null;

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
              "min-h-11 rounded-full border px-6 text-base font-semibold tap-target transition-[transform,background-color,border-color,color] duration-(--fp-d-quick) ease-fp-out active:scale-[0.97]",
              currentHalves === 2
                ? "border-fp-lime bg-fp-lime text-fp-on-lime"
                : "border-fp-control-line bg-fp-surface text-fp-ink"
            )}
            aria-pressed={currentHalves === 2}
            onClick={() => {
              setDraft(null);
              onHalvesChange(2);
            }}
          >
            <SelectedLabel selected={currentHalves === 2}>{t("halvesOn")}</SelectedLabel>
          </button>
          <button
            type="button"
            className={cn(
              "min-h-11 rounded-full border px-6 text-base font-semibold tap-target transition-[transform,background-color,border-color,color] duration-(--fp-d-quick) ease-fp-out active:scale-[0.97]",
              currentHalves === 1
                ? "border-fp-lime bg-fp-lime text-fp-on-lime"
                : "border-fp-control-line bg-fp-surface text-fp-ink"
            )}
            aria-pressed={currentHalves === 1}
            onClick={() => {
              setDraft(null);
              onHalvesChange(1);
            }}
          >
            <SelectedLabel selected={currentHalves === 1}>{t("halvesOff")}</SelectedLabel>
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
              onClick={() => {
                // A tap does not always blur the field (iOS), so drop the draft.
                setDraft(null);
                onPresetChange(presetId);
              }}
              aria-pressed={isSelected}
              className={cn(
                "min-h-11 min-w-[72px] rounded-full border px-6 text-base font-semibold tap-target transition-[transform,background-color,border-color,color] duration-(--fp-d-quick) ease-fp-out active:scale-[0.97]",
                isSelected
                  ? "border-fp-lime bg-fp-lime text-fp-on-lime"
                  : "border-fp-control-line bg-fp-surface text-fp-ink"
              )}
            >
              <SelectedLabel selected={isSelected}>
                {t("presetLabel", {
                  halves: currentHalves,
                  minutes: minutesLabel,
                })}
              </SelectedLabel>
            </button>
          );
        })}
      </div>

      {/* Custom duration: per half with two halves ("2 × 18" is 18). */}
      <div className="space-y-2 rounded-[14px] border border-fp-rule bg-fp-surface p-4">
        <label
          htmlFor={`${uid}-custom`}
          className="block text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2"
        >
          {currentHalves === 2 ? t("customPerHalf") : t("customTotal")}
        </label>
        <div className="flex items-center gap-3">
          <input
            id={`${uid}-custom`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            enterKeyHint="done"
            aria-invalid={showError || undefined}
            aria-describedby={showError ? `${uid}-error` : `${uid}-total`}
            value={draft ?? String(appliedPerPeriod)}
            onChange={(event) => {
              const text = event.target.value;
              setDraft(text);
              const minutes = parseMinutes(text, bounds);
              if (minutes !== null && !(value.mode === "custom" && minutes === appliedPerPeriod)) {
                onCustomChange(currentHalves, minutes);
              }
            }}
            onBlur={() => setDraft(null)}
            className={cn(
              "h-12 w-24 rounded-[10px] border bg-fp-surface px-4 text-base font-medium tabular-nums text-fp-ink transition-colors",
              showError ? "border-fp-danger-text" : "border-fp-rule"
            )}
          />
          <span className="text-base text-fp-ink-2" aria-hidden>
            {t("customSuffix")}
          </span>
        </div>
        {/* One status line, always mounted: the error is announced as it
            appears, and leaving an invalid entry announces the length kept. */}
        <p
          id={showError ? `${uid}-error` : `${uid}-total`}
          role="status"
          className={cn("text-sm", showError ? "font-medium text-fp-danger-text" : "text-fp-ink-2")}
        >
          {showError
            ? t("customError", bounds)
            : currentHalves === 2
              ? t("totalHalves", { minutes: value.totalMinutes, perHalf: value.minutesPerHalf })
              : t("totalLabel", { minutes: value.totalMinutes })}
        </p>
      </div>
    </div>
  );
}
