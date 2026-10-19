import { afterEach, describe, expect, it, vi } from "vitest";
import { activateMatch, endMatch, getStoredMatchSetup } from "@/lib/storage/matchStorage";
import { assignStarterToSlot, createMatchSetup, setSelectedSquad } from "@/domain/match";
import { getStoredLiveMatch, saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import {
  createLiveMatchFromSetup,
  endCurrentHalf,
  getPlayerAccumulatedSeconds,
  pauseLiveMatch,
  startLiveMatch,
  substitutePlayers,
  updateScore,
} from "@/domain/liveMatch";
import {
  clearLocalActiveState,
  clearLocalActiveStateFor,
  endLocalActiveMatch,
  hasActiveConflict,
  persistActiveMatchCloseAction,
  resolveActiveMatch,
  resolveClosedOnDevice,
  resolveLocalActiveMatch,
  startLocalMatch,
  toCanonicalStatus,
} from "@/lib/match/activeMatchRecovery";
import { savePendingMatchCompletion } from "@/lib/storage/pendingMatchCompletionStorage";

describe("active match recovery", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  // FP-P0-F2: a server row marked live is not this device's active match.
  it("offers a live server match this device does not run as recovery, never as active", () => {
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

    expect(resolution.activeMatch).toBeNull();
    expect(resolution.recoveryMatch?.id).toBe("match-1");
    expect(resolution.recoveryHref).toBe("/match/match-1");
    expect(resolution.canContinue).toBe(true);
    expect(resolution.needsRecovery).toBe(true);
  });

  it("does not offer to continue a live server match without a runtime snapshot", () => {
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
    expect(resolution.canContinue).toBe(false);
    expect(resolution.recoveryHref).toBe("/match/match-2");
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

  it("prevents starting a new match while another match is live on the server", () => {
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

  it("prevents starting anything but this device's own match while it runs one", () => {
    const setup = createMatchSetup("team-1");
    activateMatch(setup, "match-A");
    saveStoredLiveMatch(createLiveMatchFromSetup(setup));
    const resolution = resolveActiveMatch(null, null, resolveLocalActiveMatch());

    expect(hasActiveConflict(null, resolution)).toBe(true);
    expect(hasActiveConflict("match-B", resolution)).toBe(true);
    expect(hasActiveConflict("match-A", resolution)).toBe(false);
  });
});

const DEVICE_SERVER_ID = "match-A";

function serverRow(id: string, status: string, runtimeState: Record<string, unknown> | null = null) {
  return { id, title: `Kamp ${id}`, teamId: "team-1", status, runtimeState };
}

function runOnDevice(serverMatchId: string | null | "legacy" = DEVICE_SERVER_ID) {
  const setup = createMatchSetup("team-1");
  if (serverMatchId === "legacy") {
    // A setup stored before serverMatchId existed.
    window.localStorage.setItem(
      "fairplayr.matchSetup.v1",
      JSON.stringify({ version: 2, config: setup, status: "active" })
    );
  } else {
    activateMatch(setup, serverMatchId);
  }
  saveStoredLiveMatch(startLiveMatch(createLiveMatchFromSetup(setup), Date.now() - 60_000));
  return setup;
}

describe("resolveActiveMatch: device × server matrix (FP-P0-F2)", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("device none × server none: nothing to show", () => {
    const resolution = resolveActiveMatch(null, null, resolveLocalActiveMatch());

    expect(resolution).toMatchObject({ activeMatch: null, recoveryMatch: null, source: "none", needsRecovery: false });
  });

  it("device active × server none: the device match, linked to its own server id", () => {
    runOnDevice();
    const resolution = resolveActiveMatch(null, null, resolveLocalActiveMatch());

    expect(resolution.activeMatch).toMatchObject({ id: DEVICE_SERVER_ID, status: "live", serverMatchId: DEVICE_SERVER_ID });
    expect(resolution.href).toBe("/match/live?matchId=match-A");
    expect(resolution.recoveryMatch).toBeNull();
    expect(resolution.needsRecovery).toBe(false);
  });

  it("device active × server same row: one match, with the server title", () => {
    runOnDevice();
    const resolution = resolveActiveMatch(serverRow(DEVICE_SERVER_ID, "live", { status: "running" }), null, resolveLocalActiveMatch());

    expect(resolution.activeMatch).toMatchObject({ id: DEVICE_SERVER_ID, title: "Kamp match-A" });
    expect(resolution.recoveryMatch).toBeNull();
    expect(resolution.source).toBe("device");
  });

  it("device active × server different live row: device stays active, the other is recovery", () => {
    runOnDevice();
    const resolution = resolveActiveMatch(serverRow("match-B", "live"), null, resolveLocalActiveMatch());

    expect(resolution.activeMatch?.id).toBe(DEVICE_SERVER_ID);
    expect(resolution.href).toBe("/match/live?matchId=match-A");
    expect(resolution.recoveryMatch?.id).toBe("match-B");
    expect(resolution.recoveryHref).toBe("/match/match-B");
    expect(resolution.canContinue).toBe(false);
  });

  it("device active × server row completed: device stays active, completed row is never shown", () => {
    runOnDevice();
    const resolution = resolveActiveMatch(serverRow(DEVICE_SERVER_ID, "completed"), null, resolveLocalActiveMatch());

    expect(resolution.activeMatch?.id).toBe(DEVICE_SERVER_ID);
    expect(resolution.recoveryMatch).toBeNull();
  });

  it("local-only device match links to the live screen without a server id", () => {
    runOnDevice(null);
    const resolution = resolveActiveMatch(null, null, resolveLocalActiveMatch());

    expect(resolution.activeMatch).toMatchObject({ status: "live", serverMatchId: null });
    expect(resolution.href).toBe("/match/live");
  });

  it("pairs a legacy setup (no stored server id) only with the row whose runtime names it", () => {
    const setup = runOnDevice("legacy");
    const own = serverRow("match-L", "live", { setupId: setup.id });
    const resolution = resolveActiveMatch(own, null, resolveLocalActiveMatch());

    expect(resolution.activeMatch).toMatchObject({ id: "match-L", serverMatchId: "match-L" });
    expect(resolution.recoveryMatch).toBeNull();

    const other = resolveActiveMatch(serverRow("match-X", "live", { setupId: "someone-else" }), null, resolveLocalActiveMatch());
    expect(other.activeMatch?.serverMatchId).toBeUndefined();
    expect(other.recoveryMatch?.id).toBe("match-X");
  });

  it("device ended × stale server live row for that match: neither active nor recovery", () => {
    const setup = runOnDevice();
    endMatch(setup);
    const resolution = resolveActiveMatch(
      serverRow(DEVICE_SERVER_ID, "live", { status: "running" }),
      null,
      resolveLocalActiveMatch(),
      resolveClosedOnDevice()
    );

    expect(resolution.activeMatch).toBeNull();
    expect(resolution.recoveryMatch).toBeNull();
  });

  it("a match with a pending completion is not offered for recovery while the server is stale", () => {
    savePendingMatchCompletion({
      matchId: "match-P",
      endedAt: "2026-10-19T10:00:00.000Z",
      body: { status: "completed", scoreFor: 1, scoreAgainst: 0, reportEnabled: false, runtimeState: null },
    });
    const resolution = resolveActiveMatch(serverRow("match-P", "live"), null, null, resolveClosedOnDevice());

    expect(resolution.recoveryMatch).toBeNull();
  });

  it("server recoverable (not live, has runtime) is recovery, never continue", () => {
    const resolution = resolveActiveMatch(null, serverRow("match-R", "draft", { status: "paused" }), null);

    expect(resolution.recoveryMatch?.id).toBe("match-R");
    expect(resolution.canContinue).toBe(false);
  });
});

describe("scoped local actions (FP-P0-F2)", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("clearLocalActiveStateFor never clears a different match", () => {
    runOnDevice();

    expect(clearLocalActiveStateFor("match-B")).toBe(false);
    expect(getStoredMatchSetup()?.status).toBe("active");
    expect(getStoredLiveMatch()).not.toBeNull();

    expect(clearLocalActiveStateFor(DEVICE_SERVER_ID)).toBe(true);
    expect(getStoredMatchSetup()).toBeNull();
  });

  it("endLocalActiveMatch scoped to another match leaves the device match running", () => {
    runOnDevice();

    expect(endLocalActiveMatch({ onlyServerMatchId: "match-B" })).toBeNull();
    expect(getStoredMatchSetup()?.status).toBe("active");
    expect(getStoredLiveMatch()?.clock.isRunning).toBe(true);
  });

  it("endLocalActiveMatch stops the clock, stores the ended state and builds the completion", () => {
    runOnDevice();
    const nowMs = Date.now();

    const ended = endLocalActiveMatch({ nowMs, reportEnabled: true, onlyServerMatchId: DEVICE_SERVER_ID });

    expect(getStoredMatchSetup()?.status).toBe("ended");
    expect(getStoredLiveMatch()).toMatchObject({ status: "ended", clock: { isRunning: false } });
    expect(ended?.completion).toEqual({
      matchId: DEVICE_SERVER_ID,
      endedAt: new Date(nowMs).toISOString(),
      body: {
        status: "completed",
        scoreFor: 0,
        scoreAgainst: 0,
        reportEnabled: true,
        runtimeState: getStoredLiveMatch(),
      },
    });
  });

  it.each([0, 3, 19, 47])(
    "endLocalActiveMatch ends at once at minute %i, keeping score, events and every player's minutes",
    (minute) => {
      let setup = setSelectedSquad(createMatchSetup("team-1"), ["p1", "p2", "p3"]);
      const [slotA, slotB] = Object.keys(setup.slotAssignments);
      setup = assignStarterToSlot(assignStarterToSlot(setup, slotA, "p1"), slotB, "p2");
      activateMatch(setup, DEVICE_SERVER_ID);
      const nowMs = Date.now();
      const startedMs = nowMs - minute * 60_000;
      let live = startLiveMatch(createLiveMatchFromSetup(setup), startedMs);
      if (minute >= 2) live = substitutePlayers(live, "p1", "p3", startedMs + 60_000);
      live = updateScore(updateScore(live, "team", 2), "opponent", 1);
      saveStoredLiveMatch(live);
      const minutesBefore = Object.fromEntries(
        ["p1", "p2", "p3"].map((id) => [id, Math.floor(getPlayerAccumulatedSeconds(live, id, nowMs) / 60)])
      );

      const ended = endLocalActiveMatch({ nowMs, onlyServerMatchId: DEVICE_SERVER_ID });
      const stored = getStoredLiveMatch()!;

      // No minimum duration, no wait for full time.
      expect(getStoredMatchSetup()?.status).toBe("ended");
      expect(stored).toMatchObject({ status: "ended", teamScore: 2, opponentScore: 1, clock: { isRunning: false } });
      expect(ended?.completion?.body).toMatchObject({ scoreFor: 2, scoreAgainst: 1 });
      // Every recorded event kept, plus the end.
      expect(stored.events.slice(0, live.events.length)).toEqual(live.events);
      expect(stored.events.at(-1)).toMatchObject({ type: "match_ended", minute });
      for (const id of ["p1", "p2", "p3"]) {
        expect(Math.floor(getPlayerAccumulatedSeconds(stored, id, nowMs + 3_600_000) / 60)).toBe(minutesBefore[id]);
      }
    }
  );

  it("endLocalActiveMatch ends a local-only match without a completion", () => {
    runOnDevice(null);

    const ended = endLocalActiveMatch();

    expect(ended).toMatchObject({ serverMatchId: null, completion: null });
    expect(getStoredMatchSetup()?.status).toBe("ended");
  });

  it("force close without discard keeps the server runtime snapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });

    await persistActiveMatchCloseAction({ matchId: "m", fetchImpl: fetchMock as unknown as typeof fetch, mode: "force-close" });
    await persistActiveMatchCloseAction({ matchId: "m", fetchImpl: fetchMock as unknown as typeof fetch, mode: "discard" });

    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(bodies).toEqual([
      { status: "completed" },
      { status: "completed", runtimeState: null, reportStatus: "failed" },
    ]);
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
