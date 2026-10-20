"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";
import { buttonClassName, Button } from "./Button";
import styles from "./primitives.module.css";

/**
 * Sheet and ConfirmSheet (UI-FOUND-01, DESIGN.md §5.5), built on base-ui
 * Dialog: a modal bottom sheet with a scrim, a `canvas` fill, a 20px top
 * radius, a grab handle and a 20/600 title.
 *
 * Accessibility comes from the Dialog: `role="dialog"`, labelled by the title
 * and described by the description; focus is trapped while open, the page
 * behind is inert and does not scroll, Escape closes, and focus returns to
 * the control that had it before opening (or `finalFocus`). On open, focus
 * goes to the title, so a screen reader reads it first and Enter can never
 * hit a confirm button by accident.
 *
 * The sheet is controlled: the caller owns `open` and gets `onOpenChange`.
 */

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** One or two lines under the title; announced as the dialog description. */
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons in the footer, stacked full width above the close button. */
  actions?: ReactNode;
  /**
   * Escape and a scrim tap close the sheet unless this is false (for example
   * the scorer sheet). A non-dismissible sheet still needs a visible way out
   * (the close button or an action such as "Hopp over"): touch screen readers
   * have no reliable Escape.
   */
  dismissible?: boolean;
  /**
   * The full-width secondary close button at the bottom. `true` uses the
   * default label ("Lukk"), a string replaces it, and `false` hides it when
   * the content already has a cancel action (as `ConfirmSheet` does).
   */
  closeButton?: boolean | string;
  /** Element to focus on open instead of the title. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Element to focus on close instead of the previously focused control. */
  finalFocus?: RefObject<HTMLElement | null>;
  testId?: string;
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  dismissible = true,
  closeButton = true,
  initialFocus,
  finalFocus,
  testId,
}: SheetProps) {
  const t = useTranslations("ui.sheet");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeLabel = typeof closeButton === "string" ? closeButton : t("close");

  if (process.env.NODE_ENV !== "production" && !dismissible && closeButton === false && !actions) {
    console.error("Sheet: a non-dismissible sheet needs a close button or actions, or it traps the user.");
  }

  return (
    <Dialog.Root
      open={open}
      disablePointerDismissal={!dismissible}
      onOpenChange={(next, details) => {
        if (!next && !dismissible && details.reason === "escape-key") {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.scrim} />
        <Dialog.Popup
          className={styles.sheet}
          initialFocus={initialFocus ?? titleRef}
          finalFocus={finalFocus}
          data-testid={testId}
        >
          <div className={styles.grab} aria-hidden />
          <Dialog.Title ref={titleRef} tabIndex={-1} className={styles.sheetTitle}>
            {title}
          </Dialog.Title>
          {description ? (
            <Dialog.Description className={styles.sheetDescription}>{description}</Dialog.Description>
          ) : null}
          {children ? <div className={styles.sheetBody}>{children}</div> : null}
          {actions || closeButton !== false ? (
            <div className={styles.sheetActions}>
              {actions}
              {closeButton !== false ? (
                <Dialog.Close className={buttonClassName({ variant: "secondary", block: true })}>
                  {closeLabel}
                </Dialog.Close>
              ) : null}
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface ConfirmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** States the outcome as a question: "Avslutte kampen nå?" */
  title: ReactNode;
  /** The consequence, with numbers where they exist: "Stillingen er 2–1 etter 38 min." */
  description?: ReactNode;
  /** States the outcome: "Ja, avslutt kampen". */
  confirmLabel: string;
  /** Defaults to "Avbryt"; live uses "Fortsett å spille". */
  cancelLabel?: string;
  /** Red fill. Only for actions that delete or end something. */
  destructive?: boolean;
  /**
   * While the action runs the confirm button ignores presses (no double
   * submit). It uses `aria-disabled`, not `disabled`, so focus stays on it.
   * Cancel, Escape and the scrim still close the sheet; they do not abort an
   * action already started.
   */
  pending?: boolean;
  /** The caller performs the action and closes the sheet. */
  onConfirm: () => void;
  testId?: string;
}

/**
 * A confirmation: the title states the outcome, the description the
 * consequence, the primary button repeats the outcome, and the secondary
 * cancel sits under it, nearest the thumb. Escape and the scrim cancel.
 */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  pending = false,
  onConfirm,
  testId,
}: ConfirmSheetProps) {
  const t = useTranslations("ui.confirm");

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      closeButton={false}
      testId={testId}
      actions={
        <>
          <Button
            variant={destructive ? "destructive" : "primary"}
            block
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            onClick={() => {
              if (!pending) onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
          <Dialog.Close className={buttonClassName({ variant: "secondary", block: true })}>
            {cancelLabel ?? t("cancel")}
          </Dialog.Close>
        </>
      }
    />
  );
}
