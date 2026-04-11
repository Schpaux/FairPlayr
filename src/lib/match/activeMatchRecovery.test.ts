import { afterEach, describe, expect, it, vi } from "vitest";
import { activateMatch } from "@/lib/storage/matchStorage";
import { createMatchSetup } from "@/domain/match";
import { saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import { createLiveMatchFromSetup } from "@/domain/liveMatch";
import {
  clearLocalActiveState,
  hasActiveConflict,
  persistActiveMatchCloseAction,
  resolveActiveMatch,
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
