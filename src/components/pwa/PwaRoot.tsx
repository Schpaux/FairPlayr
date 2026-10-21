"use client";

import { useEffect, useState } from "react";
import { UpdateRequiredSheet } from "@/components/match/UpdateRequiredSheet";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { resolveLocalActiveMatch } from "@/lib/match/activeMatchRecovery";
import { ServiceWorkerRegistrar } from "./ServiceWorkerRegistrar";
import { UpdatePrompt } from "./UpdatePrompt";
import { postMatchActive, useServiceWorkerUpdate } from "./useServiceWorkerUpdate";

/**
 * Service worker registration, the update prompt and the D4 sheet
 * (FP-OFF-01a stream B). Mounted inside ActiveMatchProvider:
 *
 * - A new build is never offered, let alone activated, while a match is
 *   active on this device. The device is read once more at the moment of
 *   consent, because another tab may have started one.
 * - The worker's update gate is told whether a match is active, from this
 *   device's storage (not the provider's first render, which starts empty),
 *   on load, whenever the active match changes (including its end) and when
 *   another tab changes it.
 * - UpdateRequiredSheet (D4) is mounted here once, for every screen.
 */
export function PwaRoot() {
  const { updateReady, updating, applyUpdate } = useServiceWorkerUpdate();
  const { activeMatch } = useActiveMatch();
  const [later, setLater] = useState(false);
  const activeMatchId = activeMatch?.id ?? null;

  useEffect(() => {
    const report = () => {
      void postMatchActive(Boolean(resolveLocalActiveMatch()));
    };
    report();
    window.addEventListener("storage", report);
    return () => window.removeEventListener("storage", report);
  }, [activeMatchId]);

  const show = updateReady && !activeMatch && !later;

  return (
    <>
      <ServiceWorkerRegistrar />
      <UpdateRequiredSheet />
      {show ? (
        <UpdatePrompt
          updating={updating}
          onLater={() => setLater(true)}
          onUpdate={() => {
            if (resolveLocalActiveMatch()) {
              setLater(true);
              return;
            }
            applyUpdate();
          }}
        />
      ) : null}
    </>
  );
}
