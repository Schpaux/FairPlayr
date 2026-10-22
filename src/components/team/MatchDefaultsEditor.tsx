"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ALL_DURATION_PRESETS,
  MATCH_DURATION_PRESETS,
  FORMAT_DEFAULT_DURATION_PRESET,
  getFormationPresets,
} from "@/domain/match";
import type { MatchFormat, MatchDurationPresetId } from "@/domain/match";
import {
  getTeamMatchPrefs,
  saveTeamMatchPrefs,
} from "@/lib/storage/teamPrefsStorage";
import type { TeamMatchPrefs } from "@/lib/storage/teamPrefsStorage";
import { FormatSelector } from "@/components/match/FormatSelector";
import { FormationSelector } from "@/components/match/FormationSelector";
import { SelectedLabel } from "@/components/match/SelectedLabel";
import { cn } from "@/lib/utils";

interface Props {
  teamId: string;
}

export function MatchDefaultsEditor({ teamId }: Props) {
  const t = useTranslations("team.matchDefaults");

  const [prefs, setPrefs] = useState<TeamMatchPrefs>(() =>
    getTeamMatchPrefs(teamId)
  );

  const format: MatchFormat = prefs.format ?? "5v5";
  const formations = getFormationPresets(format);
  const formationId =
    prefs.formationId && formations.some((f) => f.id === prefs.formationId)
      ? prefs.formationId
      : formations[0].id;
  const durationPresetId: MatchDurationPresetId =
    prefs.durationPresetId ?? FORMAT_DEFAULT_DURATION_PRESET[format];

  const handleFormatChange = (newFormat: MatchFormat) => {
    const newFormations = getFormationPresets(newFormat);
    const next: TeamMatchPrefs = {
      format: newFormat,
      formationId: newFormations[0].id,
      durationPresetId: FORMAT_DEFAULT_DURATION_PRESET[newFormat],
    };
    setPrefs(next);
    saveTeamMatchPrefs(teamId, next);
  };

  const handleFormationChange = (newFormationId: string) => {
    const next: TeamMatchPrefs = { ...prefs, formationId: newFormationId };
    setPrefs(next);
    saveTeamMatchPrefs(teamId, next);
  };

  const handleDurationChange = (newPresetId: MatchDurationPresetId) => {
    const next: TeamMatchPrefs = { ...prefs, durationPresetId: newPresetId };
    setPrefs(next);
    saveTeamMatchPrefs(teamId, next);
  };

  return (
    <div className="space-y-4">
      {/* 13px is the type floor (DESIGN.md §3, C3-F3): Label for the
          kicker, Meta for the hint, 14px for the field labels. */}
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2">
          {t("title")}
        </p>
        <p className="mt-0.5 text-sm text-fp-ink-2">{t("hint")}</p>
      </div>

      {/* Format */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-fp-ink">{t("format")}</p>
        <FormatSelector value={format} onChange={handleFormatChange} />
      </div>

      {/* Formation */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-fp-ink">{t("formation")}</p>
        <FormationSelector
          formations={formations}
          value={formationId}
          onChange={handleFormationChange}
        />
      </div>

      {/* Duration */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-fp-ink">{t("duration")}</p>
        <div className="flex flex-wrap gap-2">
          {ALL_DURATION_PRESETS.map((presetId) => {
            const preset = MATCH_DURATION_PRESETS[presetId];
            const isSelected = durationPresetId === presetId;
            return (
              <button
                key={presetId}
                type="button"
                onClick={() => handleDurationChange(presetId)}
                aria-pressed={isSelected}
                className={cn(
                  // px-6 leaves room for the check in both states (C1-F3).
                  "h-10 rounded-xl border px-6 text-sm font-medium transition duration-150 tap-target",
                  isSelected
                    ? "border-fp-lime bg-fp-lime text-fp-on-lime"
                    : "border-fp-border bg-fp-surface-2 text-muted-foreground hover:text-foreground"
                )}
              >
                <SelectedLabel selected={isSelected}>
                  {presetId}{" "}
                  <span className="text-[13px]">
                    {t("durationTotal", { minutes: preset.totalMinutes })}
                  </span>
                </SelectedLabel>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
