// FEAT-SHARE-01: signals from one operation become one read, reads never run
// in parallel, and a signal during a read is never lost.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRefreshCoordinator } from "@/lib/share/publicRefresh";

describe("createRefreshCoordinator", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("merges a burst of requests into one read", async () => {
    const run = vi.fn(async () => {});
    const coordinator = createRefreshCoordinator(run, { coalesceMs: 250, minIntervalMs: 2_000, now: () => Date.now() });
    coordinator.request();
    coordinator.request();
    coordinator.request();
    await vi.advanceTimersByTimeAsync(300);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never reads twice at once, and reads once more after a request made during a read", async () => {
    let active = 0;
    let maxActive = 0;
    let release: () => void = () => {};
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          release = () => {
            active -= 1;
            resolve();
          };
        })
    );
    const coordinator = createRefreshCoordinator(run, { coalesceMs: 250, minIntervalMs: 2_000, now: () => Date.now() });

    coordinator.request();
    await vi.advanceTimersByTimeAsync(250);
    expect(run).toHaveBeenCalledTimes(1);

    coordinator.request();
    coordinator.request();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(run).toHaveBeenCalledTimes(2);
    release();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });

  it("does nothing after dispose", async () => {
    const run = vi.fn(async () => {});
    const coordinator = createRefreshCoordinator(run, { coalesceMs: 250, minIntervalMs: 2_000, now: () => Date.now() });
    coordinator.request();
    coordinator.dispose();
    coordinator.request();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).not.toHaveBeenCalled();
  });
});
