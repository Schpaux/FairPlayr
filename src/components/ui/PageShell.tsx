import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageShellProps {
  children: ReactNode;
  className?: string;
  /** Constrain content to a readable max-width. Default: true */
  constrained?: boolean;
}

/**
 * Wraps every page with consistent horizontal padding,
 * vertical spacing, and max-width constraints.
 * Use this as the outermost container inside each page component.
 */
export function PageShell({
  children,
  className,
  constrained = true,
}: PageShellProps) {
  return (
    <div
      className={cn(
        "w-full px-4 py-6",
        constrained && "mx-auto max-w-screen-lg",
        className
      )}
    >
      {children}
    </div>
  );
}
