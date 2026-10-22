"use client";

import { FormEvent, useId, useRef, useState, type RefObject } from "react";
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
  /** Lets the page move focus here, for example after a player is deleted. */
  inputRef?: RefObject<HTMLInputElement | null>;
}

export function PlayerQuickAddForm({
  label,
  placeholder,
  submitLabel,
  validationMessage,
  duplicateMessage,
  onAddPlayer,
  inputRef: externalInputRef,
}: PlayerQuickAddFormProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ownInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = externalInputRef ?? ownInputRef;
  const inputId = useId();
  const errorId = useId();

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
      <label className="sr-only" htmlFor={inputId}>
        {label}
      </label>
      <div className="flex items-center gap-2">
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
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-fp-danger-text">
          {error}
        </p>
      ) : null}
    </form>
  );
}
