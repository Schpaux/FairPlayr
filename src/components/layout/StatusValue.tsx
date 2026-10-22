import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A status as a glyph plus a word (DESIGN.md §2.5: never colour alone), for
 * the trailing slot of a `ListRow`. `warn` uses `warn-text` (glyph and word),
 * `ok` uses `ok-text`, `quiet` stays `ink-2`.
 */
export function StatusValue({
  icon: Icon,
  tone = "quiet",
  status,
  testId,
  children,
}: {
  icon: LucideIcon;
  tone?: "quiet" | "ok" | "warn";
  /** Machine-readable state for tests (`data-status`). */
  status?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        // The trailing slot never shrinks, so the value caps its own width and
        // wraps; otherwise a long status squeezes the row label mid-word at 360 px.
        "inline-flex max-w-[45vw] items-center gap-1.5 text-right text-sm font-medium",
        tone === "warn" ? "text-fp-warn-text" : tone === "ok" ? "text-fp-ok-text" : "text-fp-ink-2"
      )}
      data-status={status}
      data-testid={testId}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden className="flex-none" />
      <span>{children}</span>
    </span>
  );
}
