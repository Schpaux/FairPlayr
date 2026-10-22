import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A chip label with a check mark in front of it when the chip is selected
 * (C1-F3, DESIGN.md §2.5): selection is never shown by the lime fill alone.
 *
 * The check is positioned in the space to the left of the label, so the label
 * stays centred and the chip keeps the same size in both states (no layout
 * shift). The chip needs at least 20px of free space there: horizontal padding
 * of 24px (`px-6`) for pills, or a label narrower than its tile. The glyph is
 * decorative; the chip carries the state itself (`aria-pressed`).
 */
export function SelectedLabel({
  selected,
  children,
  className,
}: {
  selected: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("relative", className)}>
      {selected ? (
        <Check
          aria-hidden
          data-testid="selected-check"
          size={14}
          strokeWidth={2.75}
          className="absolute top-1/2 right-full mr-1.5 -translate-y-1/2"
        />
      ) : null}
      {children}
    </span>
  );
}
