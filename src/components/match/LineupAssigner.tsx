"use client";

import { useMemo, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Player } from "@/domain/team";
import type { MatchSetup } from "@/domain/match";
import { getBenchPlayerIds, getFormationSlots, getRequiredStarters } from "@/domain/match";
import { FpButton } from "@/components/ui/FpButton";
import { cn } from "@/lib/utils";

interface LineupAssignerProps {
  setup: MatchSetup;
  players: Player[];
  onAssignToSlot: (slotId: string, playerId: string) => void;
  onClearSlot: (slotId: string) => void;
  onAutoFill: () => void;
}

export function LineupAssigner({
  setup,
  players,
  onAssignToSlot,
  onClearSlot,
  onAutoFill,
}: LineupAssignerProps) {
  const t = useTranslations("matchSetup.lineup");
  const required = getRequiredStarters(setup);
  const slots = getFormationSlots(setup.format, setup.formationId);
  const currentStarters = setup.startingPlayerIds.length;
  const benchIds = getBenchPlayerIds(setup);

  const playerMap = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const onFieldSet = useMemo(() => new Set(setup.startingPlayerIds), [setup.startingPlayerIds]);

  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAllBench, setShowAllBench] = useState(false);

  const activeSlotPlayerId = activeSlotId ? setup.slotAssignments[activeSlotId] ?? null : null;

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return players;
    }

    return players.filter((player) => player.name.toLowerCase().includes(q));
  }, [players, search]);

  const benchToShow = showAllBench ? benchIds : benchIds.slice(0, 8);

  const firstEmptySlotId = useMemo(() => {
    for (const slot of slots) {
      if (!setup.slotAssignments[slot.id]) {
        return slot.id;
      }
    }

    return null;
  }, [setup.slotAssignments, slots]);

  const handleOpenPicker = (slotId: string) => {
    setActiveSlotId(slotId);
    setSearch("");
  };

  const handleAssign = (playerId: string) => {
    if (!activeSlotId) {
      return;
    }

    onAssignToSlot(activeSlotId, playerId);
    setActiveSlotId(null);
    setSearch("");
  };

  const handleBenchQuickAdd = (playerId: string) => {
    if (!firstEmptySlotId) {
      return;
    }

    onAssignToSlot(firstEmptySlotId, playerId);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("starting")}
          </p>
          <p className="text-xs text-muted-foreground">{t("tapHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              currentStarters === required ? "text-fp-accent" : "text-muted-foreground"
            )}
          >
            {t("starterSlots", { current: currentStarters, required })}
          </span>
          <FpButton
            type="button"
            variant="ghost"
            size="sm"
            className="tap-target"
            onClick={onAutoFill}
          >
            {t("autoFill")}
          </FpButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {slots.map((slot, index) => {
          const playerId = setup.slotAssignments[slot.id] ?? null;
          const player = playerId ? playerMap.get(playerId) ?? null : null;

          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => handleOpenPicker(slot.id)}
              className={cn(
                "tap-target rounded-xl border px-3 py-3 text-left transition-colors",
                player
                  ? "border-primary/30 bg-primary/10"
                  : "border-dashed border-fp-border bg-fp-surface-2"
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("positionLabel", { value: index + 1 })}
              </p>
              <p className={cn("mt-1 text-sm font-semibold", player ? "text-foreground" : "text-muted-foreground")}> 
                {player ? player.name : t("emptySlot")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {player ? t("changePlayer") : t("choosePlayer")}
              </p>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 rounded-xl border border-fp-border bg-fp-surface-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("benchTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("benchSubtitle")}</p>
          </div>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {benchIds.length}
          </span>
        </div>

        {benchIds.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("benchEmpty")}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {benchToShow.map((playerId) => {
                const player = playerMap.get(playerId);
                if (!player) {
                  return null;
                }

                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => handleBenchQuickAdd(player.id)}
                    disabled={!firstEmptySlotId}
                    className={cn(
                      "tap-target rounded-full border px-3 py-1.5 text-xs font-medium",
                      firstEmptySlotId
                        ? "border-fp-border bg-background text-foreground"
                        : "cursor-not-allowed border-fp-border bg-background text-muted-foreground/60"
                    )}
                  >
                    {player.name}
                  </button>
                );
              })}
            </div>

            {benchIds.length > 8 ? (
              <button
                type="button"
                className="tap-target text-xs font-medium text-primary"
                onClick={() => setShowAllBench((previous) => !previous)}
              >
                {showAllBench ? t("showLessBench") : t("showMoreBench", { count: benchIds.length - 8 })}
              </button>
            ) : null}
          </>
        )}
      </div>

      {activeSlotId ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/45 p-3">
          <div className="w-full max-h-[78vh] overflow-hidden rounded-2xl border border-fp-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-fp-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{t("pickerTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("pickerSubtitle")}</p>
              </div>
              <FpButton
                type="button"
                variant="ghost"
                size="sm"
                className="tap-target px-2"
                aria-label={t("closePicker")}
                onClick={() => setActiveSlotId(null)}
              >
                <X size={16} />
              </FpButton>
            </div>

            <div className="border-b border-fp-border px-4 py-3">
              <label className="flex items-center gap-2 rounded-2xl border border-fp-border bg-fp-surface-2 px-4 py-3 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
                <Search size={15} className="shrink-0 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/60"
                />
              </label>
            </div>

            <div className="max-h-[56vh] overflow-y-auto px-3 py-3">
              <div className="space-y-2">
                {filteredPlayers.map((player) => {
                  const isOnField = onFieldSet.has(player.id);
                  const isCurrent = activeSlotPlayerId === player.id;

                  return (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => handleAssign(player.id)}
                      className={cn(
                        "tap-target flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left",
                        isCurrent
                          ? "border-primary/30 bg-primary/10"
                          : "border-fp-border bg-fp-surface-2"
                      )}
                    >
                      <span className="text-sm font-medium text-foreground">{player.name}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          isCurrent
                            ? "bg-primary/15 text-primary"
                            : isOnField
                              ? "bg-fp-surface-3 text-muted-foreground"
                              : "bg-fp-accent/15 text-fp-accent"
                        )}
                      >
                        {isCurrent ? t("status.current") : isOnField ? t("status.onField") : t("status.bench")}
                      </span>
                    </button>
                  );
                })}

                {filteredPlayers.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">{t("noSearchResults")}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-fp-border p-3">
              <FpButton
                type="button"
                variant="secondary"
                size="sm"
                className="tap-target"
                onClick={() => setActiveSlotId(null)}
              >
                {t("closePicker")}
              </FpButton>
              <FpButton
                type="button"
                variant="danger"
                size="sm"
                className="tap-target"
                onClick={() => {
                  onClearSlot(activeSlotId);
                  setActiveSlotId(null);
                }}
                disabled={!activeSlotPlayerId}
              >
                <UserPlus size={13} />
                {t("sendToBench")}
              </FpButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
