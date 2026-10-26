// MATCH-13: a signed-in coach's match started without a planned match keeps
// one server identity from the start, survives a failed sync, a reload and
// the next match, and reaches the server exactly once.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startLiveMatch, updateScore } from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import { endLocalActiveMatch, startLocalMatch } from "@/lib/match/activeMatchRecovery";
import { retrySavingUnsavedMatchCompletions, submitMatchCompletion } from "@/lib/match/matchCompletion";
import { syncActiveMatchCreate } from "@/lib/match/matchServerCreate";
import { getStoredMatchSetup } from "@/lib/storage/matchStorage";
import { getStoredLiveMatch, saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import {
  getPendingMatchCompletion,
  savePendingMatchCompletion,
} from "@/lib/storage/pendingMatchCompletionStorage";

const USER = "user-1";
const TEAM = "6f1c2f1e-9d4b-4a57-9b1a-3a7f1b2c4d5e";
const MATCH_A = "0b6f4d1e-2c3a-4b5d-8e6f-7a8b9c0d1e2f";
const MATCH_B = "1c7a5e2f-3d4b-4c6e-9f7a-8b9c0d1e2f3a";
const KICKOFF_A = "2026-10-25T09:52:00.000Z";

function setup(id: string): MatchSetup {
  return {
    id,
    teamId: TEAM,
    format: "7v7",
    reportEnabled: true,
    formationId: "7v7-2-3-1",
    duration: { mode: "preset", presetId: "2x25", halves: 2, minutesPerHalf: 25, totalMinutes: 50 },
    selectedPlayerIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"],
    startingPlayerIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7"],
    slotAssignments: {},
    createdAt: KICKOFF_A,
    updatedAt: KICKOFF_A,
  };
}

function startSignedIn(setupId: string, matchId: string, startsAt: string) {
  return startLocalMatch(setup(setupId), matchId, {
    serverLink: { ownerUserId: USER, pendingCreate: { title: "Kamp – 25. okt 10:52", startsAt } },
  });
}

interface SentRequest {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

/** Records every request, then answers it with `answer`. */
function stubServer(answer: (request: SentRequest) => Promise<Response>) {
  const sent: SentRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = {
        method: init?.method ?? "GET",
        url: String(input),
        body: init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null,
      };
      sent.push(request);
      return answer(request);
    })
  );
  return sent;
}

const offline = () => Promise.reject(new TypeError("Failed to fetch"));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MATCH-13: a new signed-in match without a planned match", () => {
  it("keeps match A through a failed sync, a reload and match B, then syncs it once without touching B", async () => {
    // Match A starts with its own id; the create fails (no network).
    stubServer(offline);
    expect(startSignedIn("setup-A", MATCH_A, KICKOFF_A).ok).toBe(true);
    await expect(syncActiveMatchCreate(USER)).resolves.toEqual({ status: "offline" });
    expect(getStoredMatchSetup()).toMatchObject({
      serverMatchId: MATCH_A,
      serverLink: { ownerUserId: USER, pendingCreate: { startsAt: KICKOFF_A } },
    });

    // A goal, then full time; the completion cannot be sent either.
    saveStoredLiveMatch(updateScore(startLiveMatch(getStoredLiveMatch()!, Date.parse(KICKOFF_A)), "team", 1));
    const ended = endLocalActiveMatch({ nowMs: Date.parse(KICKOFF_A) + 50 * 60_000 });
    expect(ended?.completion).toMatchObject({ matchId: MATCH_A, userId: USER, needsCreate: true });
    const first = await submitMatchCompletion(
      MATCH_A,
      ended!.completion!.body,
      ended!.completion!.endedAt,
      ended!.completion!
    );
    expect(first).toEqual({ status: "offline", persisted: true });

    // A reload (fresh modules, same device storage), then match B starts.
    vi.resetModules();
    const recovery = await import("@/lib/match/activeMatchRecovery");
    const completion = await import("@/lib/match/matchCompletion");
    expect(
      recovery.startLocalMatch(setup("setup-B"), MATCH_B, {
        serverLink: { ownerUserId: USER, pendingCreate: { title: "Kamp B", startsAt: "2026-10-25T11:00:00.000Z" } },
      }).ok
    ).toBe(true);
    const storedB = window.localStorage.getItem("fairplayr.matchSetup.v1");

    // A is kept apart from B, with everything History needs.
    const pendingA = getPendingMatchCompletion(MATCH_A);
    expect(pendingA).toMatchObject({
      userId: USER,
      needsCreate: true,
      info: { teamId: TEAM, startsAt: KICKOFF_A, format: "7v7" },
      body: { scoreFor: 1, scoreAgainst: 0, reportEnabled: true },
    });
    expect(pendingA?.body.runtimeState).toMatchObject({ setupId: "setup-A", status: "ended" });

    // Sync 1: the server creates A, but the answer is lost.
    let serverHasA = false;
    const sent = stubServer(async (request) => {
      if (request.method === "POST") {
        serverHasA = true;
        throw new TypeError("Failed to fetch");
      }
      return new Response(null, { status: 204 });
    });
    await expect(completion.retryPendingMatchCompletion(MATCH_A)).resolves.toMatchObject({ status: "offline" });
    expect(serverHasA).toBe(true);
    expect(getPendingMatchCompletion(MATCH_A)?.needsCreate).toBe(true);

    // Sync 2: the repeated create gets the existing row (200), then the completion.
    sent.length = 0;
    stubServer(async (request) => {
      sent.push(request);
      return request.method === "POST"
        ? Response.json({ match: { id: MATCH_A } }, { status: 200 })
        : new Response(null, { status: 204 });
    });
    await expect(completion.retryPendingMatchCompletion(MATCH_A)).resolves.toEqual({ status: "completed" });

    expect(sent.map(({ method, url }) => `${method} ${url}`)).toEqual([
      "POST /api/matches",
      `PATCH /api/matches/${MATCH_A}`,
    ]);
    expect(sent[0].body).toMatchObject({ id: MATCH_A, teamId: TEAM, startedAt: KICKOFF_A, status: "draft" });
    expect(sent[1].body).toMatchObject({ status: "completed", scoreFor: 1, scoreAgainst: 0 });
    expect(getPendingMatchCompletion(MATCH_A)).toBeNull();

    // A third attempt has nothing left to send.
    await expect(completion.retryPendingMatchCompletion(MATCH_A)).resolves.toBeNull();
    expect(sent).toHaveLength(2);

    // B was never touched: same stored setup, still its own pending create.
    expect(window.localStorage.getItem("fairplayr.matchSetup.v1")).toBe(storedB);
  });

  it("never lets a late create answer for match A change match B", async () => {
    let answerA: (response: Response) => void = () => {};
    const sent = stubServer(
      () =>
        new Promise<Response>((resolve) => {
          answerA = resolve;
        })
    );
    startSignedIn("setup-A", MATCH_A, KICKOFF_A);
    const createA = syncActiveMatchCreate(USER);

    // A is ended (its completion queued, as every End does) and B started
    // while A's create is still out.
    savePendingMatchCompletion(endLocalActiveMatch()!.completion!);
    startSignedIn("setup-B", MATCH_B, "2026-10-25T11:00:00.000Z");
    const storedB = window.localStorage.getItem("fairplayr.matchSetup.v1");

    answerA(Response.json({ match: { id: MATCH_A } }, { status: 201 }));
    await expect(createA).resolves.toEqual({ status: "created" });

    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({ id: MATCH_A, status: "live" });
    expect(window.localStorage.getItem("fairplayr.matchSetup.v1")).toBe(storedB);
    expect(getStoredMatchSetup()?.serverLink?.pendingCreate).not.toBeNull();
  });

  it("only syncs the running match for the coach who started it", async () => {
    const sent = stubServer(async () => Response.json({ match: { id: MATCH_A } }, { status: 201 }));
    startSignedIn("setup-A", MATCH_A, KICKOFF_A);

    await expect(syncActiveMatchCreate("someone-else")).resolves.toBeNull();
    expect(sent).toHaveLength(0);

    await expect(syncActiveMatchCreate(USER)).resolves.toEqual({ status: "created" });
    expect(getStoredMatchSetup()?.serverLink).toEqual({ ownerUserId: USER, pendingCreate: null });
    // Once created, nothing more to send.
    await expect(syncActiveMatchCreate(USER)).resolves.toBeNull();
    expect(sent).toHaveLength(1);
  });

  it("MATCH-13-F4: never starts a new match over one whose completion could not be stored, also after a reload", async () => {
    stubServer(offline);
    expect(startSignedIn("setup-A", MATCH_A, KICKOFF_A).ok).toBe(true);
    saveStoredLiveMatch(updateScore(startLiveMatch(getStoredLiveMatch()!, Date.parse(KICKOFF_A)), "team", 2));
    const ended = endLocalActiveMatch({ nowMs: Date.parse(KICKOFF_A) + 50 * 60_000 });

    // The device is full for the pending completion only; nothing reaches the server.
    const setItem = Storage.prototype.setItem;
    const fullDevice = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "fairplayr.pendingMatchCompletions.v1") throw new DOMException("full", "QuotaExceededError");
      setItem.call(this, key, value);
    });
    const result = await submitMatchCompletion(
      MATCH_A,
      ended!.completion!.body,
      ended!.completion!.endedAt,
      ended!.completion!
    );
    expect(result).toEqual({ status: "offline", persisted: false });

    // Match B is refused, and A's stored copy is untouched.
    expect(startSignedIn("setup-B", MATCH_B, "2026-10-25T11:00:00.000Z")).toEqual({
      ok: false,
      reason: "unsaved_completion",
    });
    const storedA = window.localStorage.getItem("fairplayr.matchSetup.v1");
    const storedLiveA = window.localStorage.getItem("fairplayr.liveMatch.v1");
    expect(getStoredMatchSetup()).toMatchObject({ status: "ended", serverMatchId: MATCH_A, config: { id: "setup-A" } });
    expect(getStoredLiveMatch()).toMatchObject({ setupId: "setup-A", status: "ended", teamScore: 2 });

    // A reload: module memory is gone, the device is still full.
    vi.resetModules();
    const recovery = await import("@/lib/match/activeMatchRecovery");
    const completion = await import("@/lib/match/matchCompletion");
    const storage = await import("@/lib/storage/matchStorage");
    const startB = () =>
      recovery.startLocalMatch(setup("setup-B"), MATCH_B, {
        serverLink: { ownerUserId: USER, pendingCreate: { title: "Kamp B", startsAt: "2026-10-25T11:00:00.000Z" } },
      });

    // Still protected: no start, and no draft written over A either.
    expect(completion.hasUnsavedMatchCompletion()).toBe(true);
    expect(startB()).toEqual({ ok: false, reason: "unsaved_completion" });
    expect(storage.saveMatchSetupDraft(setup("setup-B"))).toBe(false);
    expect(storage.updateMatchConfig(setup("setup-B"))).toBe(false);
    expect(window.localStorage.getItem("fairplayr.matchSetup.v1")).toBe(storedA);
    expect(window.localStorage.getItem("fairplayr.liveMatch.v1")).toBe(storedLiveA);

    // Saving again still fails: still refused, A still kept.
    expect(completion.retrySavingUnsavedMatchCompletions()).toBe(false);
    expect(startB()).toEqual({ ok: false, reason: "unsaved_completion" });
    expect(window.localStorage.getItem("fairplayr.matchSetup.v1")).toBe(storedA);

    // Once it works, A's completion is rebuilt from the device as it was ended.
    fullDevice.mockRestore();
    expect(completion.retrySavingUnsavedMatchCompletions()).toBe(true);
    const pendingA = getPendingMatchCompletion(MATCH_A);
    expect(pendingA).toMatchObject({
      matchId: MATCH_A,
      endedAt: ended!.completion!.endedAt,
      userId: USER,
      needsCreate: true,
      info: { teamId: TEAM, startsAt: KICKOFF_A, format: "7v7" },
      body: { status: "completed", scoreFor: 2, scoreAgainst: 0, reportEnabled: true },
    });
    expect(pendingA?.body).toEqual(ended!.completion!.body);
    expect(completion.hasUnsavedMatchCompletion()).toBe(false);

    // B may start now, and A's completion stays queued for the server.
    expect(startB().ok).toBe(true);
    expect(getStoredMatchSetup()).toMatchObject({ status: "active", serverMatchId: MATCH_B, endedCompletion: null });
    expect(getPendingMatchCompletion(MATCH_A)?.body).toMatchObject({ scoreFor: 2 });
  });

  it("MATCH-13-F4: a confirmed completion releases the ended match", async () => {
    stubServer(async (request) =>
      request.method === "POST"
        ? Response.json({ match: { id: MATCH_A } }, { status: 201 })
        : new Response(null, { status: 204 })
    );
    // Fresh modules: nothing left in memory from an earlier test.
    vi.resetModules();
    const recovery = await import("@/lib/match/activeMatchRecovery");
    const completion = await import("@/lib/match/matchCompletion");
    recovery.startLocalMatch(setup("setup-A"), MATCH_A, {
      serverLink: { ownerUserId: USER, pendingCreate: { title: "Kamp A", startsAt: KICKOFF_A } },
    });
    const ended = recovery.endLocalActiveMatch();
    expect(getStoredMatchSetup()?.endedCompletion).toEqual({
      endedAt: ended!.completion!.endedAt,
      reportEnabled: true,
    });

    expect(completion.hasUnsavedMatchCompletion()).toBe(true);
    await expect(
      completion.submitMatchCompletion(MATCH_A, ended!.completion!.body, ended!.completion!.endedAt, ended!.completion!)
    ).resolves.toEqual({ status: "completed" });

    expect(getPendingMatchCompletion(MATCH_A)).toBeNull();
    expect(getStoredMatchSetup()).toMatchObject({ status: "ended", serverMatchId: MATCH_A, endedCompletion: null });
    expect(completion.hasUnsavedMatchCompletion()).toBe(false);
    expect(recovery.startLocalMatch(setup("setup-B"), MATCH_B).ok).toBe(true);
  });
});
