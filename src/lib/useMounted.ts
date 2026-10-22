"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server rendering and the hydration render, true afterwards.
 *
 * Use it to hold back values that only exist in the browser (for example
 * next-themes' `theme`, read from localStorage) until after hydration, so the
 * server HTML and the first client render agree (FP-004 N-5). Unlike a
 * `useEffect` + `useState` pair it causes no extra effect-driven render and
 * is not flagged by react-hooks/set-state-in-effect.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
