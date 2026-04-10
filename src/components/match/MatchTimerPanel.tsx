"use client";

import { Pause, Play, RotateCcw, StopCircle } from "lucide-react";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import type { LiveMatchStatus } from "@/domain/liveMatch";

interface MatchTimerPanelProps {
  status: LiveMatchStatus;
  statusLabel: string;
  timerLabel: string;
  durationLabel: string;
  remainingClock: string;
  elapsedClock: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  startLabel: string;
  pauseLabel: string;
  resumeLabel: string;
  endLabel: string;
}

function statusClassName(status: LiveMatchStatus) {
  if (status === "running") {
    return "bg-fp-accent/15 text-fp-accent border-fp-accent/30";
  }

  if (status === "ended") {
    return "bg-danger/15 text-danger border-danger/30";
  }

  return "bg-fp-surface-2 text-muted-foreground border-fp-border";
}

export function MatchTimerPanel({
  status,
  statusLabel,
  timerLabel,
  durationLabel,
  remainingClock,
  elapsedClock,
  onStart,
  onPause,
  onResume,
  onEnd,
  startLabel,
  pauseLabel,
  resumeLabel,
  endLabel,
}: MatchTimerPanelProps) {
  return (
    <AppCard glow={status === "running" ? "primary" : "none"} className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusClassName(status)}`}
        >
          {statusLabel}
        </span>
        <span className="text-xs text-muted-foreground">{durationLabel}</span>
      </div>

      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {timerLabel}
        </p>
        <p className="mt-1 text-5xl font-bold tracking-tight text-foreground tabular-nums">
          {remainingClock}
        </p>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {elapsedClock}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(status === "not_started" || status === "paused") && (
          <FpButton
            variant="primary"
            size="lg"
            className="tap-target col-span-2"
            onClick={status === "not_started" ? onStart : onResume}
          >
            {status === "not_started" ? <Play size={18} /> : <RotateCcw size={18} />}
            {status === "not_started" ? startLabel : resumeLabel}
          </FpButton>
        )}

        {status === "running" && (
          <FpButton
            variant="secondary"
            size="lg"
            className="tap-target col-span-2"
            onClick={onPause}
          >
            <Pause size={18} />
            {pauseLabel}
          </FpButton>
        )}

        {status !== "ended" && (
          <FpButton
            variant="danger"
            size="md"
            className="tap-target col-span-2"
            onClick={onEnd}
          >
            <StopCircle size={16} />
            {endLabel}
          </FpButton>
        )}
      </div>
    </AppCard>
  );
}
