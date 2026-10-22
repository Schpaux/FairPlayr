"use client";

import { FormEvent, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Player } from "@/domain/team";
import { Button, ListGroup, ListRow, Sheet } from "@/components/ui/primitives";
import { isManagedPlayer } from "@/components/team/PlayerList";
import { teamTextInputClassName } from "@/components/team/styles";

/**
 * Edit sheet for one player (UI-TEAM-01). Rename with Lagre or Avbryt; "Slett
 * spiller" sits at the bottom in its own group, away from the routine
 * actions, and only asks for the deletion: the caller confirms it in a
 * `ConfirmSheet`. A Spond player is read-only, so the sheet only explains
 * where it is managed.
 *
 * The draft lives here, so the caller remounts the sheet (a new `key`) each
 * time it opens it.
 */

export type RenameResult = "ok" | "duplicate" | "error";

interface PlayerEditSheetProps {
  /** The player being edited; kept by the caller while the sheet slides out. */
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "duplicate" when another player has the name; "error" when saving failed. */
  onRename: (playerId: string, name: string) => RenameResult | Promise<RenameResult>;
  onRequestDelete: (playerId: string) => void;
}

export function PlayerEditSheet({ player, open, onOpenChange, onRename, onRequestDelete }: PlayerEditSheetProps) {
  const t = useTranslations("team");
  const common = useTranslations("common");
  const formId = useId();
  const inputId = useId();
  const errorId = useId();
  const [name, setName] = useState(player?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Set synchronously: Enter plus a tap in the same tick must not save twice.
  const savingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showError = (message: string) => {
    setError(message);
    inputRef.current?.focus();
  };

  const managed = player ? isManagedPlayer(player) : false;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!player || savingRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      showError(t("validation.playerNameRequired"));
      return;
    }
    if (trimmed === player.name) {
      onOpenChange(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    let result: RenameResult = "error";
    try {
      result = await onRename(player.id, trimmed);
    } catch {
      result = "error";
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    if (result === "ok") {
      onOpenChange(false);
      return;
    }
    showError(t(result === "duplicate" ? "validation.playerNameDuplicate" : "errors.generic"));
  };

  if (managed) {
    return (
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={player?.name ?? ""}
        description={t("editPlayer.spondDescription", { name: player?.name ?? "" })}
        testId="player-edit-sheet"
      />
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("editPlayer.title")}
      closeButton={false}
      testId="player-edit-sheet"
      actions={
        <>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            block
            aria-disabled={saving || undefined}
            aria-busy={saving || undefined}
          >
            {common("save")}
          </Button>
          <Button block onClick={() => onOpenChange(false)}>
            {common("cancel")}
          </Button>
          {player ? (
            <ListGroup aria-label={t("editPlayer.deleteGroup")} className="mt-4">
              <ListRow destructive label={t("editPlayer.deleteLabel")} onClick={() => onRequestDelete(player.id)} />
            </ListGroup>
          ) : null}
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} className="space-y-2">
        <label htmlFor={inputId} className="block text-sm font-medium text-fp-ink-2">
          {t("forms.playerNameLabel")}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={name}
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(null);
          }}
          placeholder={t("forms.playerNamePlaceholder")}
          className={teamTextInputClassName}
        />
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-fp-danger-text">
            {error}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
