// Shared UI primitives (UI-FOUND-01). Spec: DESIGN.md (Modern Sideline).
// New and rebuilt screens use these; the older components in
// src/components/ui/* are migrated page by page (C1–C6), not here.
export { Button, ButtonLink, buttonClassName } from "./Button";
export type { ButtonProps, ButtonLinkProps, ButtonSize, ButtonVariant } from "./Button";
export { Sheet, ConfirmSheet } from "./Sheet";
export type { SheetProps, ConfirmSheetProps } from "./Sheet";
export { Notice } from "./Notice";
export type { NoticeProps, NoticeTone } from "./Notice";
export { ListGroup, ListRow } from "./List";
export type { ListGroupProps, ListRowProps } from "./List";
export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";
export { Skeleton, SkeletonList } from "./Skeleton";
export type { SkeletonProps, SkeletonListProps } from "./Skeleton";
export { SegmentedChoice } from "./SegmentedChoice";
export type { SegmentedChoiceProps, SegmentedOption } from "./SegmentedChoice";
