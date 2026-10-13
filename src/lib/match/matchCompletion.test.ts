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
    expect(JSON.parse(init.body as string)).toEqual(BODY);
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
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual(BODY);
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
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual(BODY);
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
