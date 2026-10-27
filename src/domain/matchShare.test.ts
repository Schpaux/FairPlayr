// FEAT-SHARE-01: sharing rights (age group, level) and the public answer's
// filter. The database filters first; these rules apply again on our server,
// so nothing a level hides reaches the page even if the database sent it.
import { describe, expect, it } from "vitest";
import {
  allowedDetailLevels,
  buildFactualSummary,
  defaultDetailLevel,
  generateShareToken,
  isShareToken,
  kickoffFromTimeOfDay,
  normalizeKickoffAt,
  normalizeShareSettings,
  publicDataStatus,
  publicRefreshIntervalMs,
  publicSummaryBasis,
  sanitizePublicMatchShare,
  timeOfDayOf,
  withAgeGroup,
} from "@/domain/matchShare";

const TOKEN = "a".repeat(43);

/** Everything a careless database answer could carry, including trainer data. */
function rawAnswer(overrides: Record<string, unknown> = {}) {
  return {
    phase: "completed",
    teamName: "Lyn G10",
    opponentName: "Strindheim",
    startsAt: "2026-10-26T10:00:00.000Z",
    shareLive: true,
    shareSummary: true,
    detailLevel: "detailed",
    live: {
      updatedAt: "2026-10-26T10:20:00.000Z",
      phase: "first_half",
      status: "running",
      halves: 2,
      regularSecondsPerHalf: 1500,
      phaseStartedAtElapsedMs: 0,
      clock: { startedAtMs: 1000, pausedAtMs: null, accumulatedPausedMs: 0, isRunning: true },
      onFieldPlayerIds: ["p1"],
    },
    score: { for: 9, against: 9 },
    goals: [
      { minute: 3, side: "own", scorer: "Frida", assist: "Ida", primaryPlayerId: "p1", playerMinutes: 25 },
      { minute: 8, side: "opponent", scorer: "Leaked", assist: "Leaked" },
    ],
    summary: { status: "ready", text: "Lyn vant.", generatedAt: "2026-10-26T11:00:00.000Z" },
    playingTime: { p1: 25 },
    attendance: ["p1"],
    reportText: "Intern rapport",
    notes: "trenernotat",
    ...overrides,
  };
}

describe("sharing rights", () => {
  it("defaults to match status for children and unknown age, and keeps names for 13 and over only", () => {
    expect(defaultDetailLevel("child")).toBe("status");
    expect(defaultDetailLevel("unknown")).toBe("status");
    expect(allowedDetailLevels("child")).toEqual(["status", "result"]);
    expect(allowedDetailLevels("unknown")).toEqual(["status", "result"]);
    expect(allowedDetailLevels("youth")).toEqual(["status", "result", "detailed"]);
  });

  it("never lets names through for children or unknown age, whatever is asked", () => {
    expect(normalizeShareSettings({ live: true, detailLevel: "detailed", ageGroup: "child" }).detailLevel).toBe("result");
    expect(normalizeShareSettings({ live: true, detailLevel: "detailed" }).detailLevel).toBe("result");
    expect(normalizeShareSettings({ live: true, detailLevel: "detailed", ageGroup: "youth" }).detailLevel).toBe("detailed");
  });

  it("is off by default and only on for an explicit true", () => {
    expect(normalizeShareSettings({})).toEqual({ live: false, summary: false, lineup: false, detailLevel: "status", ageGroup: "unknown" });
    expect(normalizeShareSettings({ live: "true", summary: 1 })).toMatchObject({ live: false, summary: false });
  });

  it("moves a detailed share back when the age group changes to one without names", () => {
    const youth = normalizeShareSettings({ live: true, detailLevel: "detailed", ageGroup: "youth" });
    expect(withAgeGroup(youth, "child").detailLevel).toBe("status");
    expect(withAgeGroup({ ...youth, detailLevel: "result" }, "child").detailLevel).toBe("result");
  });
});

describe("share token", () => {
  it("is 43 base64url characters and different every time", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(isShareToken(a)).toBe(true);
    expect(isShareToken(b)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("rejects anything else", () => {
    expect(isShareToken("short")).toBe(false);
    expect(isShareToken(`${TOKEN}=`)).toBe(false);
    expect(isShareToken("a".repeat(42) + "/")).toBe(false);
  });
});

describe("public answer: hidden fields", () => {
  it("keeps only the known keys, never trainer data", () => {
    const share = sanitizePublicMatchShare(rawAnswer({ phase: "live", detailLevel: "result" }))!;
    const json = JSON.stringify(share);
    for (const leaked of ["playingTime", "attendance", "reportText", "notes", "trenernotat", "onFieldPlayerIds", "primaryPlayerId", "playerMinutes", "Intern"]) {
      expect(json).not.toContain(leaked);
    }
  });

  it("match status: no score, no goals, no names, in every phase", () => {
    for (const phase of ["upcoming", "live", "completed"]) {
      const share = sanitizePublicMatchShare(rawAnswer({ phase, detailLevel: "status" }))!;
      expect(share.score).toBeNull();
      expect(share.goals).toBeNull();
      expect(JSON.stringify(share)).not.toContain("Frida");
    }
  });

  it("result without names: the match's own score, and goal minutes only", () => {
    const share = sanitizePublicMatchShare(rawAnswer({ detailLevel: "result" }))!;
    expect(share.goals).toEqual([
      { minute: 3, side: "own" },
      { minute: 8, side: "opponent" },
    ]);
    // The result is the match's score, even when the timeline lacks goals
    // (older matches); the goal list is the timeline only.
    expect(share.score).toEqual({ for: 9, against: 9 });
    expect(JSON.stringify(share)).not.toMatch(/Frida|Ida|Leaked/);
  });

  it("an answer without a score counts the goal list; a malformed one is never trusted", () => {
    expect(sanitizePublicMatchShare(rawAnswer({ detailLevel: "result", score: undefined }))!.score).toEqual({ for: 1, against: 1 });
    expect(sanitizePublicMatchShare(rawAnswer({ detailLevel: "result", score: { for: "9", against: -2 } }))!.score).toEqual({
      for: 1,
      against: 0,
    });
    expect(sanitizePublicMatchShare(rawAnswer({ detailLevel: "result", goals: undefined }))!.score).toEqual({ for: 9, against: 9 });
  });

  it("detailed: names on own goals only", () => {
    const share = sanitizePublicMatchShare(rawAnswer({ detailLevel: "detailed" }))!;
    expect(share.goals).toEqual([
      { minute: 3, side: "own", scorer: "Frida", assist: "Ida" },
      { minute: 8, side: "opponent" },
    ]);
  });

  it("with only «Del oppsummering», a running match has no live data", () => {
    const share = sanitizePublicMatchShare(rawAnswer({ phase: "live", shareLive: false, detailLevel: "result" }))!;
    expect(share.live).toBeNull();
    expect(share.score).toBeNull();
    expect(share.goals).toBeNull();
  });

  it("before the match there is no live data, score or summary", () => {
    const share = sanitizePublicMatchShare(rawAnswer({ phase: "upcoming", detailLevel: "result" }))!;
    expect(share.live).toBeNull();
    expect(share.score).toBeNull();
    expect(share.summary).toBeNull();
  });

  it("with only «Del live», the finished match shows its final status and no summary", () => {
    const share = sanitizePublicMatchShare(rawAnswer({ shareSummary: false, detailLevel: "result" }))!;
    expect(share.summary).toBeNull();
    expect(share.score).toEqual({ for: 9, against: 9 });
  });

  it("a summary that is not ready carries no text", () => {
    const share = sanitizePublicMatchShare(rawAnswer({ summary: { status: "pending", text: "draft" } }))!;
    expect(share.summary).toEqual({ status: "pending", text: null, generatedAt: null });
  });

  it("a turned-off or malformed answer is no share", () => {
    expect(sanitizePublicMatchShare(null)).toBeNull();
    expect(sanitizePublicMatchShare(rawAnswer({ shareLive: false, shareSummary: false }))).toBeNull();
    expect(sanitizePublicMatchShare(rawAnswer({ detailLevel: "everything" }))).toBeNull();
  });
});

/** A stored summary written from exactly the data in `raw`. */
function withCurrentSummary(raw: Record<string, unknown>, text = "Lyn vant.") {
  const view = sanitizePublicMatchShare({ ...raw, summary: undefined })!;
  return { ...raw, summary: { status: "ready", text, generatedAt: "2026-10-26T11:00:00.000Z", basis: publicSummaryBasis(view) } };
}

describe("public summary: only from the current data", () => {
  it("shows a summary written from the data the page shows now", () => {
    const share = sanitizePublicMatchShare(withCurrentSummary(rawAnswer({ detailLevel: "result" })))!;
    expect(share.summary).toEqual({ status: "ready", text: "Lyn vant.", generatedAt: "2026-10-26T11:00:00.000Z" });
    expect(JSON.stringify(share)).not.toContain("basis");
  });

  it("hides the old text once the result or a goal is corrected, or without a basis", () => {
    const written = withCurrentSummary(rawAnswer({ detailLevel: "result" }));
    const pending = { status: "pending", text: null, generatedAt: null };
    expect(sanitizePublicMatchShare({ ...written, score: { for: 2, against: 1 } })!.summary).toEqual(pending);
    expect(sanitizePublicMatchShare({ ...written, goals: [{ minute: 4, side: "own" }] })!.summary).toEqual(pending);
    expect(sanitizePublicMatchShare(rawAnswer())!.summary).toEqual(pending);
  });

  it("a scorer corrected at the detailed level is a different basis; one hidden by the level is not", () => {
    const detailed = rawAnswer({ detailLevel: "detailed" });
    const base = publicSummaryBasis(sanitizePublicMatchShare(detailed)!);
    const renamed = { ...detailed, goals: [{ minute: 3, side: "own", scorer: "Ida" }, { minute: 8, side: "opponent" }] };
    expect(publicSummaryBasis(sanitizePublicMatchShare(renamed)!)).not.toBe(base);

    const result = rawAnswer({ detailLevel: "result" });
    expect(publicSummaryBasis(sanitizePublicMatchShare({ ...result, goals: renamed.goals })!)).toBe(
      publicSummaryBasis(sanitizePublicMatchShare(result)!)
    );
  });
});

describe("one link through the phases", () => {
  it("refreshes before and during the match, and calmly after it until the link is turned off", () => {
    const upcoming = sanitizePublicMatchShare(rawAnswer({ phase: "upcoming" }));
    const live = sanitizePublicMatchShare(rawAnswer({ phase: "live" }));
    const waiting = sanitizePublicMatchShare(rawAnswer({ summary: { status: "pending" } }));
    const done = sanitizePublicMatchShare(withCurrentSummary(rawAnswer()));
    const finalOnly = sanitizePublicMatchShare(rawAnswer({ shareSummary: false }));
    expect(publicRefreshIntervalMs(upcoming)).toBe(30_000);
    expect(publicRefreshIntervalMs(live)).toBe(15_000);
    expect(publicRefreshIntervalMs(waiting)).toBe(20_000);
    // Finished pages still learn of a revoked link, a lower level or a correction.
    expect(done?.summary?.status).toBe("ready");
    expect(publicRefreshIntervalMs(done)).toBe(120_000);
    expect(publicRefreshIntervalMs(finalOnly)).toBe(120_000);
    expect(publicRefreshIntervalMs(null)).toBeNull();
  });
});

describe("kick-off is the first ▶", () => {
  const clock = (startedAtMs: number | null, isRunning: boolean, pausedAtMs: number | null = null) => ({
    startedAtMs,
    pausedAtMs,
    accumulatedPausedMs: 0,
    isRunning,
  });
  const liveAnswer = (live: Record<string, unknown>) =>
    rawAnswer({ phase: "live", detailLevel: "result", live: { ...rawAnswer().live, ...live } });

  it("a match made ready with «Start kampen» but no ▶ yet is still upcoming: no LIVE, no score, no clock", () => {
    const share = sanitizePublicMatchShare(liveAnswer({ status: "not_started", clock: clock(null, false) }));
    expect(share?.phase).toBe("upcoming");
    expect(share?.live).toBeNull();
    expect(share?.score).toBeNull();
  });

  it("after the first ▶ it is live; a paused clock or half-time is still a started match", () => {
    expect(sanitizePublicMatchShare(liveAnswer({ clock: clock(1000, true) }))?.phase).toBe("live");
    const paused = sanitizePublicMatchShare(liveAnswer({ status: "paused", clock: clock(1000, false, 60_000) }));
    expect(paused?.phase).toBe("live");
    expect(paused?.live?.clock?.isRunning).toBe(false);
    const halfTime = sanitizePublicMatchShare(
      liveAnswer({ phase: "half_time", status: "paused", clock: clock(1000, false, 1_500_000) })
    );
    expect(halfTime?.phase).toBe("live");
  });
});

describe("refresh and data status", () => {
  it("polls calmly as a fallback while the Realtime hint is connected", () => {
    const live = sanitizePublicMatchShare(rawAnswer({ phase: "live" }));
    const upcoming = sanitizePublicMatchShare(rawAnswer({ phase: "upcoming" }));
    expect(publicRefreshIntervalMs(live, { realtime: true })).toBe(60_000);
    expect(publicRefreshIntervalMs(upcoming, { realtime: true })).toBe(60_000);
    expect(publicRefreshIntervalMs(sanitizePublicMatchShare(withCurrentSummary(rawAnswer())), { realtime: true })).toBe(120_000);
    expect(publicRefreshIntervalMs(null, { realtime: true })).toBeNull();
  });

  it("says no contact when the last read failed, and old data when the coach has not written for a while", () => {
    const live = sanitizePublicMatchShare(rawAnswer({ phase: "live" }))!.live;
    const at = Date.parse("2026-10-26T10:20:00.000Z");
    expect(publicDataStatus({ live, fetchFailed: false, nowMs: at + 60_000 })).toBe("current");
    expect(publicDataStatus({ live, fetchFailed: false, nowMs: at + 5 * 60_000 })).toBe("stale");
    expect(publicDataStatus({ live, fetchFailed: true, nowMs: at })).toBe("noContact");
    expect(publicDataStatus({ live: null, fetchFailed: false, nowMs: at })).toBe("current");
  });
});

describe("factual summary", () => {
  it("says no more than the level shows", () => {
    const status = sanitizePublicMatchShare(rawAnswer({ detailLevel: "status" }))!;
    expect(buildFactualSummary(status, "no")).toBe("Kampen mellom Lyn G10 og Strindheim er ferdigspilt.");
    const result = sanitizePublicMatchShare(rawAnswer({ detailLevel: "result" }))!;
    expect(buildFactualSummary(result, "no")).toBe("Lyn G10 og Strindheim spilte 9–9.");
    const detailed = sanitizePublicMatchShare(rawAnswer({ detailLevel: "detailed" }))!;
    // AI-QA-01: one recorded scorer of nine goals is not «the scorers».
    expect(buildFactualSummary(detailed, "en")).toBe("Lyn G10 and Strindheim drew 9–9. Recorded scorers include Frida.");
    expect(buildFactualSummary(detailed, "no")).toBe("Lyn G10 og Strindheim spilte 9–9. Blant de registrerte målscorerne: Frida.");
  });
});

describe("kick-off", () => {
  it("a share for a new match without a kick-off has no start time: no countdown, never the link's creation time", () => {
    const share = sanitizePublicMatchShare(rawAnswer({ phase: "upcoming", startsAt: null }));
    expect(share).not.toBeNull();
    expect(share?.startsAt).toBeNull();
  });

  it("a time of day is today, or tomorrow when set up the evening before", () => {
    const afternoon = new Date(2026, 9, 26, 14, 0);
    expect(new Date(kickoffFromTimeOfDay("17:30", afternoon)!)).toEqual(new Date(2026, 9, 26, 17, 30));
    // A little late: still today (the page then waits for the kick-off).
    expect(new Date(kickoffFromTimeOfDay("13:30", afternoon)!)).toEqual(new Date(2026, 9, 26, 13, 30));

    const evening = new Date(2026, 9, 26, 22, 0);
    expect(new Date(kickoffFromTimeOfDay("09:00", evening)!)).toEqual(new Date(2026, 9, 27, 9, 0));
  });

  it("an empty or malformed time is no kick-off", () => {
    const now = new Date(2026, 9, 26, 14, 0);
    expect(kickoffFromTimeOfDay("", now)).toBeNull();
    expect(kickoffFromTimeOfDay("25:00", now)).toBeNull();
    expect(timeOfDayOf(null)).toBe("");
    expect(timeOfDayOf(new Date(2026, 9, 26, 9, 5).toISOString())).toBe("09:05");
    expect(normalizeKickoffAt("not a time")).toBeNull();
    expect(normalizeKickoffAt(null)).toBeNull();
    expect(normalizeKickoffAt("2026-10-26T17:30:00Z")).toBe("2026-10-26T17:30:00.000Z");
  });
});

