import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface FpButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Stretch to full container width */
  fullWidth?: boolean;
}

// DESIGN.md §5.7: primary = lime fill with on-lime ink; secondary = 1.5px
// control-line outline with ink text; danger = red fill with white text.
// Pressed is scale(.97) for 90ms; hover (pointer devices only in Tailwind v4)
// is a fill shift, never a scale-up. Disabled = surface-2 fill, ink-2 text.
const variantClasses: Record<Variant, string> = {
  primary:
    "bg-fp-lime text-fp-on-lime font-semibold hover:brightness-95 disabled:bg-fp-surface-2 disabled:text-fp-ink-2",
  secondary:
    "bg-transparent text-fp-ink border-[1.5px] border-fp-control-line hover:bg-fp-surface-2 disabled:bg-fp-surface-2 disabled:text-fp-ink-2 disabled:border-transparent",
  ghost:
    "text-fp-ink hover:bg-fp-surface-2 disabled:text-fp-ink-2",
  danger:
    "bg-fp-danger text-fp-on-danger font-semibold hover:brightness-95 disabled:bg-fp-surface-2 disabled:text-fp-ink-2",
};

// Every button is a pill (DESIGN.md §4).
const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-4 text-sm rounded-full gap-1.5",
  md: "h-11 px-5 text-sm rounded-full gap-2",
  lg: "h-13 px-7 text-base rounded-full gap-2",
};

/**
 * FairPlayr's primary button primitive.
 * Pill shape, lime primary, flat (no glow, no hover scale).
 */
export const FpButton = forwardRef<HTMLButtonElement, FpButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      fullWidth = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium cursor-pointer",
          "transition-[transform,background-color,border-color,filter] duration-(--fp-d-press) ease-fp-out active:scale-[.97]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

FpButton.displayName = "FpButton";
