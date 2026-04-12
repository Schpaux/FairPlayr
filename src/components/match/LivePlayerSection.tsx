"use client";

import { Users } from "lucide-react";
import { motion } from "framer-motion";
import { AppCard } from "@/components/ui/AppCard";
import type { Player } from "@/domain/team";
import { shortName } from "@/lib/utils/playerName";

interface LivePlayerSectionProps {
  title: string;
  description: string;
  players: Player[];
  selectedPlayerId: string | null;
  suggestedPlayerId?: string | null;
  selectedLabel: string;
  suggestedLabel?: string;
  emptyText: string;
  playtimeLabel: string;
  getPlaytime: (playerId: string) => string;
  onSelectPlayer: (playerId: string) => void;
}

export function LivePlayerSection({
  title,
  description,
  players,
  selectedPlayerId,
  suggestedPlayerId,
  selectedLabel,
  suggestedLabel,
  emptyText,
  playtimeLabel,
  getPlaytime,
  onSelectPlayer,
}: LivePlayerSectionProps) {
  return (
    <AppCard className="space-y-3 p-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {players.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-fp-border bg-fp-surface-2 p-4 text-sm text-muted-foreground">
          <Users size={16} />
          {emptyText}
        </div>
      ) : (
        <ul className="space-y-2">
          {players.map((player) => {
            const selected = player.id === selectedPlayerId;
              const suggested = player.id === suggestedPlayerId;

            return (
              <motion.li key={player.id} layout>
                <button
                  type="button"
                  onClick={() => onSelectPlayer(player.id)}
                  className={`tap-target w-full rounded-xl border p-3 text-left transition-all ${
                      selected
                      ? "border-primary bg-primary/10 shadow-[var(--glow-primary-sm)]"
                        : suggested
                          ? "border-fp-accent/50 bg-fp-accent/10"
                      : "border-fp-border bg-fp-surface-2 hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {shortName(player.name)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {playtimeLabel}: {getPlaytime(player.id)}
                      </p>
                    </div>
                      {selected && (
                      <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        {selectedLabel}
                      </span>
                    )}
                      {!selected && suggested && suggestedLabel && (
                        <span className="rounded-full border border-fp-accent/35 bg-fp-accent/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-fp-accent">
                          {suggestedLabel}
                        </span>
                      )}
                  </div>
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}
    </AppCard>
  );
}
