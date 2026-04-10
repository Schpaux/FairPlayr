import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AppCardProps {
  children: ReactNode;
  className?: string;
  /** Adds a primary glow — use for active or high-focus cards */
  glow?: "primary" | "accent" | "none";
  /** Make the card feel slightly interactive with a hover lift */
  interactive?: boolean;
  onClick?: () => void;
  as?: "div" | "article" | "li";
}

/**
 * FairPlayr's main card primitive.
 * Renders a surface with rounded corners, border, and optional glow.
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
        "rounded-2xl border border-fp-border bg-fp-surface p-4",
        glow === "primary" && "glow-primary-sm border-primary/20",
        glow === "accent" && "glow-accent-sm border-accent/20",
        interactive &&
          "cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0",
        className
      )}
    >
      {children}
    </Tag>
  );
}
