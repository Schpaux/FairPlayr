import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { Player } from "@/domain/team";
import { cn } from "@/lib/utils";

interface SquadSelectorProps {
  players: Player[];
  selectedIds: string[];
  onToggle: (playerId: string) => void;
}

export function SquadSelector({
  players,
  selectedIds,
  onToggle,
}: SquadSelectorProps) {
  const t = useTranslations("matchSetup.squad");
  const selectedCount = selectedIds.length;

  return (
    <div className="space-y-3">
      {/* Count indicator */}
      <p className="text-xs text-muted-foreground">
        {t("selectedCount", { selected: selectedCount, total: players.length })}
      </p>

      {/* Player list */}
      <div className="flex flex-col divide-y divide-fp-border">
        {players.map((player, index) => {
          const isSelected = selectedIds.includes(player.id);
          return (
            <button
              key={player.id}
              onClick={() => onToggle(player.id)}
              aria-pressed={isSelected}
              className={cn(
                "flex items-center justify-between gap-3 px-1 py-3 text-left transition-colors duration-100 tap-target",
                index === 0 && "pt-1",
                "hover:bg-fp-surface-2 rounded-lg -mx-1 px-2"
              )}
            >
              {/* Player name */}
              <span
                className={cn(
                  "text-sm font-medium transition-colors",
                  isSelected ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {player.name}
              </span>

              {/* Toggle indicator */}
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-medium transition-all duration-150",
                  isSelected
                    ? "border-fp-accent/40 bg-fp-accent/15 text-fp-accent"
                    : "border-fp-border bg-fp-surface-2 text-transparent"
                )}
              >
                <Check size={13} strokeWidth={2.5} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
