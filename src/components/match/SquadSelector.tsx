import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { Player } from "@/domain/team";
import { Button } from "@/components/ui/primitives";
import { discLabel, hasShirtNumber } from "@/components/live/liveScreenModel";
import { buildDisplayNameMap } from "@/lib/utils/playerName";
import { cn } from "@/lib/utils";

/**
 * Attendance grid (UI-MS-01a, DESIGN.md §7): who is here today. One tile per
 * player with the shirt disc above the name (14px, full tile width so names
 * are not cut). The name ladder runs over the whole team, because every player
 * is listed here; the pitch, like live, runs it over the squad only. Present is a club disc with a lime check; absent is muted and says
 * «Borte» in words, so the state is never colour only. Each tile is a toggle
 * (`aria-pressed`) at least 44px tall; an absent tile is named «Ida, borte»,
 * so a screen reader hears the state too (C1-F6).
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

      <ul
        role="list"
        aria-labelledby={labelledBy}
        className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2"
      >
        {players.map((player) => {
          const isPresent = selected.has(player.id);
          const name = names.get(player.id) ?? player.name;
          return (
            <li key={player.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onToggle(player.id)}
                aria-pressed={isPresent}
                // C1-F6: the absent state is in the accessible name
                // («Ida, borte»), not only in the visible word.
                aria-label={isPresent ? undefined : t("absentName", { name })}
                className={cn(
                  "flex h-full min-h-12 w-full flex-col items-center gap-1 rounded-[10px] px-1.5 py-2 text-center",
                  "transition-[transform,background-color,box-shadow] duration-(--fp-d-quick) ease-fp-out active:scale-[0.97]",
                  isPresent
                    ? "bg-fp-surface shadow-[inset_0_0_0_1.5px_var(--fp-control-line)]"
                    : "bg-fp-surface-2 shadow-[inset_0_0_0_1px_var(--fp-rule)]"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "relative flex size-8 shrink-0 items-center justify-center rounded-full leading-none",
                    hasShirtNumber(player) ? "font-num text-[17px]" : "text-[13px] font-semibold",
                    isPresent
                      ? "bg-fp-club-disc text-fp-on-club"
                      : "bg-fp-surface-3 text-fp-ink-2"
                  )}
                >
                  {discLabel(player)}
                  {isPresent ? (
                    <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-fp-lime text-fp-on-lime">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  ) : null}
                </span>
                <span className="flex w-full min-w-0 flex-col items-center">
                  <span
                    className={cn(
                      "break-words text-sm leading-[17px] font-semibold",
                      isPresent ? "text-fp-ink" : "text-fp-ink-2"
                    )}
                  >
                    {name}
                  </span>
                  {isPresent ? null : (
                    <span aria-hidden className="text-[13px] leading-4 font-medium text-fp-ink-2">
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
