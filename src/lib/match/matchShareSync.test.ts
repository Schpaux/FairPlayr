// FEAT-SHARE-01: the link made in setup stays the same link: offline it
// waits (the match can still start), online the match row is created with
// the link's match id and the share is sent once, and the start keeps it.
import { beforeEach, describe, expect, it, vi } from "vitest";

const storedSetup = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/lib/storage/matchStorage", () => ({ getStoredMatchSetup: () => storedSetup.value }));

import { getStoredMatchShare, saveStoredMatchShare, type StoredMatchShare } from "@/lib/storage/matchShareStorage";
import { getQueuedShareRevocations } from "@/lib/storage/matchShareStorage";
import {
  markStoredShareStarted,
  revokeDiscardedMatchShare,
  revokeDiscardedSetupShare,
  shareMatchForStart,
  syncStoredMatchShare,
} from "@/lib/match/matchShareSync";

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const TEAM_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "T".repeat(43);

function share(overrides: Partial<StoredMatchShare> = {}): StoredMatchShare {
  return {
    matchId: MATCH_ID,
    teamId: TEAM_ID,
    ownerUserId: "coach",
    token: TOKEN,
    settings: { live: true, summary: false, detailLevel: "status", ageGroup: "unknown" },
    revision: 1,
    syncedRevision: 0,
    matchCreated: false,
    started: false,
    plannedMatch: false,
    kickoffAt: null,
    ...overrides,
  };
}

const ok = (body: unknown = {}) => new Response(JSON.stringify(body), { status: 200 });

describe("syncStoredMatchShare", () => {
  beforeEach(() => {
    window.localStorage.clear();
    storedSetup.value = null;
    vi.restoreAllMocks();
  });

  it("offline: nothing is lost, the link stays, and the start can use it", async () => {
    saveStoredMatchShare(share());
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

    expect(await syncStoredMatchShare("coach")).toBe("offline");
    expect(getStoredMatchShare()).toMatchObject({ token: TOKEN, revision: 1, syncedRevision: 0, matchCreated: false });
    // Not created yet: the start makes a new match with the link's id (MATCH-13).
    expect(shareMatchForStart({ teamId: TEAM_ID, ownerUserId: "coach", plannedMatchId: null })).toEqual({
      matchId: MATCH_ID,
      created: false,
    });
  });

  it("online before kick-off: creates the match with the link's id, then sends the share once", async () => {
    saveStoredMatchShare(share());
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 201 }))
      .mockResolvedValueOnce(ok({ share: { token: TOKEN } }));

    expect(await syncStoredMatchShare("coach")).toBe("synced");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [createUrl, createInit] = fetchMock.mock.calls[0];
    expect(createUrl).toBe("/api/matches");
    expect(JSON.parse(String(createInit?.body))).toMatchObject({ id: MATCH_ID, teamId: TEAM_ID, status: "upcoming" });
    const [shareUrl, shareInit] = fetchMock.mock.calls[1];
    expect(shareUrl).toBe(`/api/matches/${MATCH_ID}/share`);
    expect(JSON.parse(String(shareInit?.body))).toEqual({ live: true, summary: false, detailLevel: "status", ageGroup: "unknown", token: TOKEN, kickoffAt: null });
    expect(getStoredMatchShare()).toMatchObject({ syncedRevision: 1, matchCreated: true });

    // Sent once: nothing to send again.
    expect(await syncStoredMatchShare("coach")).toBe("synced");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Created: the start uses that match as a planned one, so the link follows it.
    expect(shareMatchForStart({ teamId: TEAM_ID, ownerUserId: "coach", plannedMatchId: null })).toEqual({
      matchId: MATCH_ID,
      created: true,
    });
    markStoredShareStarted(MATCH_ID);
    expect(shareMatchForStart({ teamId: TEAM_ID, ownerUserId: "coach", plannedMatchId: null })).toBeNull();
  });

  it("a started match waits for MATCH-13 to create its row", async () => {
    saveStoredMatchShare(share({ started: true }));
    storedSetup.value = { serverMatchId: MATCH_ID, serverLink: { ownerUserId: "coach", pendingCreate: { title: "x", startsAt: "y" } } };
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(await syncStoredMatchShare("coach")).toBe("waiting");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's link when the server already had one for the match", async () => {
    saveStoredMatchShare(share({ matchCreated: true, plannedMatch: true }));
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(ok({ share: { token: "S".repeat(43) } }));

    expect(await syncStoredMatchShare("coach")).toBe("synced");
    expect(getStoredMatchShare()?.token).toBe("S".repeat(43));
  });

  it("turning off before the server had it sends nothing", async () => {
    saveStoredMatchShare(share({ settings: { live: false, summary: false, detailLevel: "status", ageGroup: "unknown" } }));
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(await syncStoredMatchShare("coach")).toBe("synced");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only the coach who made it sends it, and a planned match never takes a new match's share", async () => {
    saveStoredMatchShare(share());
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await syncStoredMatchShare("someone-else")).toBe("synced");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shareMatchForStart({ teamId: TEAM_ID, ownerUserId: "coach", plannedMatchId: "33333333-3333-4333-8333-333333333333" })).toBeNull();
  });

  it("a new match's kick-off: the row gets it, and the share sends it as its own kick-off", async () => {
    const kickoffAt = "2026-10-27T17:30:00.000Z";
    saveStoredMatchShare(share({ kickoffAt }));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 201 }))
      .mockResolvedValueOnce(ok({ share: { token: TOKEN } }));

    expect(await syncStoredMatchShare("coach")).toBe("synced");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ startsAt: kickoffAt });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ kickoffAt });
  });

  it("a planned match's share never sends a kick-off: the match keeps its own time", async () => {
    saveStoredMatchShare(share({ matchCreated: true, plannedMatch: true }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(ok({ share: { token: TOKEN } }));

    await syncStoredMatchShare("coach");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).not.toHaveProperty("kickoffAt");
  });
});

describe("revokeDiscardedSetupShare", () => {
  beforeEach(() => {
    window.localStorage.clear();
    storedSetup.value = null;
    vi.restoreAllMocks();
  });

  it("offline: the discard is kept and the link is turned off once the network is back", async () => {
    saveStoredMatchShare(share({ matchCreated: true, syncedRevision: 1 }));

    expect(revokeDiscardedSetupShare(TEAM_ID)).toBe(true);
    // The next setup starts without it (a new match, a new link).
    expect(getStoredMatchShare()).toBeNull();
    expect(shareMatchForStart({ teamId: TEAM_ID, ownerUserId: "coach", plannedMatchId: null })).toBeNull();

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("offline"));
    expect(await syncStoredMatchShare("coach")).toBe("offline");
    expect(getQueuedShareRevocations()).toEqual([{ matchId: MATCH_ID, ownerUserId: "coach", discardPlaceholder: true }]);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(ok({ share: null }));
    expect(await syncStoredMatchShare("coach")).toBe("synced");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/matches/${MATCH_ID}/share`);
    expect(init?.method).toBe("PUT");
    // The placeholder made for the share is marked discarded, not left as a coming match.
    expect(JSON.parse(String(init?.body))).toEqual({ live: false, summary: false, discardPlaceholder: true });
    expect(getQueuedShareRevocations()).toEqual([]);

    // Sent once.
    expect(await syncStoredMatchShare("coach")).toBe("synced");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a match row that was never made has no link: the queued discard is dropped", async () => {
    saveStoredMatchShare(share());
    revokeDiscardedSetupShare(TEAM_ID);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 404 }));

    expect(await syncStoredMatchShare("coach")).toBe("synced");
    expect(getQueuedShareRevocations()).toEqual([]);
  });

  it("a send under way when the setup is discarded is followed by the revocation", async () => {
    saveStoredMatchShare(share());
    let finishCreate: (response: Response) => void = () => {};
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (finishCreate = resolve)))
      .mockResolvedValueOnce(ok({ share: { token: TOKEN } }))
      .mockResolvedValueOnce(ok({ share: null }));

    const first = syncStoredMatchShare("coach");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    revokeDiscardedSetupShare(TEAM_ID);
    const second = syncStoredMatchShare("coach");
    finishCreate(new Response("{}", { status: 201 }));
    await first;
    await second;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      live: false,
      summary: false,
      discardPlaceholder: true,
    });
    expect(getQueuedShareRevocations()).toEqual([]);
  });

  it("leaves a planned match's share, a started match's share and another team's share alone", () => {
    saveStoredMatchShare(share({ plannedMatch: true, matchCreated: true }));
    expect(revokeDiscardedSetupShare(TEAM_ID)).toBe(false);
    saveStoredMatchShare(share({ started: true }));
    expect(revokeDiscardedSetupShare(TEAM_ID)).toBe(false);
    saveStoredMatchShare(share());
    expect(revokeDiscardedSetupShare("44444444-4444-4444-8444-444444444444")).toBe(false);
    expect(getStoredMatchShare()).not.toBeNull();
    expect(getQueuedShareRevocations()).toEqual([]);
  });
});

describe("revokeDiscardedMatchShare («Forkast kamp»)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    storedSetup.value = null;
    vi.restoreAllMocks();
  });

  it("turns the running match's link off through the same durable queue, also offline", async () => {
    saveStoredMatchShare(share({ started: true, matchCreated: true, syncedRevision: 1 }));

    expect(revokeDiscardedMatchShare(MATCH_ID, "coach")).toBe(true);
    expect(getStoredMatchShare()).toBeNull();

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("offline"));
    expect(await syncStoredMatchShare("coach")).toBe("offline");
    expect(getQueuedShareRevocations()).toEqual([{ matchId: MATCH_ID, ownerUserId: "coach" }]);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(ok({ share: null }));
    expect(await syncStoredMatchShare("coach")).toBe("synced");
    // A played match is never marked as a discarded placeholder.
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      live: false,
      summary: false,
      discardPlaceholder: false,
    });
    expect(getQueuedShareRevocations()).toEqual([]);
  });

  it("queues a match shared from another device too, and nothing without a signed-in coach", () => {
    expect(revokeDiscardedMatchShare(MATCH_ID, "coach")).toBe(true);
    expect(getQueuedShareRevocations()).toEqual([{ matchId: MATCH_ID, ownerUserId: "coach" }]);

    window.localStorage.clear();
    saveStoredMatchShare(share({ started: true }));
    expect(revokeDiscardedMatchShare(MATCH_ID, null)).toBe(false);
    expect(getStoredMatchShare()).toBeNull();
    expect(getQueuedShareRevocations()).toEqual([]);
    expect(revokeDiscardedMatchShare(null, "coach")).toBe(false);
  });
});
