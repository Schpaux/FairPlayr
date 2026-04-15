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
        "flex flex-col items-center justify-center gap-5 rounded-3xl border border-dashed border-fp-border py-16 px-6 text-center",
        className
      )}
    >
      {Icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fp-surface-2 text-muted-foreground">
          <Icon size={26} />
        </div>
      )}
      <div className="space-y-1.5">
        <p className="font-semibold text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed max-w-[22ch] mx-auto">
            {description}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
