import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { Player } from "@/domain/team";
import { FpButton } from "@/components/ui/FpButton";
import { cn } from "@/lib/utils";

interface SquadSelectorProps {
  players: Player[];
  selectedIds: string[];
  onToggle: (playerId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  selectAllLabel: string;
  clearLabel: string;
}

export function SquadSelector({
  players,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearSelection,
  selectAllLabel,
  clearLabel,
}: SquadSelectorProps) {
  const t = useTranslations("matchSetup.squad");
  const selectedCount = selectedIds.length;

  return (
    <div className="space-y-3">
      {/* Count indicator */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t("selectedCount", { selected: selectedCount, total: players.length })}
        </p>
        <div className="flex items-center gap-1">
          <FpButton
            type="button"
            variant="ghost"
            size="sm"
            className="tap-target"
            onClick={onSelectAll}
          >
            {selectAllLabel}
          </FpButton>
          <FpButton
            type="button"
            variant="ghost"
            size="sm"
            className="tap-target"
            onClick={onClearSelection}
          >
            {clearLabel}
          </FpButton>
        </div>
      </div>

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
                "flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left transition-all duration-100 tap-target -mx-1",
                index === 0 && "pt-2",
                isSelected
                  ? "bg-fp-cta/8"
                  : "hover:bg-fp-surface-2"
              )}
            >
              {/* Player name */}
              <span
                className={cn(
                  "text-sm font-medium transition-colors",
                  isSelected ? "text-fp-cta font-semibold" : "text-muted-foreground"
                )}
              >
                {player.name}
              </span>

              {/* Toggle indicator */}
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs font-medium transition-all duration-150",
                  isSelected
                    ? "border-fp-cta/50 bg-fp-cta/15 text-fp-cta scale-110"
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
