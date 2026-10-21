import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkClosedGapOncePerDocument,
  getDocumentClosedGap,
  getLiveHeartbeat,
  getRunningHeartbeatMatchId,
  keepLiveHeartbeat,
  LIVE_HEARTBEAT_INTERVAL_MS,
  LIVE_HEARTBEAT_KEY,
  resetLiveHeartbeatSessionForTests,
  saveLiveHeartbeat,
} from "@/lib/storage/liveHeartbeatStorage";
import { requestPersistentStorage, resetPersistentStorageRequestForTests } from "@/lib/storage/persistentStorage";
import { resetStorageSignalsForTests } from "@/lib/storage/storageEnvelope";

describe("liveHeartbeatStorage", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    resetStorageSignalsForTests();
  });

  it("round-trips the last heartbeat", () => {
    saveLiveHeartbeat("lm-1", 1234);
    expect(getLiveHeartbeat()).toEqual({ matchId: "lm-1", atMs: 1234 });
  });

  it("ignores junk and never throws on a full device", () => {
    window.localStorage.setItem(LIVE_HEARTBEAT_KEY, "nope");
    expect(getLiveHeartbeat()).toBeNull();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(saveLiveHeartbeat("lm-1", 1)).toBe(false);
  });
});

describe("persistentStorage", () => {
  const setStorage = (value: unknown) => {
    Object.defineProperty(navigator, "storage", { configurable: true, get: () => value });
  };

  afterEach(() => {
    resetPersistentStorageRequestForTests();
    setStorage(undefined);
  });

  it("asks once and tolerates browsers without the API or a failing call", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    setStorage({ persist, persisted: vi.fn().mockResolvedValue(false) });

    await expect(requestPersistentStorage()).resolves.toBe(true);
    await requestPersistentStorage();
    expect(persist).toHaveBeenCalledTimes(1);

    resetPersistentStorageRequestForTests();
    setStorage(undefined);
    await expect(requestPersistentStorage()).resolves.toBeNull();

    resetPersistentStorageRequestForTests();
    setStorage({ persist: vi.fn().mockRejectedValue(new Error("denied")) });
    await expect(requestPersistentStorage()).resolves.toBeNull();
  });

  describe("document-wide heartbeat", () => {
    afterEach(() => {
      resetLiveHeartbeatSessionForTests();
      vi.useRealTimers();
    });

    it("keeps beating every 15 s without the live screen, and stops when the match is no longer active", () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      let active = true;
      keepLiveHeartbeat("lm-1", () => active);
      expect(getLiveHeartbeat()).toEqual({ matchId: "lm-1", atMs: 1_000_000 });

      vi.advanceTimersByTime(3 * 60_000);
      expect(getLiveHeartbeat()?.atMs).toBe(1_000_000 + 3 * 60_000);

      active = false;
      vi.advanceTimersByTime(LIVE_HEARTBEAT_INTERVAL_MS);
      expect(getRunningHeartbeatMatchId()).toBeNull();
      const last = getLiveHeartbeat()?.atMs;
      vi.advanceTimersByTime(60_000);
      expect(getLiveHeartbeat()?.atMs).toBe(last);
    });

    it("one heartbeat at a time: a new match replaces the old one", () => {
      keepLiveHeartbeat("lm-1", () => true);
      keepLiveHeartbeat("lm-2", () => true);
      expect(getRunningHeartbeatMatchId()).toBe("lm-2");
      expect(getLiveHeartbeat()?.matchId).toBe("lm-2");
    });

    it("beats when the page is hidden", () => {
      vi.useFakeTimers();
      vi.setSystemTime(5_000);
      keepLiveHeartbeat("lm-1", () => true);
      vi.setSystemTime(9_000);
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      expect(getLiveHeartbeat()?.atMs).toBe(9_000);
    });
  });

  describe("closed-app gap, once per document", () => {
    afterEach(() => {
      resetLiveHeartbeatSessionForTests();
    });

    it("evaluates on the first restore only and remembers the result for the session", () => {
      const evaluate = vi.fn(() => ({ matchId: "lm-1", minutes: 7 }));

      expect(checkClosedGapOncePerDocument(evaluate)).toEqual({ firstCheck: true, gap: { matchId: "lm-1", minutes: 7 } });
      expect(checkClosedGapOncePerDocument(evaluate)).toEqual({ firstCheck: false, gap: { matchId: "lm-1", minutes: 7 } });
      expect(evaluate).toHaveBeenCalledTimes(1);
      expect(getDocumentClosedGap()).toEqual({ matchId: "lm-1", minutes: 7 });
    });
  });
});
