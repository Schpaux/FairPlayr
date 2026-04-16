"use client";

import { Pause, Play, RotateCcw, StopCircle } from "lucide-react";
import { FpButton } from "@/components/ui/FpButton";
import { cn } from "@/lib/utils";
import type { LiveMatchStatus } from "@/domain/liveMatch";

interface MatchTimerPanelProps {
  status: LiveMatchStatus;
  timerLabel: string;
  durationLabel: string;
  primaryClock: string;
  secondaryLabel: string;
  statusLabel: string;
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

function statusBadgeClass(status: LiveMatchStatus) {
  if (status === "running") return "bg-fp-accent/15 text-fp-accent border-fp-accent/30";
  if (status === "ended") return "bg-danger/15 text-danger border-danger/30";
  return "bg-fp-surface-2 text-muted-foreground border-fp-border";
}

export function MatchTimerPanel({
  status,
  statusLabel,
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
  const hasBothSecondary = Boolean(canEndHalf && onEndHalf) && status !== "ended";

  return (
    <div className="space-y-3">
      {/* ── Status + phase + duration ─────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              statusBadgeClass(status)
            )}
          >
            {statusLabel}
          </span>
          {phaseLabel ? (
            <span className="text-[11px] font-medium text-muted-foreground">{phaseLabel}</span>
          ) : null}
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">{durationLabel}</span>
      </div>

      {/* ── Clock row ─────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-4xl font-black tracking-tight text-foreground tabular-nums leading-none">
          {primaryClock}
        </p>
        <div className="text-right">
          <p className="text-sm text-muted-foreground tabular-nums leading-tight">{secondaryLabel}</p>
          {stoppageLabel ? (
            <p className="mt-0.5 text-xs font-semibold text-danger tabular-nums">{stoppageLabel}</p>
          ) : null}
        </div>
      </div>

      {/* ── Action buttons ────────────────────────────────────── */}
      <div className="space-y-2">
        {/* Primary: Start second half */}
        {canStartSecondHalf ? (
          <FpButton
            variant="primary"
            size="lg"
            fullWidth
            className="tap-target"
            onClick={onStart}
          >
            <Play size={16} />
            {startSecondHalfLabel ?? startLabel}
          </FpButton>
        ) : null}

        {/* Primary: Start / Resume */}
        {(status === "not_started" || status === "paused") && !canStartSecondHalf ? (
          <FpButton
            variant="primary"
            size="lg"
            fullWidth
            className="tap-target"
            onClick={status === "not_started" ? onStart : onResume}
          >
            {status === "not_started" ? <Play size={16} /> : <RotateCcw size={16} />}
            {status === "not_started" ? startLabel : resumeLabel}
          </FpButton>
        ) : null}

        {/* Primary: Pause */}
        {status === "running" ? (
          <FpButton
            variant="secondary"
            size="lg"
            fullWidth
            className="tap-target"
            onClick={onPause}
          >
            <Pause size={16} />
            {pauseLabel}
          </FpButton>
        ) : null}

        {/* Secondary: End Half + End Match (side by side when both present) */}
        {status !== "ended" ? (
          <div className={cn("grid gap-2", hasBothSecondary ? "grid-cols-2" : "grid-cols-1")}>
            {canEndHalf && onEndHalf ? (
              <FpButton
                variant="secondary"
                size="sm"
                fullWidth
                className="tap-target"
                onClick={onEndHalf}
              >
                {endHalfLabel ?? endLabel}
              </FpButton>
            ) : null}
            <FpButton
              variant="danger"
              size="sm"
              fullWidth
              className="tap-target"
              onClick={onEnd}
            >
              <StopCircle size={14} />
              {endLabel}
            </FpButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
