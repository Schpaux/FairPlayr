import { useId, type ComponentProps, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import styles from "./primitives.module.css";

/**
 * ListGroup and ListRow (UI-FOUND-01, DESIGN.md §7 "Lists"): hairline-
 * separated rows on `surface` in a 14px-radius group, with no nested cards.
 *
 * A row is a link (`href`), a button (`onClick`) or static text, never a
 * button inside a link. Rows are at least 54px tall. Labels wrap and are
 * never truncated, so a player's name is always readable in full.
 * A destructive row (red label) belongs in its own group, away from routine
 * rows (DESIGN.md §5.5), and should open a `ConfirmSheet`.
 * A button row takes a function, so render it from a client component.
 * The `<ul>` carries `role="list"`: Safari drops list semantics when
 * `list-style: none` is set.
 */

type HeadingTag = "h2" | "h3" | "h4";

export interface ListGroupProps {
  /** Section kicker above the group (13px caps); also names the list. */
  title?: ReactNode;
  titleAs?: HeadingTag;
  /** Accessible name when there is no visible title. */
  "aria-label"?: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}

export function ListGroup({
  title,
  titleAs: Heading = "h2",
  "aria-label": ariaLabel,
  children,
  className,
  testId,
}: ListGroupProps) {
  const titleId = useId();

  return (
    <section className={cn(styles.listSection, className)} data-testid={testId}>
      {title ? (
        <Heading id={titleId} className={styles.listTitle}>
          {title}
        </Heading>
      ) : null}
      <ul role="list" className={styles.listGroup} aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : ariaLabel}>
        {children}
      </ul>
    </section>
  );
}

interface ListRowBase {
  label: ReactNode;
  description?: ReactNode;
  /** Leading glyph or disc (decorative unless it carries its own label). */
  leading?: ReactNode;
  /** Trailing value, for example "11" or "7v7". */
  trailing?: ReactNode;
  /** Red label for a destructive row. */
  destructive?: boolean;
  className?: string;
  testId?: string;
}

type LinkRow = ListRowBase & {
  href: ComponentProps<typeof Link>["href"];
  onClick?: never;
  disabled?: never;
};

type ButtonRow = ListRowBase & {
  href?: never;
  onClick: () => void;
  disabled?: boolean;
};

type StaticRow = ListRowBase & {
  href?: never;
  onClick?: never;
  disabled?: never;
};

export type ListRowProps = LinkRow | ButtonRow | StaticRow;

export function ListRow(props: ListRowProps) {
  const { label, description, leading, trailing, destructive, className, testId } = props;
  const interactive = props.href !== undefined || props.onClick !== undefined;
  const rowClass = cn(styles.row, interactive && styles.rowInteractive, destructive && styles.rowDestructive, className);

  const content = (
    <>
      {leading ? (
        <span className={styles.rowLeading} aria-hidden>
          {leading}
        </span>
      ) : null}
      <span className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        {description ? <span className={styles.rowDescription}>{description}</span> : null}
      </span>
      {trailing != null || props.href !== undefined ? (
        <span className={styles.rowTrailing}>
          {trailing}
          {props.href !== undefined ? <ChevronRight size={20} strokeWidth={1.75} aria-hidden /> : null}
        </span>
      ) : null}
    </>
  );

  if (props.href !== undefined) {
    return (
      <li className={styles.listItem}>
        <Link href={props.href} className={rowClass} data-testid={testId}>
          {content}
        </Link>
      </li>
    );
  }

  if (props.onClick !== undefined) {
    return (
      <li className={styles.listItem}>
        <button
          type="button"
          className={rowClass}
          onClick={props.onClick}
          disabled={props.disabled}
          data-testid={testId}
        >
          {content}
        </button>
      </li>
    );
  }

  return (
    <li className={styles.listItem}>
      <div className={rowClass} data-testid={testId}>
        {content}
      </div>
    </li>
  );
}
