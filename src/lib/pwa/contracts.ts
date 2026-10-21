/**
 * Contract between the app and its service worker (FP-OFF-01a, stream B).
 *
 * The worker itself lives in `src/sw/` (routing rules, cache names, message
 * protocol); this file holds what the page side needs to know about it, so
 * the client never imports worker code and the worker never imports React.
 */

/** Served by `src/app/serwist/[path]/route.ts`, built from `src/sw/sw.ts`. */
export const SW_SCRIPT_URL = "/serwist/sw.js";
export const SW_SCOPE = "/";

/**
 * `NEXT_PUBLIC_FP_SW=off` is the kill switch: the build then ships a worker
 * that clears our caches and unregisters itself, and the page unregisters
 * any registration it finds instead of registering. Anything else is "on".
 */
export type SwMode = "on" | "off";

export function resolveSwMode(value: string | undefined | null): SwMode {
  const normalised = (value ?? "").trim().toLowerCase();
  return normalised === "off" || normalised === "0" || normalised === "false" ? "off" : "on";
}

export type RegistrationAction = "register" | "unregister" | "skip";

/**
 * What the page does with the service worker.
 *
 * - Kill switch on: unregister, in every environment.
 * - `next dev`: skip. The dev server compiles routes on demand and pushes HMR;
 *   a worker serving cached shells there would make `npm run test:e2e` and
 *   local work test stale code. `NEXT_PUBLIC_FP_SW_DEV=1` opts in for local
 *   debugging only.
 * - Production builds: register.
 */
export function registrationAction({
  nodeEnv,
  mode,
  devOptIn,
}: {
  nodeEnv: string | undefined;
  mode: SwMode;
  devOptIn: string | undefined;
}): RegistrationAction {
  if (mode === "off") return "unregister";
  if (nodeEnv !== "production" && devOptIn !== "1") return "skip";
  return "register";
}
