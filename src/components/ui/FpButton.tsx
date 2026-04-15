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

// Wise-inspired: primary = lime green pill with dark text + scale hover
// Secondary/ghost remain neutral with pill shape
const variantClasses: Record<Variant, string> = {
  primary:
    "bg-fp-cta text-fp-cta-foreground glow-cta-sm font-semibold hover:scale-[1.03] active:scale-[0.96]",
  secondary:
    "bg-fp-surface-2 text-foreground border border-fp-border hover:bg-fp-surface hover:scale-[1.02] active:scale-[0.97]",
  ghost:
    "text-foreground hover:bg-fp-surface-2 active:scale-[0.97]",
  danger:
    "bg-destructive text-destructive-foreground font-semibold hover:scale-[1.02] active:scale-[0.96]",
};

// Pill shape on all sizes — Wise signature
const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-4 text-sm rounded-full gap-1.5",
  md: "h-11 px-5 text-sm rounded-full gap-2",
  lg: "h-13 px-7 text-base rounded-full gap-2",
};

/**
 * FairPlayr's primary button primitive.
 * Wise-inspired: pill shape, lime green primary CTA, scale hover animation.
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
          "inline-flex items-center justify-center font-medium transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-40",
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
