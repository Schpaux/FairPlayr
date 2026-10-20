import type { ComponentPropsWithRef, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import styles from "./primitives.module.css";

/**
 * Button and ButtonLink (UI-FOUND-01, DESIGN.md §5.7).
 *
 * - Every button is a pill: 52px (`md`) or 44px (`sm`).
 * - `primary` is lime with `on-lime` ink: use it only for *the* next action
 *   on a screen (DESIGN.md §1, principle 2).
 * - `secondary` is a 1.5px `control-line` outline (≥3:1, it is what tells it
 *   apart from `ghost`), `ghost` has no outline.
 * - `destructive` is the red fill. It belongs only inside its confirmation
 *   (`ConfirmSheet`), never next to routine actions.
 * - Disabled is a real `disabled` attribute with a `surface-2` fill.
 * - Pressed is `scale(.97)` for 90ms; hover is a fill shift on pointer
 *   devices only. No glow, no hover scale-up.
 *
 * `ButtonLink` renders the same pill as a locale-aware link, replacing
 * `<Link><button>` nesting. A link cannot be disabled; render a disabled
 * `Button` instead when the destination is unavailable.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "md" | "sm";

interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width of the container; a long label wraps instead of overflowing. */
  block?: boolean;
  /** Optional leading icon (decorative; the label carries the meaning). */
  icon?: ReactNode;
}

export function buttonClassName({
  variant = "secondary",
  size = "md",
  block = false,
  className,
}: Omit<ButtonStyleProps, "icon"> & { className?: string }) {
  return cn(styles.button, styles[variant], size === "sm" && styles.sm, block && styles.block, className);
}

function Content({ icon, children }: { icon?: ReactNode; children?: ReactNode }) {
  return (
    <>
      {icon ? (
        <span className={styles.buttonIcon} aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
    </>
  );
}

export type ButtonProps = ButtonStyleProps & ComponentPropsWithRef<"button">;

export function Button({
  variant = "secondary",
  size = "md",
  block,
  icon,
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={buttonClassName({ variant, size, block, className })} {...props}>
      <Content icon={icon}>{children}</Content>
    </button>
  );
}

export type ButtonLinkProps = ButtonStyleProps & ComponentPropsWithRef<typeof Link>;

export function ButtonLink({
  variant = "secondary",
  size = "md",
  block,
  icon,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClassName({ variant, size, block, className })} {...props}>
      <Content icon={icon}>{children}</Content>
    </Link>
  );
}
