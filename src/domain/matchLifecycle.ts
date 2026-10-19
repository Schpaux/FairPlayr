/**
 * Server-side match status transitions (FP-P0-F2).
 *
 * `completed` is terminal: once a match is completed it never becomes live,
 * draft or upcoming again, and a late live-screen write (runtime state or
 * score without a status) can never overwrite its final state.
 *
 * Writes that stay allowed on a completed match:
 * - a repeated completion (offline retry, a second device, the report button),
 *   which keeps the original end time;
 * - its final runtime state and score, but only when that state is an ended
 *   match (the device's real result arriving after a server-only finish);
 * - report fields.
 */

export type ServerMatchStatus = "draft" | "upcoming" | "live" | "completed";

export interface MatchUpdateRequest {
  status?: ServerMatchStatus;
  /** undefined = not sent; null = clear it. */
  runtimeState?: Record<string, unknown> | null;
  hasScore: boolean;
}

export type MatchUpdatePlan =
  | { allowed: false; reason: "MATCH_COMPLETED" }
  | {
      allowed: true;
      /** Which status timestamps to write. */
      timestamps: "start" | "complete" | "reset" | "keep";
      writeRuntimeState: boolean;
      writeScore: boolean;
      /**
       * True when the update may only apply while the row is still not
       * completed, so a completion that lands between the read and the write
       * still wins. The service adds this as a condition on the UPDATE itself.
       */
      requireNotCompleted: boolean;
    };

export function isEndedRuntimeState(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).status === "ended"
  );
}

export function planMatchUpdate(
  currentStatus: ServerMatchStatus,
  request: MatchUpdateRequest
): MatchUpdatePlan {
  const sendsRuntime = request.runtimeState !== undefined;

  if (currentStatus === "completed") {
    if (request.status !== undefined && request.status !== "completed") {
      return { allowed: false, reason: "MATCH_COMPLETED" };
    }

    if (request.status === undefined && (sendsRuntime || request.hasScore)) {
      return { allowed: false, reason: "MATCH_COMPLETED" };
    }

    // Repeated completion. Only an ended runtime state may replace the stored
    // one (and bring its score); anything else — a clear from a recovery
    // action, a stale running snapshot — is dropped so the history stays.
    const acceptsFinalState = sendsRuntime && isEndedRuntimeState(request.runtimeState);

    return {
      allowed: true,
      timestamps: "keep",
      writeRuntimeState: acceptsFinalState,
      // The score belongs to that final state; never on its own.
      writeScore: request.hasScore && acceptsFinalState,
      requireNotCompleted: false,
    };
  }

  if (request.status === "completed") {
    return {
      allowed: true,
      timestamps: "complete",
      writeRuntimeState: sendsRuntime,
      writeScore: request.hasScore,
      requireNotCompleted: false,
    };
  }

  return {
    allowed: true,
    timestamps:
      request.status === undefined ? "keep" : request.status === "live" ? "start" : "reset",
    writeRuntimeState: sendsRuntime,
    writeScore: request.hasScore,
    requireNotCompleted: true,
  };
}

/**
 * Clock skew allowed between the device and the server before a device end
 * time "in the future" is pulled back to the server's now.
 */
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The `ended_at` to store when a match becomes completed.
 *
 * A match ended offline keeps the time the coach ended it on the device, not
 * the time the completion finally reached the server. In order of preference:
 * the end time sent with the completion, the end time inside the ended
 * runtime state (older clients that do not send it), then the server's now.
 *
 * The device's clock is not trusted blindly: a time more than a few minutes
 * in the future becomes now, and a time before the server's `started_at`
 * becomes `started_at`, so a match never ends before it started.
 *
 * Only used for the transition to completed. A repeated completion keeps the
 * stored end time (see planMatchUpdate, timestamps "keep").
 */
export function resolveCompletionEndedAt(input: {
  requestedEndedAt?: string | null;
  runtimeState?: Record<string, unknown> | null;
  startedAt: string | null;
  nowMs: number;
}): string {
  const fromRuntime = isEndedRuntimeState(input.runtimeState)
    ? parseIsoMs((input.runtimeState as Record<string, unknown>).endedAt)
    : null;
  const deviceMs = parseIsoMs(input.requestedEndedAt) ?? fromRuntime;

  if (deviceMs === null || deviceMs > input.nowMs + MAX_FUTURE_SKEW_MS) {
    return new Date(input.nowMs).toISOString();
  }

  const startedMs = parseIsoMs(input.startedAt);
  const endedMs = Math.min(input.nowMs, startedMs === null ? deviceMs : Math.max(deviceMs, startedMs));

  return new Date(endedMs).toISOString();
}

export type MatchReportStatusValue = "not_requested" | "pending" | "ready" | "failed";

/**
 * True when a completion request that reaches an already completed match is a
 * replay of the device's own completion (an offline retry, a lost response, a
 * second tab, a reload) and not a request for a report.
 *
 * A replay must not regenerate, reset or clear the report: the match did not
 * end again. It is recognised by the match data a device completion always
 * carries (score and/or runtime state). The report button sends a bare
 * completion (`status` + `reportEnabled`) and stays a report request, as does
 * an explicit `reportStatus: "pending"`.
 *
 * Not a replay, so the report rules apply as for a new completion:
 * - no report was ever requested for the match (`not_requested`), so
 *   generating one is not a duplicate;
 * - the request brings the device's ended final state to a match that was
 *   completed without one (server-only finish): the report would be about a
 *   different result.
 */
export function isCompletionReplay(
  existing: {
    status: ServerMatchStatus;
    reportStatus: MatchReportStatusValue;
    runtimeState: Record<string, unknown> | null;
  },
  request: MatchUpdateRequest & { reportStatus?: MatchReportStatusValue }
): boolean {
  if (existing.status !== "completed" || request.status !== "completed") {
    return false;
  }

  if (request.reportStatus === "pending") {
    return false;
  }

  const carriesMatchData = request.runtimeState !== undefined || request.hasScore;

  if (!carriesMatchData || existing.reportStatus === "not_requested") {
    return false;
  }

  const bringsFirstFinalState =
    isEndedRuntimeState(request.runtimeState) && !isEndedRuntimeState(existing.runtimeState);

  return !bringsFirstFinalState;
}
