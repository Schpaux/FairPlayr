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
