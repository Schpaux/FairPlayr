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
  primaryClock: string;
  secondaryLabel: string;
  phaseLabel?: string;
  stoppageLabel?: string | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onEndHalf?: () => void;
  startLabel: string;
  pauseLabel: string;
  resumeLabel: string;
  endLabel: string;
  endHalfLabel?: string;
  startSecondHalfLabel?: string;
  canEndHalf?: boolean;
  canStartSecondHalf?: boolean;
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
  primaryClock,
  secondaryLabel,
  phaseLabel,
  stoppageLabel,
  onStart,
  onPause,
  onResume,
  onEnd,
  onEndHalf,
  startLabel,
  pauseLabel,
  resumeLabel,
  endLabel,
  endHalfLabel,
  startSecondHalfLabel,
  canEndHalf,
  canStartSecondHalf,
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
        {phaseLabel ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {phaseLabel}
          </p>
        ) : null}
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {timerLabel}
        </p>
        <p className="mt-1 text-5xl font-bold tracking-tight text-foreground tabular-nums">
          {primaryClock}
        </p>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {secondaryLabel}
        </p>
        {stoppageLabel ? (
          <p className="mt-1 text-xs font-semibold text-danger tabular-nums">
            {stoppageLabel}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {canStartSecondHalf ? (
          <FpButton
            variant="primary"
            size="lg"
            className="tap-target col-span-2"
            onClick={onStart}
          >
            <Play size={18} />
            {startSecondHalfLabel ?? startLabel}
          </FpButton>
        ) : null}

        {(status === "not_started" || status === "paused") && (
          <FpButton
            variant="primary"
            size="lg"
            className="tap-target col-span-2"
            onClick={status === "not_started" ? onStart : onResume}
            disabled={Boolean(canStartSecondHalf)}
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

        {canEndHalf && onEndHalf ? (
          <FpButton
            variant="secondary"
            size="md"
            className="tap-target col-span-2"
            onClick={onEndHalf}
          >
            {endHalfLabel ?? endLabel}
          </FpButton>
        ) : null}
      </div>
    </AppCard>
  );
}
