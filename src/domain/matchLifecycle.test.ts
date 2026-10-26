import { describe, expect, it } from "vitest";
import {
  isCompletionReplay,
  isEndedRuntimeState,
  planMatchUpdate,
  resolveCompletionEndedAt,
  resolveStartStartedAt,
  type ServerMatchStatus,
} from "@/domain/matchLifecycle";

const ENDED = { status: "ended", events: [] };
const RUNNING = { status: "running", events: [] };

describe("planMatchUpdate: completed is terminal", () => {
  it.each<ServerMatchStatus>(["live", "draft", "upcoming"])("rejects completed → %s", (status) => {
    expect(planMatchUpdate("completed", { status, hasScore: false })).toEqual({
      allowed: false,
      reason: "MATCH_COMPLETED",
    });
  });

  it("rejects a late runtime sync (no status) on a completed match", () => {
    expect(planMatchUpdate("completed", { runtimeState: RUNNING, hasScore: true })).toMatchObject({
      allowed: false,
    });
    expect(planMatchUpdate("completed", { runtimeState: ENDED, hasScore: false })).toMatchObject({
      allowed: false,
    });
  });

  it("rejects a score-only write on a completed match", () => {
    expect(planMatchUpdate("completed", { hasScore: true })).toMatchObject({ allowed: false });
  });

  it("allows report-only writes on a completed match", () => {
    expect(planMatchUpdate("completed", { hasScore: false })).toMatchObject({
      allowed: true,
      timestamps: "keep",
      writeRuntimeState: false,
      writeScore: false,
    });
  });

  it("accepts a repeated completion carrying the final ended state, keeping the end time", () => {
    expect(
      planMatchUpdate("completed", { status: "completed", runtimeState: ENDED, hasScore: true })
    ).toEqual({
      allowed: true,
      timestamps: "keep",
      writeRuntimeState: true,
      writeScore: true,
      requireNotCompleted: false,
    });
  });

  it("keeps a final state already stored when a repeated completion brings another (MATCH-02a)", () => {
    expect(
      planMatchUpdate("completed", { status: "completed", runtimeState: ENDED, hasScore: true }, { runtimeState: ENDED })
    ).toMatchObject({ allowed: true, timestamps: "keep", writeRuntimeState: false, writeScore: false });
    // A server-only finish without a final state still takes the device's.
    expect(
      planMatchUpdate("completed", { status: "completed", runtimeState: ENDED, hasScore: true }, { runtimeState: null })
    ).toMatchObject({ writeRuntimeState: true, writeScore: true });
  });

  it("drops a stale running snapshot or a clear sent with a repeated completion", () => {
    for (const runtimeState of [RUNNING, null]) {
      expect(
        planMatchUpdate("completed", { status: "completed", runtimeState, hasScore: true })
      ).toMatchObject({ allowed: true, timestamps: "keep", writeRuntimeState: false, writeScore: false });
    }
  });

  it("never takes a score without the final state on a repeated completion", () => {
    expect(planMatchUpdate("completed", { status: "completed", hasScore: true })).toMatchObject({
      allowed: true,
      timestamps: "keep",
      writeRuntimeState: false,
      writeScore: false,
    });
  });

  it("keeps the report button (completed + reportEnabled, nothing else) working", () => {
    expect(planMatchUpdate("completed", { status: "completed", hasScore: false })).toMatchObject({
      allowed: true,
      timestamps: "keep",
    });
  });
});

describe("planMatchUpdate: transitions from an open match", () => {
  it.each<ServerMatchStatus>(["draft", "upcoming", "live"])("%s → completed stamps the end", (from) => {
    expect(
      planMatchUpdate(from, { status: "completed", runtimeState: ENDED, hasScore: true })
    ).toEqual({
      allowed: true,
      timestamps: "complete",
      writeRuntimeState: true,
      writeScore: true,
      requireNotCompleted: false,
    });
  });

  it.each<ServerMatchStatus>(["draft", "upcoming", "live"])("%s → live stamps the start", (from) => {
    expect(planMatchUpdate(from, { status: "live", hasScore: false })).toMatchObject({
      allowed: true,
      timestamps: "start",
      requireNotCompleted: true,
    });
  });

  it("guards a runtime sync on a live match against a completion landing first", () => {
    expect(planMatchUpdate("live", { runtimeState: RUNNING, hasScore: true })).toEqual({
      allowed: true,
      timestamps: "keep",
      writeRuntimeState: true,
      writeScore: true,
      requireNotCompleted: true,
    });
  });
});

describe("isEndedRuntimeState", () => {
  it("is true only for an ended live state", () => {
    expect(isEndedRuntimeState(ENDED)).toBe(true);
    expect(isEndedRuntimeState(RUNNING)).toBe(false);
    expect(isEndedRuntimeState(null)).toBe(false);
    expect(isEndedRuntimeState("ended")).toBe(false);
  });
});

describe("resolveCompletionEndedAt", () => {
  const STARTED = "2026-10-15T15:30:00.000Z";
  const ENDED = "2026-10-15T16:30:00.000Z";
  const NEXT_MORNING_MS = Date.parse("2026-10-16T06:05:00.000Z");

  it("keeps the device's end time when the completion syncs hours later", () => {
    expect(
      resolveCompletionEndedAt({ requestedEndedAt: ENDED, startedAt: STARTED, nowMs: NEXT_MORNING_MS })
    ).toBe(ENDED);
  });

  it("falls back to the ended runtime state's end time (older clients)", () => {
    expect(
      resolveCompletionEndedAt({
        runtimeState: { status: "ended", endedAt: ENDED },
        startedAt: STARTED,
        nowMs: NEXT_MORNING_MS,
      })
    ).toBe(ENDED);
  });

  it("prefers the sent end time over the runtime state's", () => {
    expect(
      resolveCompletionEndedAt({
        requestedEndedAt: ENDED,
        runtimeState: { status: "ended", endedAt: "2026-10-15T16:31:00.000Z" },
        startedAt: STARTED,
        nowMs: NEXT_MORNING_MS,
      })
    ).toBe(ENDED);
  });

  it("ignores the end time inside a state that is not ended", () => {
    expect(
      resolveCompletionEndedAt({
        runtimeState: { status: "running", endedAt: ENDED },
        startedAt: STARTED,
        nowMs: NEXT_MORNING_MS,
      })
    ).toBe(new Date(NEXT_MORNING_MS).toISOString());
  });

  it("uses now when nothing usable is sent", () => {
    for (const requestedEndedAt of [undefined, null, "", "not a date"]) {
      expect(
        resolveCompletionEndedAt({ requestedEndedAt, startedAt: STARTED, nowMs: NEXT_MORNING_MS })
      ).toBe(new Date(NEXT_MORNING_MS).toISOString());
    }
  });

  it("pulls a device time in the future back to now, but tolerates small skew", () => {
    const nowMs = Date.parse(ENDED);
    expect(
      resolveCompletionEndedAt({ requestedEndedAt: "2026-10-15T18:00:00.000Z", startedAt: STARTED, nowMs })
    ).toBe(ENDED);
    expect(
      resolveCompletionEndedAt({ requestedEndedAt: "2026-10-15T16:32:00.000Z", startedAt: STARTED, nowMs })
    ).toBe(ENDED);
  });

  it("never ends a match before the server's start time", () => {
    expect(
      resolveCompletionEndedAt({
        requestedEndedAt: "2026-10-15T15:00:00.000Z",
        startedAt: STARTED,
        nowMs: NEXT_MORNING_MS,
      })
    ).toBe(STARTED);
  });
});

describe("isCompletionReplay", () => {
  const COMPLETED = { status: "completed" as const, reportStatus: "ready" as const, runtimeState: ENDED };

  it("recognises a device completion arriving again for a completed match", () => {
    expect(
      isCompletionReplay(COMPLETED, { status: "completed", runtimeState: ENDED, hasScore: true })
    ).toBe(true);
    // A device that had no live state still sends its score.
    expect(isCompletionReplay(COMPLETED, { status: "completed", hasScore: true })).toBe(true);
    expect(
      isCompletionReplay({ ...COMPLETED, reportStatus: "pending" }, { status: "completed", runtimeState: ENDED, hasScore: true })
    ).toBe(true);
    expect(
      isCompletionReplay({ ...COMPLETED, reportStatus: "failed" }, { status: "completed", runtimeState: ENDED, hasScore: true })
    ).toBe(true);
  });

  it("is never a replay while the match is not completed yet", () => {
    for (const status of ["draft", "upcoming", "live"] as const) {
      expect(
        isCompletionReplay({ ...COMPLETED, status }, { status: "completed", runtimeState: ENDED, hasScore: true })
      ).toBe(false);
    }
  });

  it("keeps the report button (a bare completion) and explicit requests as report requests", () => {
    expect(isCompletionReplay(COMPLETED, { status: "completed", hasScore: false })).toBe(false);
    expect(
      isCompletionReplay(COMPLETED, { status: "completed", runtimeState: ENDED, hasScore: true, reportStatus: "pending" })
    ).toBe(false);
  });

  it("is not a replay when no report was ever requested", () => {
    expect(
      isCompletionReplay(
        { ...COMPLETED, reportStatus: "not_requested" },
        { status: "completed", runtimeState: ENDED, hasScore: true }
      )
    ).toBe(false);
  });

  it("is not a replay when it brings the first ended state to a server-only finish", () => {
    expect(
      isCompletionReplay(
        { ...COMPLETED, runtimeState: RUNNING },
        { status: "completed", runtimeState: ENDED, hasScore: true }
      )
    ).toBe(false);
    expect(
      isCompletionReplay(
        { ...COMPLETED, runtimeState: null },
        { status: "completed", runtimeState: ENDED, hasScore: true }
      )
    ).toBe(false);
  });

  it("ignores writes that are not completions", () => {
    expect(isCompletionReplay(COMPLETED, { runtimeState: ENDED, hasScore: true })).toBe(false);
  });
});

describe("resolveStartStartedAt", () => {
  const NOW = Date.parse("2026-10-26T18:00:00.000Z");

  it("a start synced later keeps the coach's start time on the device", () => {
    expect(resolveStartStartedAt({ requestedStartedAt: "2026-10-26T17:31:00.000Z", nowMs: NOW })).toBe(
      "2026-10-26T17:31:00.000Z"
    );
  });

  it("without a usable device time it is the server's now; slightly ahead is pulled back, far ahead is not trusted", () => {
    expect(resolveStartStartedAt({ nowMs: NOW })).toBe("2026-10-26T18:00:00.000Z");
    expect(resolveStartStartedAt({ requestedStartedAt: "nonsense", nowMs: NOW })).toBe("2026-10-26T18:00:00.000Z");
    expect(resolveStartStartedAt({ requestedStartedAt: "2026-10-26T18:02:00.000Z", nowMs: NOW })).toBe(
      "2026-10-26T18:00:00.000Z"
    );
    expect(resolveStartStartedAt({ requestedStartedAt: "2026-10-27T18:00:00.000Z", nowMs: NOW })).toBe(
      "2026-10-26T18:00:00.000Z"
    );
  });
});

