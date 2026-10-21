import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyVersion,
  getStorageSignalSnapshot,
  isQuotaExceededError,
  isStorageNewerVersionError,
  readStoredEnvelopeVersion,
  resetStorageSignalsForTests,
  safeRemoveItem,
  safeSetItem,
  setItemOrThrow,
  StorageNewerVersionError,
  subscribeStorageSignals,
} from "@/lib/storage/storageEnvelope";

const KEY = "fairplayr.test.v1";

function quotaError() {
  return new DOMException("The quota has been exceeded.", "QuotaExceededError");
}

describe("storageEnvelope", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    resetStorageSignalsForTests();
  });

  it("classifies stored versions against the current one", () => {
    expect(classifyVersion(2, 2)).toBe("current");
    expect(classifyVersion(1, 2)).toBe("older");
    expect(classifyVersion(3, 2)).toBe("newer");
    expect(classifyVersion("2", 2)).toBe("invalid");
    expect(classifyVersion(undefined, 2)).toBe("invalid");
    expect(classifyVersion(Number.NaN, 2)).toBe("invalid");
  });

  it("reads the version of a stored envelope and tolerates junk", () => {
    expect(readStoredEnvelopeVersion(JSON.stringify({ version: 4, extra: true }))).toBe(4);
    expect(readStoredEnvelopeVersion("not json")).toBeNull();
    expect(readStoredEnvelopeVersion(null)).toBeNull();
    expect(readStoredEnvelopeVersion(JSON.stringify({ noVersion: 1 }))).toBeNull();
  });

  it("writes over older, equal and unversioned data", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1 }));
    expect(safeSetItem(KEY, JSON.stringify({ version: 2, a: 1 }), 2)).toEqual({ ok: true });
    expect(safeSetItem(KEY, JSON.stringify({ version: 2, a: 2 }), 2)).toEqual({ ok: true });
    window.localStorage.setItem(KEY, "garbage");
    expect(safeSetItem(KEY, JSON.stringify({ version: 2, a: 3 }), 2)).toEqual({ ok: true });
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({ version: 2, a: 3 });
  });

  it("never writes over data from a newer build and raises the update signal", () => {
    const newer = JSON.stringify({ version: 5, liveMatch: { future: true } });
    window.localStorage.setItem(KEY, newer);
    const listener = vi.fn();
    const unsubscribe = subscribeStorageSignals(listener);

    expect(safeSetItem(KEY, JSON.stringify({ version: 4 }), 4)).toEqual({ ok: false, reason: "newer_version" });
    expect(window.localStorage.getItem(KEY)).toBe(newer);
    expect(getStorageSignalSnapshot().newerVersionKeys).toEqual([KEY]);
    expect(listener).toHaveBeenCalled();

    // Removing it is refused too.
    expect(safeRemoveItem(KEY, 4)).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe(newer);
    unsubscribe();
  });

  it("reports a quota error without throwing, and clears it after a later successful write", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw quotaError();
    });

    expect(safeSetItem(KEY, "{}", 1)).toEqual({ ok: false, reason: "quota" });
    expect(getStorageSignalSnapshot().writeErrors[KEY]?.reason).toBe("quota");

    setItem.mockRestore();
    expect(safeSetItem(KEY, JSON.stringify({ version: 1 }), 1)).toEqual({ ok: true });
    expect(getStorageSignalSnapshot().writeErrors[KEY]).toBeUndefined();
  });

  it("setItemOrThrow throws for every failed write, a newer build's data included", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw quotaError();
    });
    expect(() => setItemOrThrow(KEY, "{}", 1)).toThrow(/quota/);
    vi.restoreAllMocks();

    window.localStorage.setItem(KEY, JSON.stringify({ version: 9 }));
    let thrown: unknown = null;
    try {
      setItemOrThrow(KEY, JSON.stringify({ version: 1 }), 1);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(StorageNewerVersionError);
    expect(isStorageNewerVersionError(thrown)).toBe(true);
    expect((thrown as StorageNewerVersionError).key).toBe(KEY);
    expect(JSON.parse(window.localStorage.getItem(KEY)!).version).toBe(9);
    expect(getStorageSignalSnapshot().newerVersionKeys).toContain(KEY);
  });

  it("reads the leading version without parsing the record, and falls back to a full parse", () => {
    expect(readStoredEnvelopeVersion('{"version":3,"liveMatch":{"x":1}}')).toBe(3);
    expect(readStoredEnvelopeVersion('{"liveMatch":{"version":9},"version":2}')).toBe(2);
    expect(readStoredEnvelopeVersion('{"version":"2"}')).toBeNull();
    expect(readStoredEnvelopeVersion("not json")).toBeNull();
    expect(readStoredEnvelopeVersion(null)).toBeNull();
  });

  it("recognises quota errors across browsers", () => {
    expect(isQuotaExceededError(quotaError())).toBe(true);
    expect(isQuotaExceededError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError(new Error("other"))).toBe(false);
  });
});
