import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Player } from "@/domain/team";
import type { MatchSetup } from "@/domain/match";
import { getRequiredStarters, getBenchPlayerIds } from "@/domain/match";
import { cn } from "@/lib/utils";

interface LineupAssignerProps {
  setup: MatchSetup;
  players: Player[];
  onPromote: (playerId: string) => void;
  onDemote: (playerId: string) => void;
}

export function LineupAssigner({
  setup,
  players,
  onPromote,
  onDemote,
}: LineupAssignerProps) {
  const t = useTranslations("matchSetup.lineup");
  const required = getRequiredStarters(setup);
  const currentStarters = setup.startingPlayerIds.length;
  const isStartingFull = currentStarters >= required;
  const benchIds = getBenchPlayerIds(setup);

  // Build lookup for fast name resolution
  const playerMap = new Map(players.map((p) => [p.id, p]));

  return (
    <div className="space-y-4">
      {/* ── Starting section ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("starting")}
          </span>
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              currentStarters === required
                ? "text-fp-accent"
                : "text-muted-foreground"
            )}
          >
            {t("starterSlots", { current: currentStarters, required })}
          </span>
        </div>

        {/* Starter rows */}
        <div className="flex flex-col divide-y divide-fp-border rounded-2xl border border-fp-border overflow-hidden">
          {setup.startingPlayerIds.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground italic">
              {t("noStartersYet")}
            </p>
          ) : (
            setup.startingPlayerIds.map((id) => {
              const player = playerMap.get(id);
              if (!player) return null;
              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-3 px-4 py-3 bg-primary/5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                      S
                    </span>
                    <span className="text-sm font-medium text-foreground truncate">
                      {player.name}
                    </span>
                  </div>
                  <button
                    onClick={() => onDemote(id)}
                    aria-label={t("demoteLabel")}
                    className="flex h-8 min-w-[64px] items-center justify-center gap-1 rounded-lg border border-fp-border bg-fp-surface-2 px-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors tap-target"
                  >
                    <ArrowDown size={12} />
                    {t("demoteLabel")}
                  </button>
                </div>
              );
            })
          )}

          {/* Empty starter slots */}
          {Array.from({ length: required - currentStarters }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-2.5 px-4 py-3 opacity-40"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground text-[10px] text-muted-foreground">
                {currentStarters + i + 1}
              </span>
              <span className="text-xs text-muted-foreground italic">
                {t("emptySlot")}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bench section ────────────────────────────────────────────── */}
      {benchIds.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("bench")}
            </span>
            {isStartingFull && (
              <span className="text-[10px] text-muted-foreground">
                {t("startingFull")}
              </span>
            )}
          </div>

          <div className="flex flex-col divide-y divide-fp-border rounded-2xl border border-fp-border overflow-hidden">
            {benchIds.map((id) => {
              const player = playerMap.get(id);
              if (!player) return null;
              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fp-surface-2 text-[10px] font-bold text-muted-foreground">
                      B
                    </span>
                    <span className="text-sm font-medium text-muted-foreground truncate">
                      {player.name}
                    </span>
                  </div>
                  <button
                    onClick={() => !isStartingFull && onPromote(id)}
                    disabled={isStartingFull}
                    aria-label={t("promoteLabel")}
                    className={cn(
                      "flex h-8 min-w-[64px] items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors tap-target",
                      isStartingFull
                        ? "border-fp-border bg-fp-surface-2 text-muted-foreground/40 cursor-not-allowed"
                        : "border-fp-accent/30 bg-fp-accent/10 text-fp-accent hover:bg-fp-accent/20"
                    )}
                  >
                    <ArrowUp size={12} />
                    {t("promoteLabel")}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
