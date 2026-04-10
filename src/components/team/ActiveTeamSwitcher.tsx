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
    <label className="flex min-w-0 items-center gap-1 rounded-full border border-fp-border bg-fp-surface-2 px-2 py-1">
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
        className="h-7 max-w-[7.5rem] bg-transparent pr-1 text-xs font-medium text-foreground outline-none sm:max-w-[10rem]"
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
