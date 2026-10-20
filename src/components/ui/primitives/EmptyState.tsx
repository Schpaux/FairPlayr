import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./primitives.module.css";

/**
 * EmptyState (UI-FOUND-01): flat and quiet. A neutral glyph, a title, an
 * optional line of explanation and at most one action. No dashed border, no
 * tile behind the icon, no warning glyph (an empty list is not an error).
 */

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** One action, usually a `Button` or `ButtonLink`. */
  action?: ReactNode;
  /** Heading level for the title within the page outline. */
  titleAs?: "h2" | "h3" | "p";
  className?: string;
  testId?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  titleAs: Title = "h2",
  className,
  testId,
}: EmptyStateProps) {
  return (
    <div className={cn(styles.empty, className)} data-testid={testId}>
      {Icon ? (
        <span className={styles.emptyGlyph} aria-hidden>
          <Icon size={28} strokeWidth={1.75} />
        </span>
      ) : null}
      <Title className={styles.emptyTitle}>{title}</Title>
      {description ? <p className={styles.emptyDescription}>{description}</p> : null}
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
}
