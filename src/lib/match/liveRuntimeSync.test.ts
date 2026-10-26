// MATCH-02a / OFF-01b: sending the live screen's state to the server match.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveMatchFromSetup } from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import { sendLiveRuntimeState } from "@/lib/match/liveRuntimeSync";
import { activateMatch, getStoredMatchSetup } from "@/lib/storage/matchStorage";

const USER = "user-1";
const MATCH = "0b6f4d1e-2c3a-4b5d-8e6f-7a8b9c0d1e2f";

const SETUP: MatchSetup = {
  id: "setup-1",
  teamId: "team-1",
  format: "5v5",
  reportEnabled: false,
  formationId: "5v5-2-2",
  duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
  selectedPlayerIds: ["p1", "p2", "p3", "p4", "p5"],
  startingPlayerIds: ["p1", "p2", "p3", "p4", "p5"],
  slotAssignments: {},
  createdAt: "2026-10-26T10:00:00.000Z",
  updatedAt: "2026-10-26T10:00:00.000Z",
};

const liveMatch = createLiveMatchFromSetup(SETUP);
let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(answer: (url: string, init?: RequestInit) => Promise<Response>) {
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => answer(String(input), init));
  vi.stubGlobal("fetch", fetchMock);
}

const calls = () => fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit | undefined)?.method} ${url}`);

describe("sendLiveRuntimeState", () => {
  beforeEach(() => {
    window.localStorage.clear();
    activateMatch(SETUP, MATCH);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the whole state as one PATCH", async () => {
    stubFetch(() => Promise.resolve(new Response(JSON.stringify({ match: {} }), { status: 200 })));

    await expect(sendLiveRuntimeState({ matchId: MATCH, userId: USER, liveMatch })).resolves.toBe("sent");
    expect(calls()).toEqual([`PATCH /api/matches/${MATCH}`]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      runtimeState: { id: liveMatch.id },
      scoreFor: 0,
      scoreAgainst: 0,
    });
  });

  it("asks for a retry when the network or the server fails, and stops when the match is closed", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(sendLiveRuntimeState({ matchId: MATCH, userId: USER, liveMatch })).resolves.toBe("retry");

    stubFetch(() => Promise.resolve(new Response(null, { status: 503 })));
    await expect(sendLiveRuntimeState({ matchId: MATCH, userId: USER, liveMatch })).resolves.toBe("retry");

    // Completed or discarded on the server: sending again cannot reopen it.
    stubFetch(() => Promise.resolve(new Response(JSON.stringify({ errorCode: "MATCH_COMPLETED" }), { status: 409 })));
    await expect(sendLiveRuntimeState({ matchId: MATCH, userId: USER, liveMatch })).resolves.toBe("stop");
  });

  it("sends one state after the other, in order", async () => {
    const answers: Array<() => void> = [];
    stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          answers.push(() => resolve(new Response(null, { status: 204 })));
        })
    );

    const first = sendLiveRuntimeState({ matchId: MATCH, userId: USER, liveMatch });
    const second = sendLiveRuntimeState({ matchId: MATCH, userId: USER, liveMatch: { ...liveMatch, teamScore: 1 } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    answers[0]();
    await expect(first).resolves.toBe("sent");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).scoreFor).toBe(1);
    answers[1]();
    await expect(second).resolves.toBe("sent");
  });

  describe("a match created from this device (MATCH-13)", () => {
    beforeEach(() => {
      activateMatch(SETUP, MATCH, {
        ownerUserId: USER,
        pendingCreate: { title: "Kamp – 26. okt 12:00", startsAt: "2026-10-26T10:00:00.000Z" },
      });
    });

    it("creates the server row first, then sends the state", async () => {
      stubFetch(() => Promise.resolve(new Response(JSON.stringify({ match: { id: MATCH } }), { status: 201 })));

      await expect(sendLiveRuntimeState({ matchId: MATCH, userId: USER, liveMatch })).resolves.toBe("sent");
      expect(calls()).toEqual(["POST /api/matches", `PATCH /api/matches/${MATCH}`]);
      expect(getStoredMatchSetup()?.serverLink?.pendingCreate).toBeNull();
    });

    it("waits while the row cannot be created", async () => {
      stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

      await expect(sendLiveRuntimeState({ matchId: MATCH, userId: USER, liveMatch })).resolves.toBe("retry");
      expect(calls()).toEqual(["POST /api/matches"]);
    });

    it("never writes the match for another signed-in user", async () => {
      stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));

      await expect(sendLiveRuntimeState({ matchId: MATCH, userId: "user-2", liveMatch })).resolves.toBe("stop");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
