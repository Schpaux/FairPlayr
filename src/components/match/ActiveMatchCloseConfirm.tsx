"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmSheet } from "@/components/ui/primitives";

export type ActiveMatchCloseAction = "end" | "discard";

/**
 * MATCH-03: "Avslutt" and "Forkast" on an ongoing match, outside Live, are
 * never carried out on one tap. The coach first sees what happens to the
 * match's data, and only "Forkast" uses the destructive fill (DESIGN.md §5.7).
 *
 * `run` performs the action and resolves when it is done; the sheet stays
 * open (and ignores further presses) until then, and closes either way.
 * `run` reports its own failures (both callers catch and show an error).
 *
 * Render `ActiveMatchCloseConfirm` outside the card that opens it: the card
 * goes away when the match closes, and the sheet must be able to slide out.
 * For the same reason, after a completed action focus goes to the first
 * control of the page (`main`), not back to a trigger that no longer exists;
 * Avbryt and Escape still return it to the trigger.
 */
export function useActiveMatchCloseConfirm(run: (action: ActiveMatchCloseAction) => Promise<void>) {
  const [open, setOpen] = useState(false);
  // Both kept after closing, so the copy does not change while it slides out.
  const [action, setAction] = useState<ActiveMatchCloseAction>("end");
  const [matchTitle, setMatchTitle] = useState("");
  const [pending, setPending] = useState(false);
  const finalFocus = useRef<HTMLElement | null>(null);

  const request = (next: ActiveMatchCloseAction, title: string) => {
    finalFocus.current = null;
    setAction(next);
    setMatchTitle(title);
    setOpen(true);
  };

  const confirm = () => {
    if (pending) return;
    setPending(true);
    void (async () => {
      try {
        await run(action);
        finalFocus.current = document.querySelector("main");
      } catch {
        // `run` reports its own failures; never leave the sheet stuck.
      } finally {
        setPending(false);
        setOpen(false);
      }
    })();
  };

  return { open, setOpen, action, matchTitle, pending, finalFocus, request, confirm };
}

export function ActiveMatchCloseConfirm({ state }: { state: ReturnType<typeof useActiveMatchCloseConfirm> }) {
  const t = useTranslations("matchClose");
  const { action } = state;

  return (
    <ConfirmSheet
      open={state.open}
      onOpenChange={state.setOpen}
      title={t(`${action}.title`, { title: state.matchTitle })}
      description={t(`${action}.description`)}
      confirmLabel={t(`${action}.confirm`)}
      cancelLabel={t("cancel")}
      destructive={action === "discard"}
      pending={state.pending}
      onConfirm={state.confirm}
      finalFocus={state.finalFocus}
      testId="active-match-close-confirm"
    />
  );
}
