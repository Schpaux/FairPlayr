"use client";

import { FormEvent, useRef, useState } from "react";
import { UserPlus2 } from "lucide-react";
import { FpButton } from "@/components/ui/FpButton";
import { teamTextInputClassName } from "@/components/team/styles";

interface PlayerQuickAddFormProps {
  label: string;
  placeholder: string;
  submitLabel: string;
  validationMessage: string;
  duplicateMessage: string;
  onAddPlayer: (name: string) => boolean | Promise<boolean>;
}

export function PlayerQuickAddForm({
  label,
  placeholder,
  submitLabel,
  validationMessage,
  duplicateMessage,
  onAddPlayer,
}: PlayerQuickAddFormProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const focusInput = () => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName) {
      setError(validationMessage);
      focusInput();
      return;
    }

    const didAdd = await onAddPlayer(trimmedName);

    if (!didAdd) {
      setError(duplicateMessage);
      focusInput();
      return;
    }

    setName("");
    setError(null);
    focusInput();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label className="sr-only" htmlFor="player-name-input">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          id="player-name-input"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          placeholder={placeholder}
          className={`${teamTextInputClassName} flex-1`}
        />
        <FpButton type="submit" variant="primary" size="md" className="tap-target px-3">
          <UserPlus2 size={16} />
          {submitLabel}
        </FpButton>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
