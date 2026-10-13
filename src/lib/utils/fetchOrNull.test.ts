import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOrNull,
  isConnectivityError,
  readErrorMessage,
  readJsonOrNull,
} from "@/lib/utils/fetchOrNull";

describe("fetchOrNull", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the response when the request completes", async () => {
    const response = new Response("{}", { status: 500 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(fetchOrNull("/api/matches/1")).resolves.toBe(response);
  });

  it("resolves to null quietly when the network is unavailable", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(fetchOrNull("/api/matches/1", { method: "PATCH" })).resolves.toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("resolves to null quietly when the request is aborted", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"))
    );

    await expect(fetchOrNull("/api/matches/1")).resolves.toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("reports unexpected errors instead of hiding them, without rejecting", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const bug = new Error("fetch polyfill exploded");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(bug));

    await expect(fetchOrNull("/api/matches/1")).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("unexpected"), bug);
  });
});

describe("isConnectivityError", () => {
  it("classifies network, abort and timeout failures as connectivity errors", () => {
    expect(isConnectivityError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isConnectivityError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isConnectivityError(new DOMException("timed out", "TimeoutError"))).toBe(true);
  });

  it("does not classify other errors as connectivity errors", () => {
    expect(isConnectivityError(new Error("boom"))).toBe(false);
    expect(isConnectivityError(new RangeError("bad"))).toBe(false);
    expect(isConnectivityError("Failed to fetch")).toBe(false);
  });
});

describe("readJsonOrNull", () => {
  it("parses a JSON body", async () => {
    await expect(readJsonOrNull(Response.json({ ok: true }))).resolves.toEqual({ ok: true });
  });

  it("returns null for empty, non-JSON or already-consumed bodies", async () => {
    await expect(readJsonOrNull(new Response(null, { status: 204 }))).resolves.toBeNull();
    await expect(readJsonOrNull(new Response("<html>502</html>"))).resolves.toBeNull();

    const consumed = Response.json({ ok: true });
    await consumed.text();
    await expect(readJsonOrNull(consumed)).resolves.toBeNull();
  });
});

describe("readErrorMessage", () => {
  it("returns the API message when present", async () => {
    const response = Response.json({ message: "Ugyldig forespørsel." }, { status: 400 });

    await expect(readErrorMessage(response)).resolves.toBe("Ugyldig forespørsel.");
  });

  it("returns null for non-JSON, empty or malformed error bodies", async () => {
    await expect(
      readErrorMessage(new Response("<html>Bad Gateway</html>", { status: 502 }))
    ).resolves.toBeNull();
    await expect(readErrorMessage(new Response("", { status: 500 }))).resolves.toBeNull();
    await expect(readErrorMessage(Response.json(null, { status: 500 }))).resolves.toBeNull();
    await expect(readErrorMessage(Response.json({ message: 42 }, { status: 500 }))).resolves.toBeNull();
    await expect(readErrorMessage(Response.json({ message: "  " }, { status: 500 }))).resolves.toBeNull();
    await expect(readErrorMessage(Response.json(["x"], { status: 500 }))).resolves.toBeNull();
  });
});
