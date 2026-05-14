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
      <div
        className="relative w-full overflow-hidden rounded-[22px]"
        style={{
          aspectRatio: "340 / 260",
          background: "linear-gradient(180deg, var(--fp-pitch-a) 0%, var(--fp-pitch-b) 100%)",
          boxShadow: "inset 0 0 0 1px var(--fp-border)",
        }}
      >
        {/* Grass stripes */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--fp-pitch-stripe-a) 0, var(--fp-pitch-stripe-a) 12.5%, var(--fp-pitch-stripe-b) 12.5%, var(--fp-pitch-stripe-b) 25%)",
          }}
        />
        {/* Half-pitch markings */}
        <svg
          aria-hidden
          viewBox="0 0 100 80"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <g stroke="var(--fp-pitch-line)" strokeWidth="0.4" fill="none">
            <rect x="1.5" y="1.5" width="97" height="77" rx="1" />
            <line x1="1.5" y1="77" x2="98.5" y2="77" strokeWidth="0.5" />
            <path d="M 40 77 A 10 10 0 0 1 60 77" />
            <circle cx="50" cy="77" r="0.8" fill="var(--fp-pitch-line)" stroke="none" />
            <rect x="22" y="1.5" width="56" height="18" />
            <rect x="34" y="1.5" width="32" height="7" />
            <circle cx="50" cy="13" r="0.6" fill="var(--fp-pitch-line)" stroke="none" />
            <path d="M 42 19.5 A 8 8 0 0 0 58 19.5" />
            <path d="M 1.5 4 A 2.5 2.5 0 0 0 4 1.5" />
            <path d="M 96 1.5 A 2.5 2.5 0 0 0 98.5 4" />
          </g>
        </svg>

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
