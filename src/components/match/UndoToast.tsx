"use client";

/**
 * UndoToast
 *
 * Non-blocking, self-expiring toast that appears after a substitution.
 * Positioned bottom-left, away from the pitch and bench interaction zones.
 *
 * Renders via AnimatePresence so it slides up on enter and fades out on exit.
 * Does NOT use a portal — it relies on the live match container having
 * `relative` positioning and the toast using `fixed` coordinates.
 */

import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UndoToastProps {
  /** When non-null, the toast is visible and shows this countdown. */
  secondsRemaining: number | null;
  onUndo: () => void;
}

export function UndoToast({ secondsRemaining, onUndo }: UndoToastProps) {
  const visible = secondsRemaining !== null && secondsRemaining > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="undo-toast"
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.97 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] left-4 z-50"
        >
          <button
            type="button"
            onClick={onUndo}
            className={cn(
              "flex items-center gap-2 rounded-full",
              "border border-fp-border bg-fp-surface-2/90 backdrop-blur-sm",
              "px-3.5 py-2 shadow-lg",
              "text-xs font-semibold text-foreground",
              "transition-colors active:bg-fp-surface-3",
              "tap-target"
            )}
          >
            <RotateCcw size={13} className="text-muted-foreground" />
            <span>Angre bytte</span>
            <span className="tabular-nums text-muted-foreground">
              {secondsRemaining}s
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
