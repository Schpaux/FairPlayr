import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { Player } from "@/domain/team";
import { Button } from "@/components/ui/primitives";
import { buildDisplayNameMap } from "@/lib/utils/playerName";
import { cn } from "@/lib/utils";

/**
 * Attendance (DESIGN.md §7.1, UI-MS-01a revised by C1-F1): who is here today.
 * One 44px name chip per player, several per row, so the pitch follows soon
 * after. The name ladder runs over the whole team, because every player is
 * listed here; the pitch, like live, runs it over the squad only. Present is
 * an outlined chip with a lime check; absent is muted and says «Borte» in
 * words, so the state is never colour only. Each chip is a toggle
 * (`aria-pressed`); an absent chip is named «Ida, borte», so a screen reader
 * hears the state too (C1-F6). Names wrap rather than truncate.
 */

interface SquadSelectorProps {
  players: Player[];
  selectedIds: string[];
  onToggle: (playerId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  selectAllLabel: string;
  clearLabel: string;
  /** Id of the heading that names the grid. */
  labelledBy?: string;
}

export function SquadSelector({
  players,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearSelection,
  selectAllLabel,
  clearLabel,
  labelledBy,
}: SquadSelectorProps) {
  const t = useTranslations("matchSetup.squad");
  const names = useMemo(() => buildDisplayNameMap(players), [players]);
  const selected = new Set(selectedIds);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium tabular-nums text-fp-ink-2">
          {t("count", { selected: selected.size, total: players.length })}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onSelectAll}>
            {selectAllLabel}
          </Button>
          <Button size="sm" onClick={onClearSelection}>
            {clearLabel}
          </Button>
        </div>
      </div>

      <ul role="list" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
        {players.map((player) => {
          const isPresent = selected.has(player.id);
          const name = names.get(player.id) ?? player.name;
          return (
            <li key={player.id} className="max-w-full min-w-0">
              <button
                type="button"
                onClick={() => onToggle(player.id)}
                aria-pressed={isPresent}
                // C1-F6: the absent state is in the accessible name
                // («Ida, borte»), not only in the visible word.
                aria-label={isPresent ? undefined : t("absentName", { name })}
                className={cn(
                  "flex min-h-11 max-w-full items-center gap-2 rounded-full py-1.5 pr-4 pl-2 text-left",
                  "transition-[transform,background-color,box-shadow] duration-(--fp-d-quick) ease-fp-out active:scale-[0.97]",
                  isPresent
                    ? "bg-fp-surface shadow-[inset_0_0_0_1.5px_var(--fp-control-line)]"
                    : "bg-fp-surface-2 pl-4 shadow-[inset_0_0_0_1px_var(--fp-rule)]"
                )}
              >
                {isPresent ? (
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-fp-lime text-fp-on-lime"
                  >
                    <Check size={14} strokeWidth={3} />
                  </span>
                ) : null}
                <span
                  className={cn(
                    "min-w-0 text-sm leading-[17px] font-semibold [overflow-wrap:break-word]",
                    isPresent ? "text-fp-ink" : "text-fp-ink-2"
                  )}
                >
                  {name}
                  {isPresent ? null : (
                    <span aria-hidden className="font-medium">
                      {" · "}
                      {t("absent")}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
