// UI-SPOND-01: the Spond connection as a tri-state (plus guest), so nothing
// says "not connected" while checking or after a failed check.
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSpondConnection, useSpondStatus } from "@/components/team/useSpondStatus";
import type { TeamStorageMode } from "@/lib/teamData/types";

const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSpondConnection", () => {
  it("is guest without a cloud session or without a team, and does not fetch", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(renderHook(() => useSpondConnection("team-1", "guest-local")).result.current).toBe("guest");
    expect(renderHook(() => useSpondConnection(null, "cloud")).result.current).toBe("guest");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is checking while the request is in flight, then connected", async () => {
    let resolve: (response: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSpondConnection("team 1", "cloud"));
    expect(result.current).toBe("checking");
    expect(fetchMock).toHaveBeenCalledWith("/api/integrations/spond/status?teamId=team%201", { method: "GET" });

    resolve({ ok: true, json: () => Promise.resolve({ connected: true }) } as Response);
    await waitFor(() => expect(result.current).toBe("connected"));
  });

  it("is disconnected when the server says so", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ connected: false })));
    const { result } = renderHook(() => useSpondConnection("team-1", "cloud"));
    await waitFor(() => expect(result.current).toBe("disconnected"));
  });

  it("is unavailable on a non-ok response and on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ errorCode: "UNAUTHORIZED" }, false)));
    const failed = renderHook(() => useSpondConnection("team-1", "cloud"));
    await waitFor(() => expect(failed.result.current).toBe("unavailable"));

    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
    const offline = renderHook(() => useSpondConnection("team-2", "cloud"));
    await waitFor(() => expect(offline.result.current).toBe("unavailable"));
  });

  it("checks again on a team switch, without showing the previous team's answer", async () => {
    let resolveSecond: (response: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => json({ connected: true }))
      .mockImplementationOnce(() => new Promise<Response>((r) => (resolveSecond = r)));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ teamId, mode }) => useSpondConnection(teamId, mode), {
      initialProps: { teamId: "team-1", mode: "cloud" as TeamStorageMode },
    });
    await waitFor(() => expect(result.current).toBe("connected"));

    rerender({ teamId: "team-2", mode: "cloud" });
    expect(result.current).toBe("checking");
    resolveSecond({ ok: true, json: () => Promise.resolve({ connected: false }) } as Response);
    await waitFor(() => expect(result.current).toBe("disconnected"));

    rerender({ teamId: "team-2", mode: "guest-local" });
    expect(result.current).toBe("guest");
  });
});

describe("useSpondStatus (unchanged contract)", () => {
  it("returns null for guests and true/false from the server", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ connected: true })));
    expect(renderHook(() => useSpondStatus("team-1", "guest-local")).result.current).toBeNull();

    const { result } = renderHook(() => useSpondStatus("team-1", "cloud"));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(true));
  });
});
