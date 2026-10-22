"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import type { Player } from "@/domain/team";
import { ListGroup, ListRow } from "@/components/ui/primitives";
import { discLabel, hasShirtNumber } from "@/components/live/liveScreenModel";
import { cn } from "@/lib/utils";

/**
 * Player list (UI-TEAM-01, DESIGN.md §7 "Lists"): one hairline row per
 * player with the shirt disc and the full name, which wraps and is never
 * truncated, so two players with the same first name can always be told
 * apart. Tapping a row opens the edit sheet; there is no destructive control
 * in the list. Reordering is a separate mode with up/down buttons per row.
 */

interface PlayerListProps {
  players: Player[];
  /** Reorder mode: rows carry move buttons and do not open the edit sheet. */
  reordering?: boolean;
  onOpenPlayer: (playerId: string) => void;
  /** Resolves to true once the move is saved. */
  onMovePlayer: (playerId: string, direction: "up" | "down") => Promise<boolean>;
}

export const playerRowTestId = (playerId: string) => `player-row-${playerId}`;

export function isManagedPlayer(player: Player) {
  return player.isManaged || player.source === "spond";
}

function ShirtDisc({ player }: { player: Player }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-fp-club-disc leading-none text-fp-on-club",
        hasShirtNumber(player) ? "font-num text-[19px]" : "text-[13px] font-semibold"
      )}
    >
      {discLabel(player)}
    </span>
  );
}

export function PlayerList({ players, reordering = false, onOpenPlayer, onMovePlayer }: PlayerListProps) {
  const t = useTranslations("team");
  // `count` re-keys the live text, so the same message twice is read twice.
  // The caller remounts the list when the mode changes, which clears it.
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
  // The moved row is re-inserted in the DOM, which can drop focus; put it
  // back on the button that was pressed, once the saved order has rendered.
  const [refocus, setRefocus] = useState<string | null>(null);

  useEffect(() => {
    if (!refocus) return;
    document.querySelector<HTMLElement>(`[data-move="${refocus}"]`)?.focus();
  }, [refocus, players]);

  const announce = (text: string) => setAnnouncement((previous) => ({ text, count: previous.count + 1 }));

  const move = async (player: Player, index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= players.length) {
      announce(t(direction === "up" ? "players.alreadyFirst" : "players.alreadyLast", { name: player.name }));
      return;
    }
    const moved = await onMovePlayer(player.id, direction);
    if (!moved) return;
    setRefocus(`${player.id}-${direction}`);
    announce(t("players.moved", { name: player.name, position: target + 1, total: players.length }));
  };

  const numberText = (player: Player) =>
    hasShirtNumber(player) ? <span className="sr-only">, {t("players.shirtNumber", { number: player.number })}</span> : null;

  return (
    <>
      <ListGroup aria-label={t("players.listLabel")} testId="player-list">
        {players.map((player, index) =>
          reordering ? (
            <li
              key={player.id}
              className="flex min-h-[54px] items-center gap-3 border-t border-fp-rule py-1 pr-1.5 pl-3.5 first:border-t-0"
              data-testid={playerRowTestId(player.id)}
            >
              <ShirtDisc player={player} />
              <span className="min-w-0 flex-1 text-base leading-[1.3] font-medium [overflow-wrap:anywhere]">
                {player.name}
                {numberText(player)}
              </span>
              {isManagedPlayer(player) ? null : (
                <span className="flex shrink-0 items-center gap-1">
                  {(["up", "down"] as const).map((direction) => {
                    const atEdge = direction === "up" ? index === 0 : index === players.length - 1;
                    return (
                      <button
                        key={direction}
                        type="button"
                        className={cn(
                          "flex size-11 items-center justify-center rounded-full text-fp-ink",
                          "transition-transform duration-(--fp-d-press) ease-fp-out active:scale-[0.97]",
                          // DESIGN.md §5.7 disabled look.
                          atEdge && "bg-fp-surface-2 text-fp-ink-2"
                        )}
                        data-move={`${player.id}-${direction}`}
                        // aria-disabled, not disabled: a row that reaches the
                        // top or bottom keeps focus on the button just pressed.
                        aria-disabled={atEdge || undefined}
                        aria-label={t(direction === "up" ? "actions.moveUpNamed" : "actions.moveDownNamed", {
                          name: player.name,
                        })}
                        onClick={() => void move(player, index, direction)}
                      >
                        {direction === "up" ? (
                          <ArrowUp size={20} strokeWidth={1.75} aria-hidden />
                        ) : (
                          <ArrowDown size={20} strokeWidth={1.75} aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </span>
              )}
            </li>
          ) : (
            <ListRow
              key={player.id}
              testId={playerRowTestId(player.id)}
              leading={<ShirtDisc player={player} />}
              label={
                <>
                  {player.name}
                  {numberText(player)}
                </>
              }
              description={
                isManagedPlayer(player) ? (
                  <>
                    <span className="sr-only">, </span>
                    {t("players.spondRow")}
                  </>
                ) : undefined
              }
              trailing={<ChevronRight size={20} strokeWidth={1.75} aria-hidden />}
              onClick={() => onOpenPlayer(player.id)}
            />
          )
        )}
      </ListGroup>
      <p aria-live="polite" className="sr-only">
        <span key={announcement.count}>{announcement.text}</span>
      </p>
    </>
  );
}
