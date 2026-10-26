/**
 * FEAT-SHARE-01: when the public page reads the share again. Every reason (a
 * Realtime signal, the fallback poll, the page shown again, back online, the
 * channel (re)connected) asks here; requests that arrive close together become
 * one read, there is never more than one read at a time, and a request made
 * during a read gets one more read after it (so a signal is never lost).
 */

export interface RefreshCoordinator {
  request(): void;
  dispose(): void;
}

export interface RefreshCoordinatorOptions {
  /** Requests within this window become one read. */
  coalesceMs: number;
  /** At least this long between the starts of two reads (a burst of signals stays cheap). */
  minIntervalMs: number;
  now?: () => number;
}

export function createRefreshCoordinator(
  run: () => Promise<void>,
  { coalesceMs, minIntervalMs, now = Date.now }: RefreshCoordinatorOptions
): RefreshCoordinator {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pending = false;
  let disposed = false;
  let lastStartMs = Number.NEGATIVE_INFINITY;

  const schedule = () => {
    if (disposed || timer !== null || running || !pending) return;
    const delay = Math.max(coalesceMs, lastStartMs + minIntervalMs - now());
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
  };

  const flush = async () => {
    if (disposed || running) return;
    pending = false;
    running = true;
    lastStartMs = now();
    try {
      await run();
    } catch {
      // The read reports its own failure; the next request tries again.
    } finally {
      running = false;
      schedule();
    }
  };

  return {
    request() {
      if (disposed) return;
      pending = true;
      schedule();
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
