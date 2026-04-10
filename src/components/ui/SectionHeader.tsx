import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  /** Visually emphasise with primary color. Default: false */
  accent?: boolean;
}

/**
 * Consistent section title + optional subtitle + optional action button.
 * Used at the top of pages and inside content sections.
 */
export function SectionHeader({
  title,
  subtitle,
  action,
  className,
  accent = false,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-6", className)}>
      <div>
        <h1
          className={cn(
            "text-xl font-semibold tracking-tight",
            accent ? "gradient-text-primary" : "text-foreground"
          )}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
