/// <reference lib="webworker" />
/**
 * FairPlayr service worker (FP-OFF-01a stream B). Built by esbuild through
 * `src/app/serwist/[path]/route.ts` and served at `/serwist/sw.js`.
 *
 * Deliberately not Serwist's runtime (`new Serwist`, `defaultCache`,
 * `SerwistProvider`): §S findings 1–2. Serwist is used to build this file and
 * inject the precache manifest; the behaviour is `engine.ts`.
 */
import type { PrecacheEntry } from "serwist";
import { createEngine } from "./engine";
import { SW_CONFIG_GLOBAL, readSwConfig } from "./protocol";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  [SW_CONFIG_GLOBAL]?: unknown;
};

const engine = createEngine({
  config: readSwConfig(self[SW_CONFIG_GLOBAL]),
  manifest: self.__SW_MANIFEST,
  origin: self.location.origin,
  caches: self.caches,
  fetch: (request) => self.fetch(request),
  registration: self.registration,
  clients: self.clients,
  skipWaiting: () => self.skipWaiting(),
});

self.addEventListener("install", (event) => {
  event.waitUntil(engine.install());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(engine.activate());
});

self.addEventListener("fetch", (event) => {
  const response = engine.handleFetch(event.request);
  if (response) event.respondWith(response);
});

self.addEventListener("message", (event) => {
  event.waitUntil(engine.handleMessage(event.data, event.ports[0]));
});
