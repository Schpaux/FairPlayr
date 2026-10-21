"use client";

import { useState, useSyncExternalStore } from "react";
import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/primitives/Button";
import { Sheet } from "@/components/ui/primitives/Sheet";
import { updateForNewerData } from "@/components/pwa/useServiceWorkerUpdate";
import { clientBuildFingerprint, isUpdateLoop, recordUpdateAttempt } from "@/lib/pwa/updateRequiredGuard";
import {
  getServerStorageSignalSnapshot,
  getStorageSignalSnapshot,
  subscribeStorageSignals,
} from "@/lib/storage/storageEnvelope";

/**
 * D4: data on this device was written by a newer version of the app (another
 * tab, or a new deploy that ran before this page). This build will not write
 * over it, so it cannot keep saving. Mounted once by PwaRoot, on every
 * screen, also mid-match.
 *
 * - The action loads the newer build: a waiting worker is activated (the one
 *   sanctioned activation during a match, since only the newer build can
 *   save), else the worker is asked for that build past the match gate, else
 *   the page reloads. See `updateForNewerData`.
 * - Loop guard: one attempt per build and tab. If the same build comes back
 *   and still finds newer data, the sheet says so and can be closed instead
 *   of reloading again. Closed, a 44px cue stays (over the logo, never over
 *   match controls) and opens it again: the condition keeps speaking.
 */
export function UpdateRequiredSheet({ onUpdate }: { onUpdate?: () => void | Promise<void> } = {}) {
  const signals = useSyncExternalStore(
    subscribeStorageSignals,
    getStorageSignalSnapshot,
    getServerStorageSignalSnapshot
  );

  if (signals.newerVersionKeys.length === 0) {
    return null;
  }

  return <UpdateRequiredSheetContent onUpdate={onUpdate ?? updateForNewerData} />;
}

type View = "required" | "stuck" | "closed";

function UpdateRequiredSheetContent({ onUpdate }: { onUpdate: () => void | Promise<void> }) {
  const t = useTranslations("restore.updateRequired");
  const tp = useTranslations("pwa.updateRequired");
  const [build] = useState(() => clientBuildFingerprint());
  const [view, setView] = useState<View>(() => (isUpdateLoop(build) ? "stuck" : "required"));
  const [busy, setBusy] = useState(false);

  if (view === "closed") {
    return (
      <button
        type="button"
        className="fixed z-[60] flex h-11 w-11 items-center justify-center rounded-full"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 6px)",
          left: "max(1rem, env(safe-area-inset-left, 0px))",
          background: "var(--fp-surface)",
          border: "1px solid var(--fp-rule)",
          color: "var(--fp-danger-text)",
        }}
        aria-label={tp("reopen")}
        aria-haspopup="dialog"
        data-testid="update-required-cue"
        onClick={() => setView("stuck")}
      >
        <CircleAlert size={20} strokeWidth={1.75} aria-hidden />
      </button>
    );
  }

  if (view === "stuck") {
    return (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) setView("closed");
        }}
        closeButton={tp("close")}
        title={tp("stuckTitle")}
        description={tp("stuckBody")}
        testId="update-required-sheet"
      />
    );
  }

  return (
    <Sheet
      open
      onOpenChange={() => {
        // Not dismissible: closing would leave a build that cannot save.
      }}
      dismissible={false}
      closeButton={false}
      title={t("title")}
      description={t("body")}
      testId="update-required-sheet"
      actions={
        <Button
          variant="primary"
          block
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            if (busy) return;
            recordUpdateAttempt(build);
            setBusy(true);
            void Promise.resolve(onUpdate()).catch(() => setBusy(false));
          }}
        >
          {busy ? tp("updating") : t("reload")}
        </Button>
      }
    />
  );
}
