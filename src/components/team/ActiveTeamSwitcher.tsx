"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useTeamWorkspace } from "@/components/providers/TeamWorkspaceProvider";

export function ActiveTeamSwitcher() {
  const t = useTranslations("teamSwitcher");
  const { teams, activeTeamId, isLoading, setActiveTeam } = useTeamWorkspace();

  if (isLoading) {
    return null;
  }

  if (teams.length === 0) {
    return (
      <Link
        href="/team"
        className="tap-target rounded-lg border border-fp-border bg-fp-surface-2 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {t("create")}
      </Link>
    );
  }

  return (
    <label className="flex items-center gap-2 rounded-lg border border-fp-border bg-fp-surface-2 px-2 py-1">
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
        className="h-7 max-w-[9.5rem] bg-transparent text-xs font-medium text-foreground outline-none"
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
