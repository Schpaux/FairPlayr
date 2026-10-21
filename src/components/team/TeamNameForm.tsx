"use client";

import { FormEvent, useState } from "react";
import { FpButton } from "@/components/ui/FpButton";
import { teamTextInputClassName } from "@/components/team/styles";

interface TeamNameFormProps {
  initialValue?: string;
  mode: "create" | "edit";
  label: string;
  placeholder: string;
  submitLabel: string;
  cancelLabel?: string;
  validationMessage: string;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
}

export function TeamNameForm({
  initialValue = "",
  mode,
  label,
  placeholder,
  submitLabel,
  cancelLabel,
  validationMessage,
  onSubmit,
  onCancel,
}: TeamNameFormProps) {
  const [name, setName] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);


  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName) {
      setError(validationMessage);
      return;
    }

    setError(null);
    onSubmit(trimmedName);

    if (mode === "create") {
      setName("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="sr-only" htmlFor="team-name-input">
        {label}
      </label>
      <input
        id="team-name-input"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          if (error) {
            setError(null);
          }
        }}
        placeholder={placeholder}
        className={teamTextInputClassName}
      />
      {error && <p className="text-xs text-fp-danger-text">{error}</p>}
      <div className="flex items-center gap-2">
        <FpButton type="submit" variant="primary" size="md" className="tap-target">
          {submitLabel}
        </FpButton>
        {onCancel && cancelLabel && (
          <FpButton
            type="button"
            variant="ghost"
            size="md"
            className="tap-target"
            onClick={onCancel}
          >
            {cancelLabel}
          </FpButton>
        )}
      </div>
    </form>
  );
}
