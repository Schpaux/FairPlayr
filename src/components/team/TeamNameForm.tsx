"use client";

import { FormEvent, useId, useState } from "react";
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
  // Create and rename forms can be on the page at once; ids must stay unique.
  const inputId = useId();
  const errorId = useId();

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
      <label className="sr-only" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        value={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setName(event.target.value);
          if (error) {
            setError(null);
          }
        }}
        placeholder={placeholder}
        className={teamTextInputClassName}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-fp-danger-text">
          {error}
        </p>
      ) : null}
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
