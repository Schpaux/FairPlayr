"use client";

import { useTranslations } from "next-intl";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";

export function ActiveTeamSwitcher() {
  const t = useTranslations("teamSwitcher");
  const { teams, activeTeamId, isLoading, setActiveTeam } = useTeamWorkspace();

  if (isLoading) {
    return null;
  }

  if (teams.length === 0) {
    return null;
  }

  // C2-F2: with one team there is nothing to choose, so the header shows its
  // name as text, wrapping rather than cut; the picker appears from two teams.
  // At most two lines, so a long name stays inside the 56px header row next to
  // the 150px logo (BRAND-01); screen readers still get the whole name.
  if (teams.length === 1) {
    return (
      <p className="line-clamp-2 min-w-0 max-w-[10rem] text-right text-sm font-semibold leading-tight text-fp-ink [overflow-wrap:anywhere] sm:max-w-[14rem]">
        <span className="sr-only">{t("label")}: </span>
        {teams[0].name}
      </p>
    );
  }

  return (
    // The select itself is the 44px pill (DESIGN.md §4); 16px text, so iOS
    // does not zoom when it opens (UI-VIEWPORT-01).
    <label className="flex min-w-0 items-center">
      <span className="sr-only">{t("label")}</span>
      <select
        value={activeTeamId ?? ""}
        onChange={(event) => {
          const nextId = event.target.value;
          if (!nextId) {
            return;
          }

          void setActiveTeam(nextId);
        }}
        className="h-11 min-w-11 max-w-[7.5rem] rounded-full border border-fp-border bg-fp-surface-2 px-2.5 text-base font-medium text-foreground outline-none sm:max-w-[10rem]"
      >
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  );
}
