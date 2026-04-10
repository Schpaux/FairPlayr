"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Check, Pencil, Trash2, X } from "lucide-react";
import type { Player } from "@/domain/team";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { transitions } from "@/lib/tokens";
import { teamTextInputClassName } from "@/components/team/styles";

interface PlayerListCopy {
  rename: string;
  delete: string;
  moveUp: string;
  moveDown: string;
  sourceSpondBadge: string;
  managedDeleteHint: string;
  save: string;
  cancel: string;
  playerNameLabel: string;
  playerNamePlaceholder: string;
  playerNameRequired: string;
  playerNameDuplicate: string;
}

interface PlayerListProps {
  players: Player[];
  copy: PlayerListCopy;
  allowReorder?: boolean;
  onRenamePlayer: (playerId: string, name: string) => boolean | Promise<boolean>;
  onDeletePlayer: (playerId: string) => void;
  onMovePlayer: (playerId: string, direction: "up" | "down") => void;
}

export function PlayerList({
  players,
  copy,
  allowReorder = true,
  onRenamePlayer,
  onDeletePlayer,
  onMovePlayer,
}: PlayerListProps) {
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startEditing = (player: Player) => {
    setEditingPlayerId(player.id);
    setDraftName(player.name);
    setError(null);
  };

  const handleRenameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingPlayerId) {
      return;
    }

    const trimmedName = draftName.trim();

    if (!trimmedName) {
      setError(copy.playerNameRequired);
      return;
    }

    const didRename = await onRenamePlayer(editingPlayerId, trimmedName);

    if (!didRename) {
      setError(copy.playerNameDuplicate);
      return;
    }

    setEditingPlayerId(null);
    setDraftName("");
    setError(null);
  };

  return (
    <ul className="space-y-3">
      {players.map((player, index) => {
        const isEditing = editingPlayerId === player.id;
        const isManagedPlayer = player.isManaged || player.source === "spond";

        return (
          <motion.li
            layout
            key={player.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transitions.fast}
          >
            <AppCard className="p-3">
              {isEditing ? (
                <form onSubmit={handleRenameSubmit} className="space-y-2">
                  <label className="sr-only" htmlFor={`player-edit-${player.id}`}>
                    {copy.playerNameLabel}
                  </label>
                  <input
                    id={`player-edit-${player.id}`}
                    value={draftName}
                    onChange={(event) => {
                      setDraftName(event.target.value);
                      if (error) {
                        setError(null);
                      }
                    }}
                    placeholder={copy.playerNamePlaceholder}
                    className={teamTextInputClassName}
                  />
                  {error && <p className="text-xs text-danger">{error}</p>}
                  <div className="flex items-center gap-2">
                    <FpButton type="submit" variant="primary" size="md" className="tap-target px-3">
                      <Check size={16} />
                      {copy.save}
                    </FpButton>
                    <FpButton
                      type="button"
                      variant="ghost"
                      size="md"
                      className="tap-target px-3"
                      onClick={() => {
                        setEditingPlayerId(null);
                        setDraftName("");
                        setError(null);
                      }}
                    >
                      <X size={16} />
                      {copy.cancel}
                    </FpButton>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {index + 1}. {player.name}
                      </p>
                      {player.source === "spond" ? (
                        <span className="rounded-full border border-fp-accent/40 bg-fp-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fp-accent">
                          {copy.sourceSpondBadge}
                        </span>
                      ) : null}
                    </div>
                    {isManagedPlayer ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">{copy.managedDeleteHint}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    {allowReorder ? (
                      <>
                        <FpButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="tap-target px-2"
                          aria-label={copy.moveUp}
                          onClick={() => onMovePlayer(player.id, "up")}
                          disabled={index === 0}
                        >
                          <ArrowUp size={16} />
                        </FpButton>
                        <FpButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="tap-target px-2"
                          aria-label={copy.moveDown}
                          onClick={() => onMovePlayer(player.id, "down")}
                          disabled={index === players.length - 1}
                        >
                          <ArrowDown size={16} />
                        </FpButton>
                      </>
                    ) : null}
                    <FpButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="tap-target px-2"
                      aria-label={copy.rename}
                      onClick={() => startEditing(player)}
                    >
                      <Pencil size={16} />
                    </FpButton>
                    <FpButton
                      type="button"
                      variant="danger"
                      size="sm"
                      className="tap-target px-2"
                      aria-label={copy.delete}
                      onClick={() => onDeletePlayer(player.id)}
                      disabled={isManagedPlayer}
                      title={isManagedPlayer ? copy.managedDeleteHint : undefined}
                    >
                      <Trash2 size={16} />
                    </FpButton>
                  </div>
                </div>
              )}
            </AppCard>
          </motion.li>
        );
      })}
    </ul>
  );
}
