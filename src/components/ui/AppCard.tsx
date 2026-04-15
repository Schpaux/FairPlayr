import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AppCardProps {
  children: ReactNode;
  className?: string;
  /** Adds a glow — use for active or high-focus cards */
  glow?: "primary" | "accent" | "none";
  /** Make the card feel slightly interactive with a hover lift */
  interactive?: boolean;
  onClick?: () => void;
  as?: "div" | "article" | "li";
}

/**
 * FairPlayr's main card primitive.
 * Wise-inspired: generous radius (rounded-3xl), clean ring border, optional glow.
 */
export function AppCard({
  children,
  className,
  glow = "none",
  interactive = false,
  onClick,
  as: Tag = "div",
}: AppCardProps) {
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "rounded-3xl border border-fp-border bg-fp-surface p-4",
        glow === "primary" && "glow-primary-sm border-primary/20",
        glow === "accent" && "glow-accent-sm border-accent/20",
        interactive &&
          "cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99]",
        className
      )}
    >
      {children}
    </Tag>
  );
}
