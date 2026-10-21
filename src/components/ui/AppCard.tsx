import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AppCardProps {
  children: ReactNode;
  className?: string;
  /** Clickable card: pointer cursor, pressed scale and a hover fill shift. */
  interactive?: boolean;
  onClick?: () => void;
  as?: "div" | "article" | "li";
}

/**
 * FairPlayr's main card primitive.
 * Flat (DESIGN.md §4): surface on canvas plus a 1px rule, no glow or shadow.
 */
export function AppCard({
  children,
  className,
  interactive = false,
  onClick,
  as: Tag = "div",
}: AppCardProps) {
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "rounded-3xl border border-fp-border bg-fp-surface p-4",
        interactive &&
          "cursor-pointer transition-[transform,background-color] duration-(--fp-d-press) ease-fp-out hover:bg-fp-surface-2 active:scale-[.97]",
        className
      )}
    >
      {children}
    </Tag>
  );
}
