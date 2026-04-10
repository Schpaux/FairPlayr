import type { ReactNode, ElementType } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Full-bleed empty state shell.
 * Use when a section has no data to show.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-fp-border py-16 px-6 text-center",
        className
      )}
    >
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fp-surface-2 text-muted-foreground">
          <Icon size={24} />
        </div>
      )}
      <div>
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
