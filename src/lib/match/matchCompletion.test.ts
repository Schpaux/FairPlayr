import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  retryPendingMatchCompletion,
  submitMatchCompletion,
} from "@/lib/match/matchCompletion";
import {
  getPendingMatchCompletion,
  savePendingMatchCompletion,
  type MatchCompletionBody,
} from "@/lib/storage/pendingMatchCompletionStorage";

const BODY: MatchCompletionBody = {
  status: "completed",
  scoreFor: 2,
  scoreAgainst: 1,
  reportEnabled: true,
  runtimeState: null,
};

describe("submitMatchCompletion", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears the pending record once the server confirms", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitMatchCompletion("m1", BODY)).resolves.toEqual({ status: "completed" });
    expect(getPendingMatchCompletion("m1")).toBeNull();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/matches/m1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ ...BODY, endedAt: expect.any(String) });
  });

  it("keeps the completion pending when the network request rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(
      submitMatchCompletion("m1", BODY, "2026-04-15T10:30:00.000Z")
    ).resolves.toEqual({ status: "offline", persisted: true });

    expect(getPendingMatchCompletion("m1")).toEqual({
      matchId: "m1",
      body: BODY,
      endedAt: "2026-04-15T10:30:00.000Z",
    });
  });

  it("writes the pending record before the request is sent", async () => {
    let pendingDuringRequest: unknown = undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        pendingDuringRequest = getPendingMatchCompletion("m1");
        return new Response(null, { status: 204 });
      })
    );

    await submitMatchCompletion("m1", BODY);

    expect(pendingDuringRequest).not.toBeNull();
  });

  it("returns a null message for a non-JSON error response and keeps the record", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }))
    );

    await expect(submitMatchCompletion("m1", BODY)).resolves.toEqual({
      status: "failed",
      message: null,
      persisted: true,
    });
    expect(getPendingMatchCompletion("m1")).not.toBeNull();
  });

  it("surfaces the API error message when one is provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ message: "Ugyldig forespørsel." }, { status: 400 }))
    );

    await expect(submitMatchCompletion("m1", BODY)).resolves.toEqual({
      status: "failed",
      message: "Ugyldig forespørsel.",
      persisted: true,
    });
  });
});

describe("submitMatchCompletion when device storage cannot be written", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function failStorageWrites(error: unknown) {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw error;
    });
  }

  it.each([
    ["QuotaExceededError", new DOMException("The quota has been exceeded.", "QuotaExceededError")],
    // Older WebKit / Firefox name for the same condition.
    ["NS_ERROR_DOM_QUOTA_REACHED", new DOMException("Quota reached.", "NS_ERROR_DOM_QUOTA_REACHED")],
    ["a generic SecurityError", new DOMException("Access denied.", "SecurityError")],
  ])("reports persisted: false offline when the write throws %s", async (_label, error) => {
    failStorageWrites(error);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(submitMatchCompletion("m1", BODY)).resolves.toEqual({
      status: "offline",
      persisted: false,
    });
    expect(getPendingMatchCompletion("m1")).toBeNull();
  });

  it("reports persisted: false for a server error when the write fails", async () => {
    failStorageWrites(new DOMException("The quota has been exceeded.", "QuotaExceededError"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(submitMatchCompletion("m1", BODY)).resolves.toEqual({
      status: "failed",
      message: null,
      persisted: false,
    });
  });

  it("still sends the completion and reports success when the write fails", async () => {
    failStorageWrites(new DOMException("The quota has been exceeded.", "QuotaExceededError"));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitMatchCompletion("m1", BODY)).resolves.toEqual({ status: "completed" });
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({
      ...BODY,
      endedAt: expect.any(String),
    });
  });

  it("keeps other matches' pending completions intact when a new write fails", async () => {
    savePendingMatchCompletion({ matchId: "m1", body: BODY, endedAt: "2026-04-15T10:30:00.000Z" });
    failStorageWrites(new DOMException("The quota has been exceeded.", "QuotaExceededError"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await submitMatchCompletion("m2", { ...BODY, scoreFor: 5 });

    expect(getPendingMatchCompletion("m1")).toEqual({
      matchId: "m1",
      body: BODY,
      endedAt: "2026-04-15T10:30:00.000Z",
    });
    expect(getPendingMatchCompletion("m2")).toBeNull();
  });

  it("persists on a later retry once storage has room again", async () => {
    const quota = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(submitMatchCompletion("m1", BODY, "2026-04-15T10:30:00.000Z")).resolves.toMatchObject({
      persisted: false,
    });

    quota.mockRestore();

    await expect(submitMatchCompletion("m1", BODY, "2026-04-15T10:30:00.000Z")).resolves.toEqual({
      status: "offline",
      persisted: true,
    });
    expect(getPendingMatchCompletion("m1")?.endedAt).toBe("2026-04-15T10:30:00.000Z");
  });
});

describe("submitMatchCompletion concurrency", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends one request for simultaneous completions of the same match", async () => {
    let respond: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => {
        respond = resolve;
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = submitMatchCompletion("m1", BODY);
    const second = submitMatchCompletion("m1", BODY);
    respond(new Response(null, { status: 204 }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "completed" },
      { status: "completed" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not share in-flight requests between different matches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([submitMatchCompletion("m1", BODY), submitMatchCompletion("m2", BODY)]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows a new attempt once the previous one has settled", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await submitMatchCompletion("m1", BODY);
    await submitMatchCompletion("m1", BODY);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("retryPendingMatchCompletion", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when nothing is pending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(retryPendingMatchCompletion("m1")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recovers from offline to online by re-sending the stored body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await submitMatchCompletion("m1", BODY, "2026-04-15T10:30:00.000Z");

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(retryPendingMatchCompletion("m1")).resolves.toEqual({ status: "completed" });
    expect(getPendingMatchCompletion("m1")).toBeNull();
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({
      ...BODY,
      endedAt: "2026-04-15T10:30:00.000Z",
    });
  });

  it("only touches the requested match", async () => {
    savePendingMatchCompletion({ matchId: "m1", body: BODY, endedAt: "2026-04-15T10:30:00.000Z" });
    savePendingMatchCompletion({ matchId: "m2", body: BODY, endedAt: "2026-04-15T11:30:00.000Z" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await retryPendingMatchCompletion("m1");

    expect(getPendingMatchCompletion("m1")).toBeNull();
    expect(getPendingMatchCompletion("m2")).not.toBeNull();
  });

  it("ignores corrupt pending storage", async () => {
    window.localStorage.setItem("fairplayr.pendingMatchCompletions.v1", "{not json");

    await expect(retryPendingMatchCompletion("m1")).resolves.toBeNull();
  });
});

describe("offline completion keeps the coach's end time", () => {
  // Ended at 18:30 local time (Oslo, summer time); synced the next morning.
  const ENDED_AT = "2026-10-15T16:30:00.000Z";
  const NEXT_MORNING = "2026-10-16T06:05:00.000Z";

  function sentEndedAt(fetchMock: ReturnType<typeof vi.fn>, call: number): unknown {
    return JSON.parse((fetchMock.mock.calls[call] as [string, RequestInit])[1].body as string).endedAt;
  }

  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends the end time with the completion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await submitMatchCompletion("m1", BODY, ENDED_AT);

    expect(sentEndedAt(fetchMock, 0)).toBe(ENDED_AT);
  });

  it("delayed sync the next morning still sends 18:30, not the sync time", async () => {
    vi.setSystemTime(new Date(ENDED_AT));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await submitMatchCompletion("m1", BODY, ENDED_AT);

    vi.setSystemTime(new Date(NEXT_MORNING));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(retryPendingMatchCompletion("m1")).resolves.toEqual({ status: "completed" });
    expect(sentEndedAt(fetchMock, 0)).toBe(ENDED_AT);
  });

  it("repeated retries never replace the stored end time, even when given a newer one", async () => {
    vi.setSystemTime(new Date(ENDED_AT));
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await submitMatchCompletion("m1", BODY, ENDED_AT);

    // Reconnect events, the details page's "save now" and a caller that
    // falls back to the default (now) all retry later.
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));
    await retryPendingMatchCompletion("m1");
    await submitMatchCompletion("m1", BODY);
    vi.setSystemTime(new Date(NEXT_MORNING));
    await submitMatchCompletion("m1", BODY, NEXT_MORNING);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect([0, 1, 2, 3].map((call) => sentEndedAt(fetchMock, call))).toEqual([
      ENDED_AT,
      ENDED_AT,
      ENDED_AT,
      ENDED_AT,
    ]);
    expect(getPendingMatchCompletion("m1")?.endedAt).toBe(ENDED_AT);
  });

  it("refresh before reconnecting keeps the end time (fresh module, same device storage)", async () => {
    vi.setSystemTime(new Date(ENDED_AT));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await submitMatchCompletion("m1", BODY, ENDED_AT);

    // A page reload: module state (the in-flight map) is gone, storage stays.
    vi.resetModules();
    const reloaded = await import("@/lib/match/matchCompletion");

    vi.setSystemTime(new Date(NEXT_MORNING));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(reloaded.retryPendingMatchCompletion("m1")).resolves.toEqual({ status: "completed" });
    expect(sentEndedAt(fetchMock, 0)).toBe(ENDED_AT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
