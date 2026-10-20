"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import styles from "./primitives.module.css";

/**
 * Skeleton (UI-FOUND-01): a static `surface-2` placeholder shaped like the
 * content it stands in for. It never pulses or shimmers (no ambient motion,
 * DESIGN.md §4). A single `Skeleton` is decorative; wrap a loading region in
 * `SkeletonList` (or give it `role="status"` and a label) so screen readers
 * hear "Laster …". A live region mounted together with its text is announced
 * on a best-effort basis; when it matters, keep a persistent status region in
 * the caller and put `aria-busy` on the region being loaded.
 */

const RADIUS = { tag: 6, input: 10, group: 14, pill: 999 } as const;

export interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: keyof typeof RADIUS;
  className?: string;
}

export function Skeleton({ width = "100%", height = 16, radius = "tag", className }: SkeletonProps) {
  return (
    <span
      className={cn(styles.skeleton, className)}
      style={{ width, height, borderRadius: RADIUS[radius] }}
      aria-hidden
    />
  );
}

export interface SkeletonListProps {
  /** Number of placeholder rows. */
  rows?: number;
  /** Show a second, shorter line in each row. */
  withDescription?: boolean;
  /** Overrides the announced label ("Laster …"). */
  label?: string;
  className?: string;
  testId?: string;
}

/** A `ListGroup`-shaped loading placeholder, announced once as "Laster …". */
export function SkeletonList({ rows = 3, withDescription = false, label, className, testId }: SkeletonListProps) {
  const t = useTranslations("ui");

  return (
    <div role="status" className={cn(styles.skeletonList, className)} data-testid={testId}>
      <span className={styles.srOnly}>{label ?? t("loading")}</span>
      <ul className={styles.listGroup} aria-hidden>
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className={styles.listItem}>
            <div className={styles.row}>
              <span className={styles.rowText}>
                <Skeleton width={index % 2 === 0 ? "62%" : "48%"} height={16} className={styles.skeletonLine} />
                {withDescription ? <Skeleton width="34%" height={12} className={styles.skeletonLine} /> : null}
              </span>
              <Skeleton width={28} height={16} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
