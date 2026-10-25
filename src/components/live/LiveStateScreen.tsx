"use client";

/**
 * Live state screens (DESIGN.md §7, UI-LIVE-03): loading, error, recovery and
 * "no match" on /match/live use the same full-screen canvas as Live, without
 * the header and bottom nav: a centred column with a 20/600 title, 16px body,
 * errors in words with a glyph, and pill buttons. Loading is a quiet skeleton.
 */

import type { LucideIcon } from "lucide-react";
import { CircleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/primitives";
import styles from "@/components/live/LiveScreen.module.css";

interface LiveStateScreenProps {
  /** Loading shows a skeleton and no text, announced by `label`. */
  loading?: boolean;
  /** Accessible name of the loading state. */
  label?: string;
  icon?: LucideIcon;
  title?: string;
  body?: string;
  /** An error in words (role="alert"), shown above the actions. */
  error?: string | null;
  actions?: React.ReactNode;
  testId?: string;
}

export function LiveStateScreen({ loading, label, icon: Icon, title, body, error, actions, testId }: LiveStateScreenProps) {
  return (
    <div className={styles.stateScreen} data-testid={testId ?? "live-state"} aria-busy={loading || undefined}>
      {loading ? (
        <div className={styles.stateColumn} role="status">
          <span className="sr-only">{label}</span>
          <Skeleton width={44} height={44} radius="pill" />
          <Skeleton width={192} height={24} />
          <Skeleton width={256} height={16} />
        </div>
      ) : (
        <div className={styles.stateColumn}>
          {Icon ? (
            <span className={styles.stateIcon} aria-hidden>
              <Icon size={24} strokeWidth={1.75} />
            </span>
          ) : null}
          {title ? <h1 className={styles.stateTitle}>{title}</h1> : null}
          {body ? <p className={styles.stateBody}>{body}</p> : null}
          {error ? (
            <p className={styles.stateError} role="alert">
              <CircleAlert size={20} strokeWidth={1.75} aria-hidden />
              <span>{error}</span>
            </p>
          ) : null}
          {actions ? <div className={styles.stateActions}>{actions}</div> : null}
        </div>
      )}
    </div>
  );
}
