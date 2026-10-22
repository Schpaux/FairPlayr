"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button, Sheet } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { SpondImportPreviewCandidate } from "./types";

/**
 * UI-SPOND-01: choose who to import from the linked Spond group.
 *
 * One flat hairline list (no nested scroll: the sheet itself scrolls), where
 * the whole row is the label of a real checkbox, at least 44px tall. «Velg
 * alle» / «Tøm» sit above the list and the «Importer N» button stays in view
 * at the bottom while the list scrolls. The caller owns the selection and the
 * preview/import requests; this component only presents them.
 */

export interface SpondImportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: SpondImportPreviewCandidate[];
  selectedIds: string[];
  loading: boolean;
  importing: boolean;
  onToggle: (externalId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onImport: () => void;
  /** A `Notice` for the outcome of the preview or the import, shown by the button. */
  feedback?: ReactNode;
}

export function SpondImportSheet({
  open,
  onOpenChange,
  candidates,
  selectedIds,
  loading,
  importing,
  onToggle,
  onSelectAll,
  onClearAll,
  onImport,
  feedback,
}: SpondImportSheetProps) {
  const t = useTranslations("team.spond");
  const selectedCount = selectedIds.length;
  const hasCandidates = candidates.length > 0;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("preview.title")}
      description={t("preview.helperText")}
      testId="spond-import-sheet"
    >
      <div className="space-y-3" aria-busy={loading || undefined}>
        {loading ? (
          <p role="status" className="text-sm text-fp-ink-2">
            {t("preview.loading")}
          </p>
        ) : null}

        {!loading && hasCandidates ? (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Button size="sm" variant="ghost" onClick={onSelectAll} disabled={importing}>
                {t("preview.selectAll")}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClearAll} disabled={importing}>
                {t("preview.clearAll")}
              </Button>
              <p aria-live="polite" aria-atomic="true" className="ml-auto text-sm font-medium tabular-nums text-fp-ink-2">
                {t("preview.selectedCount", { count: selectedCount })}
              </p>
            </div>

            <ul
              role="list"
              aria-label={t("preview.listLabel")}
              className="divide-y divide-fp-rule overflow-hidden rounded-[14px] border border-fp-rule bg-fp-surface"
            >
              {candidates.map((candidate) => {
                const checked = selectedIds.includes(candidate.externalId);
                const disabled = !candidate.selectable || importing;
                return (
                  // The sticky import footer (~120 px) must not cover a focused row (SC 2.4.11).
                  <li key={candidate.externalId} className="scroll-mb-36">
                    <label
                      className={cn(
                        "flex min-h-[44px] items-center gap-3 px-3.5 py-2.5",
                        disabled ? "cursor-default" : "cursor-pointer active:bg-fp-surface-2",
                        !candidate.selectable && "text-fp-ink-2"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(candidate.externalId)}
                        disabled={disabled}
                        className="h-5 w-5 shrink-0 accent-fp-lime"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium leading-snug [overflow-wrap:anywhere]">
                          {candidate.name}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] leading-tight">
                          <ClassificationBadge classification={candidate.importClassification} />
                          <span className="text-fp-ink-2">
                            {candidate.status === "already-imported"
                              ? t("preview.statusAlreadyImported")
                              : candidate.status === "existing-player"
                                ? t("preview.statusExisting")
                                : t("preview.statusNew")}
                          </span>
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {/* Feedback and the import button stay together, in view at the bottom. */}
        {feedback || hasCandidates ? (
          <div className="sticky bottom-0 space-y-3 bg-fp-canvas pt-1 pb-1">
            {feedback}
            {hasCandidates && !loading ? (
              <Button
                variant="primary"
                block
                // aria-disabled while importing: no double submit, focus stays.
                onClick={() => {
                  if (!importing) onImport();
                }}
                disabled={selectedCount === 0}
                aria-disabled={importing || undefined}
                aria-busy={importing || undefined}
              >
                {importing ? t("preview.importing") : t("preview.importCount", { count: selectedCount })}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

function ClassificationBadge({ classification }: { classification: SpondImportPreviewCandidate["importClassification"] }) {
  const t = useTranslations("team.spond.preview");
  const label =
    classification === "likely_player"
      ? t("classificationPlayer")
      : classification === "likely_staff"
        ? t("classificationStaff")
        : t("classificationUnknown");

  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 font-semibold",
        classification === "likely_player"
          ? "border-fp-ok-text/40 bg-fp-ok-text/10 text-fp-ok-text"
          : classification === "likely_staff"
            ? "border-fp-warn-text/40 bg-fp-warn-text/10 text-fp-warn-text"
            : "border-fp-rule bg-fp-surface-2 text-fp-ink-2"
      )}
    >
      {label}
    </span>
  );
}
