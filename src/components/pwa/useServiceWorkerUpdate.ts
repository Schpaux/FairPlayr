"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Serwist } from "@serwist/window";
import { resolveLocalActiveMatch } from "@/lib/match/activeMatchRecovery";
import {
  SW_SCOPE,
  SW_SCRIPT_URL,
  registrationAction,
  resolveSwMode,
  type RegistrationAction,
} from "@/lib/pwa/contracts";
import { CACHE_PREFIX } from "@/sw/cacheNames";
import { MESSAGE } from "@/sw/protocol";

/**
 * Registers the service worker once per page and tracks whether a new build
 * is waiting (FP-OFF-01 §2.2).
 *
 * - Registered with `@serwist/window` directly (not SerwistProvider, §S.1),
 *   `updateViaCache: "none"`.
 * - A waiting worker is only reported when another one already controls the
 *   page: that is an update. A first install is not.
 * - Update gate: the page tells the worker whether a match is active on this
 *   device (`postMatchActive`, on every load and whenever it changes). While
 *   one is, a new build fails its install, so it can never activate at a
 *   cold start mid-match. When the match ends the page checks for an update
 *   right away.
 * - `applyUpdate()` (after the coach agrees, and only when no match is
 *   active; the caller checks) sends SKIP_WAITING and reloads exactly once,
 *   on the `controllerchange` that follows.
 * - Every tab listens for `controllerchange` from the start. A tab that did
 *   not ask for the update (another tab did) reloads once only when no match
 *   is active on the device; with a match it stays on its build until the
 *   next cold start. A tab never reloads into the kill-switch worker.
 * - `updateForNewerData()` is the D4 path (stored data is newer than this
 *   build): the one sanctioned activation mid-match, see UpdateRequiredSheet.
 * - Updates are checked on `online` and when the page becomes visible.
 */

export function currentRegistrationAction(): RegistrationAction {
  return registrationAction({
    nodeEnv: process.env.NODE_ENV,
    mode: resolveSwMode(process.env.NEXT_PUBLIC_FP_SW),
    devOptIn: process.env.NEXT_PUBLIC_FP_SW_DEV,
  });
}

type Listener = () => void;

interface SwClientState {
  updateReady: boolean;
  updating: boolean;
}

/** Why this tab expects a controllerchange: the coach agreed, or D4. */
type PendingReload = "consent" | "newer-data" | null;

export const UPDATE_TIMEOUT_MS = 10_000;
const ACK_TIMEOUT_MS = 1500;
const INSTALL_TIMEOUT_MS = 30_000;

let state: SwClientState = { updateReady: false, updating: false };
const listeners = new Set<Listener>();
let started = false;
let registration: ServiceWorkerRegistration | null = null;
let serwist: Serwist | null = null;
let reloaded = false;
let pendingReload: PendingReload = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let hadController = false;
let lastMatchActive: boolean | null = null;
let reloadPage: () => void = () => window.location.reload();

function setState(next: Partial<SwClientState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function recompute() {
  const waiting = registration?.waiting ?? null;
  const ready = Boolean(waiting && registration?.active && navigator.serviceWorker.controller);
  if (ready !== state.updateReady) setState({ updateReady: ready });
}

function isOwnWorker(worker: ServiceWorker | null | undefined): boolean {
  if (!worker) return false;
  try {
    return new URL(worker.scriptURL).pathname === SW_SCRIPT_URL;
  } catch {
    return false;
  }
}

function canUseWorker(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && currentRegistrationAction() === "register";
}

async function unregisterAll() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((item) => isOwnWorker(item.active) || isOwnWorker(item.waiting) || isOwnWorker(item.installing))
      .map((item) => item.unregister())
  );
  if (typeof caches !== "undefined") {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)));
  }
}

/** Posts to a worker and waits for its reply on a port, or gives up. */
function request(worker: ServiceWorker, message: unknown, timeoutMs = ACK_TIMEOUT_MS): Promise<unknown> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    try {
      worker.postMessage(message, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function currentRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (registration) return registration;
  try {
    return (await navigator.serviceWorker.getRegistration(SW_SCOPE)) ?? null;
  } catch {
    return null;
  }
}

/** Asks the browser to look for a new worker now. Never throws. */
export async function checkForUpdate(): Promise<void> {
  if (!canUseWorker()) return;
  const reg = await currentRegistration();
  try {
    await reg?.update();
  } catch {
    // Offline or the server is unreachable: try again on the next trigger.
  }
}

function clearPending() {
  pendingReload = null;
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = null;
}

/** The one place that reloads. Never twice, and never into a running match unless D4 asks. */
function reloadOnce(reason: PendingReload | "other-tab") {
  if (reloaded) return;
  if (reason !== "newer-data" && resolveLocalActiveMatch()) return;
  reloaded = true;
  reloadPage();
}

async function onControllerChange() {
  const controller = navigator.serviceWorker.controller;
  const wasControlled = hadController;
  hadController = Boolean(controller);
  recompute();

  // First install: the worker claimed an uncontrolled page. Nothing changed for it.
  if (!wasControlled) return;

  const reason = pendingReload;
  if (reason !== null) {
    clearPending();
    reloadOnce(reason);
    return;
  }

  // Another tab agreed to the update. Stay on this build while a match runs.
  if (resolveLocalActiveMatch() || !controller) return;
  // The kill switch also takes over every page; a reload would only land on
  // a worker that is unregistering itself.
  const status = (await request(controller, { type: MESSAGE.getStatus })) as { mode?: string } | null;
  if (status?.mode === "off") return;
  reloadOnce("other-tab");
}

function watch(reg: ServiceWorkerRegistration) {
  reg.addEventListener("updatefound", () => {
    reg.installing?.addEventListener("statechange", recompute);
    recompute();
  });
  const check = () => {
    void reg.update().catch(() => {
      // Offline or the server is unreachable: try again on the next trigger.
    });
  };
  window.addEventListener("online", check);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
}

export function startServiceWorker(): void {
  if (started || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  started = true;
  const action = currentRegistrationAction();

  if (action === "skip") return;
  if (action === "unregister") {
    void unregisterAll().catch(() => undefined);
    return;
  }

  hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    void onControllerChange();
  });

  serwist = new Serwist(SW_SCRIPT_URL, { scope: SW_SCOPE, type: "classic", updateViaCache: "none" });
  serwist.addEventListener("waiting", recompute);
  serwist.addEventListener("installed", recompute);
  serwist.addEventListener("controlling", recompute);
  void serwist
    .register()
    .then((reg) => {
      if (!reg) return;
      registration = reg;
      watch(reg);
      recompute();
    })
    .catch(() => {
      // No worker (private mode, blocked): the app still works online.
    });
}

/** Posts the shown locale to the worker, for `/` offline (§S.6). */
export function postLocale(locale: string): void {
  if (!canUseWorker()) return;
  void navigator.serviceWorker.ready
    .then((reg) => reg.active?.postMessage({ type: MESSAGE.setLocale, locale }))
    .catch(() => undefined);
}

/**
 * Tells the worker whether a match is active on this device (the update
 * gate). Waits for the worker's acknowledgement. When no match is active
 * (any more), checks for an update straight away: one that was refused
 * during the match installs now and is offered by the prompt.
 */
export async function postMatchActive(active: boolean): Promise<void> {
  if (!canUseWorker()) return;
  const previous = lastMatchActive;
  lastMatchActive = active;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active) await request(reg.active, { type: MESSAGE.setMatchActive, active });
  } catch {
    return;
  }
  if (!active && previous !== false) await checkForUpdate();
}

function startPending(reason: Exclude<PendingReload, null>, onTimeout: () => void) {
  clearPending();
  pendingReload = reason;
  // If the worker never takes over (it went redundant), stop waiting: a late
  // controllerchange is then treated like another tab's update, which never
  // reloads into a running match.
  pendingTimer = setTimeout(() => {
    pendingReload = null;
    pendingTimer = null;
    onTimeout();
  }, UPDATE_TIMEOUT_MS);
}

export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting || state.updating || reloaded) return;
  setState({ updating: true });
  startPending("consent", () => {
    if (!reloaded) {
      setState({ updating: false });
      recompute();
    }
  });
  waiting.postMessage({ type: MESSAGE.skipWaiting });
}

function waitForInstalled(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    if (worker.state === "installed" || worker.state === "activating" || worker.state === "activated") {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => resolve(false), INSTALL_TIMEOUT_MS);
    const onChange = () => {
      if (worker.state === "installed" || worker.state === "activated") {
        clearTimeout(timer);
        worker.removeEventListener("statechange", onChange);
        resolve(true);
      } else if (worker.state === "redundant") {
        clearTimeout(timer);
        worker.removeEventListener("statechange", onChange);
        resolve(false);
      }
    };
    worker.addEventListener("statechange", onChange);
  });
}

function activateForNewerData(waiting: ServiceWorker) {
  startPending("newer-data", () => reloadOnce("newer-data"));
  waiting.postMessage({ type: MESSAGE.skipWaiting });
}

/**
 * D4: data on the device is newer than this build. Activates a waiting
 * worker (SKIP_WAITING, one reload on controllerchange); otherwise asks the
 * worker for a one-shot exception to the update gate, looks for the new
 * build and activates it once installed; otherwise reloads. Reloads at most
 * once. Mid-match on purpose: this build can no longer save.
 */
export async function updateForNewerData(): Promise<void> {
  if (reloaded || pendingReload !== null) return;
  const reg = canUseWorker() ? await currentRegistration() : null;
  if (!reg) {
    reloadOnce("newer-data");
    return;
  }

  if (reg.waiting) {
    activateForNewerData(reg.waiting);
    return;
  }

  if (reg.active) await request(reg.active, { type: MESSAGE.allowUpdateOnce });
  try {
    await reg.update();
  } catch {
    // Offline: nothing newer to fetch; the reload below loads what is active.
  }
  const installing = reg.installing ?? reg.waiting;
  if (installing && (await waitForInstalled(installing)) && reg.waiting) {
    activateForNewerData(reg.waiting);
    return;
  }
  reloadOnce("newer-data");
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const serverState: SwClientState = { updateReady: false, updating: false };

export function useServiceWorkerUpdate() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => serverState
  );
  useEffect(() => {
    startServiceWorker();
  }, []);

  const apply = useCallback(() => applyUpdate(), []);
  return { updateReady: snapshot.updateReady, updating: snapshot.updating, applyUpdate: apply };
}

/** Test seam: replaces `location.reload()`. */
export function __setReloadForTests(reload: () => void) {
  reloadPage = reload;
}

/** Test seam: resets module state between unit tests. */
export function __resetServiceWorkerClientForTests() {
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  state = { updateReady: false, updating: false };
  listeners.clear();
  started = false;
  registration = null;
  serwist = null;
  reloaded = false;
  pendingReload = null;
  pendingTimer = null;
  hadController = false;
  lastMatchActive = null;
  reloadPage = () => window.location.reload();
}
