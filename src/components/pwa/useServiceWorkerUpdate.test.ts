import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGE } from "@/sw/protocol";

const match = vi.hoisted(() => ({ local: null as null | { id: string } }));
vi.mock("@/lib/match/activeMatchRecovery", () => ({
  resolveLocalActiveMatch: () => match.local,
}));

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = "installed";
  scriptURL = "http://localhost/serwist/sw.js";
  messages: unknown[] = [];
  /** Reply on the transferred port, as the real worker does. */
  replyWith: ((message: { type: string }) => unknown) | null = (message) => ({ type: MESSAGE.ack, of: message.type });
  postMessage(message: { type: string }, ports?: MessagePort[]) {
    this.messages.push(message);
    const reply = this.replyWith?.(message);
    if (ports?.[0] && reply !== undefined) ports[0].postMessage(reply);
  }
  setState(next: ServiceWorkerState) {
    this.state = next;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  active: FakeWorker | null = new FakeWorker();
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update = vi.fn(async () => undefined);
}

class FakeContainer extends EventTarget {
  controller: FakeWorker | null = null;
  registration = new FakeRegistration();
  ready = Promise.resolve(this.registration);
  getRegistration = vi.fn(async () => this.registration);
  getRegistrations = vi.fn(async () => [this.registration]);
  changeController(worker: FakeWorker) {
    this.controller = worker;
    this.dispatchEvent(new Event("controllerchange"));
  }
}

let container: FakeContainer;

vi.mock("@serwist/window", () => ({
  Serwist: class {
    addEventListener() {}
    register() {
      return Promise.resolve(container.registration);
    }
  },
}));

import {
  UPDATE_TIMEOUT_MS,
  __resetServiceWorkerClientForTests,
  __setReloadForTests,
  applyUpdate,
  postMatchActive,
  startServiceWorker,
  updateForNewerData,
} from "./useServiceWorkerUpdate";

const flush = async () => {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("service worker client", () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_FP_SW_DEV", "1");
    container = new FakeContainer();
    Object.defineProperty(navigator, "serviceWorker", { value: container, configurable: true });
    __resetServiceWorkerClientForTests();
    reload = vi.fn();
    __setReloadForTests(reload);
    match.local = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  async function startControlled() {
    container.controller = container.registration.active;
    startServiceWorker();
    await flush();
  }

  describe("update gate", () => {
    it("tells the worker whether a match is active, and checks for an update when it is not", async () => {
      await startControlled();
      await postMatchActive(true);
      expect(container.registration.active!.messages).toContainEqual({ type: MESSAGE.setMatchActive, active: true });
      expect(container.registration.update).not.toHaveBeenCalled();

      // The match ends: the refused update is fetched again straight away.
      await postMatchActive(false);
      expect(container.registration.active!.messages).toContainEqual({ type: MESSAGE.setMatchActive, active: false });
      expect(container.registration.update).toHaveBeenCalledTimes(1);

      // No change, no extra request.
      await postMatchActive(false);
      expect(container.registration.update).toHaveBeenCalledTimes(1);
    });
  });

  describe("controllerchange in every tab", () => {
    it("the tab that agreed reloads exactly once", async () => {
      await startControlled();
      const waiting = new FakeWorker();
      container.registration.waiting = waiting;
      applyUpdate();
      expect(waiting.messages).toContainEqual({ type: MESSAGE.skipWaiting });
      container.changeController(waiting);
      container.changeController(waiting);
      await flush();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("another tab without a match reloads once", async () => {
      await startControlled();
      const next = new FakeWorker();
      next.replyWith = () => ({ type: MESSAGE.status, mode: "on" });
      container.changeController(next);
      await flush();
      container.changeController(next);
      await flush();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("another tab with an active match stays on its build", async () => {
      match.local = { id: "m1" };
      await startControlled();
      container.changeController(new FakeWorker());
      await flush();
      expect(reload).not.toHaveBeenCalled();
    });

    it("never reloads into the kill switch", async () => {
      await startControlled();
      const kill = new FakeWorker();
      kill.replyWith = () => ({ type: MESSAGE.status, mode: "off" });
      container.changeController(kill);
      await flush();
      expect(reload).not.toHaveBeenCalled();
    });

    it("the first install's claim is not an update", async () => {
      startServiceWorker();
      await flush();
      container.changeController(container.registration.active!);
      await flush();
      expect(reload).not.toHaveBeenCalled();
    });

    it("after the 10 s timeout a late takeover does not reload into a match started meanwhile", async () => {
      await startControlled();
      vi.useFakeTimers();
      const waiting = new FakeWorker();
      container.registration.waiting = waiting;
      applyUpdate();
      vi.advanceTimersByTime(UPDATE_TIMEOUT_MS + 1);
      match.local = { id: "m2" };
      vi.useRealTimers();
      container.changeController(waiting);
      await flush();
      expect(reload).not.toHaveBeenCalled();
    });

    it("consent is re-checked at the reload itself", async () => {
      await startControlled();
      const waiting = new FakeWorker();
      container.registration.waiting = waiting;
      applyUpdate();
      match.local = { id: "m3" };
      container.changeController(waiting);
      await flush();
      expect(reload).not.toHaveBeenCalled();
    });
  });

  describe("D4: updateForNewerData", () => {
    it("activates a waiting worker even mid-match, and reloads once on takeover", async () => {
      match.local = { id: "m1" };
      await startControlled();
      const waiting = new FakeWorker();
      container.registration.waiting = waiting;
      await updateForNewerData();
      expect(waiting.messages).toContainEqual({ type: MESSAGE.skipWaiting });
      expect(reload).not.toHaveBeenCalled();
      container.changeController(waiting);
      await flush();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("without a waiting worker asks for a one-shot gate override, then activates the new build", async () => {
      match.local = { id: "m1" };
      await startControlled();
      const next = new FakeWorker();
      next.state = "installing";
      container.registration.update.mockImplementation(async () => {
        container.registration.installing = next;
      });
      const done = updateForNewerData();
      await flush();
      expect(container.registration.active!.messages).toContainEqual({ type: MESSAGE.allowUpdateOnce });
      container.registration.installing = null;
      container.registration.waiting = next;
      next.setState("installed");
      await done;
      expect(next.messages).toContainEqual({ type: MESSAGE.skipWaiting });
      container.changeController(next);
      await flush();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("with nothing newer to install, reloads once", async () => {
      match.local = { id: "m1" };
      await startControlled();
      await updateForNewerData();
      await updateForNewerData();
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });
});
