import { afterEach, describe, expect, it, vi } from "vitest";
import { activateMatch, endMatch, getStoredMatchSetup } from "@/lib/storage/matchStorage";
import { createMatchSetup } from "@/domain/match";
import { getStoredLiveMatch, saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import { createLiveMatchFromSetup, endCurrentHalf, pauseLiveMatch, startLiveMatch } from "@/domain/liveMatch";
import {
  clearLocalActiveState,
  hasActiveConflict,
  persistActiveMatchCloseAction,
  resolveActiveMatch,
  startLocalMatch,
  toCanonicalStatus,
} from "@/lib/match/activeMatchRecovery";

describe("active match recovery", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("reopens active match with stable continue href after navigation", () => {
    const resolution = resolveActiveMatch(
      {
        id: "match-1",
        title: "Cup match",
        teamId: "team-1",
        status: "live",
        runtimeState: { ok: true },
      },
      null,
      null
    );

    expect(resolution.canContinue).toBe(true);
    expect(resolution.needsRecovery).toBe(false);
    expect(resolution.href).toBe("/match/live?matchId=match-1");
  });

  it("flags recovery when active match payload is incomplete", () => {
    const resolution = resolveActiveMatch(
      {
        id: "match-2",
        title: "Broken live",
        teamId: "team-1",
        status: "live",
        runtimeState: null,
      },
      null,
      null
    );

    expect(resolution.needsRecovery).toBe(true);
    expect(resolution.canForceClose).toBe(true);
    expect(toCanonicalStatus("upcoming")).toBe("planned");
  });

  it("force close clears local active state and persists close payload", async () => {
    const setup = createMatchSetup("team-1");
    activateMatch(setup);
    saveStoredLiveMatch(createLiveMatchFromSetup(setup));

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });

    await persistActiveMatchCloseAction({
      matchId: "match-3",
      fetchImpl: fetchMock as unknown as typeof fetch,
      mode: "force-close",
    });

    clearLocalActiveState();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/matches/match-3",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(window.localStorage.getItem("fairplayr.matchSetup.v1")).toBeNull();
    expect(window.localStorage.getItem("fairplayr.liveMatch.v1")).toBeNull();
  });

  it("discard clears corrupt local runtime state", () => {
    window.localStorage.setItem("fairplayr.matchSetup.v1", "{\"version\":2,\"status\":\"active\",\"config\":{}}");
    window.localStorage.setItem("fairplayr.liveMatch.v1", "not-json");

    clearLocalActiveState();

    expect(window.localStorage.getItem("fairplayr.matchSetup.v1")).toBeNull();
    expect(window.localStorage.getItem("fairplayr.liveMatch.v1")).toBeNull();
  });

  it("prevents starting a new match while another active match exists", () => {
    const resolution = resolveActiveMatch(
      {
        id: "live-1",
        title: "Current live",
        teamId: "team-1",
        status: "live",
        runtimeState: { ok: true },
      },
      null,
      null
    );

    expect(hasActiveConflict(null, resolution)).toBe(true);
    expect(hasActiveConflict("another-match", resolution)).toBe(true);
    expect(hasActiveConflict("live-1", resolution)).toBe(false);
  });
});

// FP-MS2.1-A1 (MS-10): the start itself refuses to overwrite an active match,
// whatever the UI shows.
describe("startLocalMatch", () => {
  const KICKOFF_MS = Date.parse("2026-10-14T10:00:00.000Z");

  afterEach(() => {
    window.localStorage.clear();
  });

  function snapshot() {
    return {
      setup: window.localStorage.getItem("fairplayr.matchSetup.v1"),
      live: window.localStorage.getItem("fairplayr.liveMatch.v1"),
    };
  }

  it("starts a match when none is active", () => {
    const setup = createMatchSetup("team-1");

    const result = startLocalMatch(setup, null);

    expect(result.ok).toBe(true);
    expect(getStoredMatchSetup()).toMatchObject({ status: "active", serverMatchId: null, config: { id: setup.id } });
    expect(getStoredLiveMatch()).toMatchObject({ setupId: setup.id, status: "not_started" });
  });

  it.each([
    ["running", (live: ReturnType<typeof createLiveMatchFromSetup>) => startLiveMatch(live, KICKOFF_MS)],
    ["paused", (live: ReturnType<typeof createLiveMatchFromSetup>) =>
      pauseLiveMatch(startLiveMatch(live, KICKOFF_MS), KICKOFF_MS + 60_000)],
    ["at half-time", (live: ReturnType<typeof createLiveMatchFromSetup>) =>
      endCurrentHalf(startLiveMatch(live, KICKOFF_MS), KICKOFF_MS + 600_000)],
    ["before kickoff", (live: ReturnType<typeof createLiveMatchFromSetup>) => live],
  ])("refuses to start over a match that is %s and leaves it untouched", (_label, advance) => {
    const running = createMatchSetup("team-1");
    activateMatch(running, "match-1");
    saveStoredLiveMatch(advance(createLiveMatchFromSetup(running)));
    const before = snapshot();

    const result = startLocalMatch(createMatchSetup("team-1"), null);

    expect(result).toEqual({ ok: false, reason: "active_match" });
    expect(snapshot()).toEqual(before);
  });

  it("starts the next match after the previous one ended", () => {
    const first = createMatchSetup("team-1");
    startLocalMatch(first, null);
    endMatch(first);

    const next = createMatchSetup("team-1");
    expect(startLocalMatch(next, "match-2").ok).toBe(true);
    expect(getStoredMatchSetup()).toMatchObject({ status: "active", serverMatchId: "match-2", config: { id: next.id } });
    expect(getStoredLiveMatch()?.setupId).toBe(next.id);
  });
});
