"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { postLocale } from "./useServiceWorkerUpdate";

/**
 * Tells the worker which locale the coach uses, so `/` offline opens it
 * (FP-OFF-01 §S.6). Renders nothing. Registration itself happens in
 * `useServiceWorkerUpdate` (one registration per page).
 */
export function ServiceWorkerRegistrar() {
  const locale = useLocale();

  useEffect(() => {
    postLocale(locale);
  }, [locale]);

  return null;
}
