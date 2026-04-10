"use client";

import { AppCard } from "@/components/ui/AppCard";
import type { LineupSlot } from "@/domain/lineupLayouts";
import type { Player } from "@/domain/team";

interface LineupFieldProps {
  slots: LineupSlot[];
  slotAssignments: Record<string, string | null>;
  playersById: Map<string, Player>;
  activeSlotId: string | null;
  slotEmptyLabel: string;
  onSelectSlot: (slotId: string) => void;
}

export function LineupField({
  slots,
  slotAssignments,
  playersById,
  activeSlotId,
  slotEmptyLabel,
  onSelectSlot,
}: LineupFieldProps) {
  return (
    <AppCard className="overflow-hidden p-0">
      <div className="relative aspect-[3/4] w-full bg-gradient-to-b from-emerald-500/25 via-emerald-500/15 to-emerald-600/25">
        <div className="absolute inset-4 rounded-2xl border-2 border-white/35">
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/25" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
          <div className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-b-xl border border-t-0 border-white/25" />
          <div className="absolute left-1/2 bottom-2 h-5 w-20 -translate-x-1/2 rounded-t-xl border border-b-0 border-white/25" />
        </div>

        {slots.map((slot) => {
          const assignedId = slotAssignments[slot.id];
          const player = assignedId ? playersById.get(assignedId) ?? null : null;
          const active = activeSlotId === slot.id;

          return (
            <button
              key={slot.id}
              type="button"
              className={`tap-target absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border px-2 py-1.5 text-center transition-all ${
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-[var(--glow-primary-sm)]"
                  : player
                    ? "border-white/40 bg-black/40 text-white"
                    : "border-white/30 bg-white/10 text-white"
              }`}
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
              onClick={() => onSelectSlot(slot.id)}
            >
              {player ? (
                <span className="block max-w-[90px] truncate text-xs font-semibold">
                  {player.name}
                </span>
              ) : (
                <span className="block text-[10px] font-semibold uppercase tracking-wide">
                  {slotEmptyLabel} {slot.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </AppCard>
  );
}
