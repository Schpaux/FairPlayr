/**
 * Messages between the page and the service worker. Both sides validate
 * what they receive: a message is plain data from another context.
 *
 * Page → worker:
 * - `SKIP_WAITING`: the coach agreed to update (only offered when no match is
 *   active). Same string as Serwist's `messageSkipWaiting()`.
 * - `FP_SET_LOCALE`: the locale the page shows, so `/` offline opens it.
 * - `FP_GET_STATUS`: reply on the transferred port with `SwStatus`.
 * - `FP_SET_MATCH_ACTIVE`: whether a match is active on this device. Stored
 *   in `fp-meta`; while it is true a new build fails its install (the update
 *   gate, §2.2). Acknowledged on the transferred port, if any.
 * - `FP_ALLOW_UPDATE_ONCE`: one-shot override of the update gate, sent only
 *   by the D4 sheet (stored data is already newer than this build, so the
 *   newer build is the only one that can save). Expires after a few minutes.
 *   Acknowledged on the transferred port, if any.
 */
import { isShellLocale, type ShellLocale } from "./shellRoutes";

export const MESSAGE = {
  skipWaiting: "SKIP_WAITING",
  setLocale: "FP_SET_LOCALE",
  getStatus: "FP_GET_STATUS",
  setMatchActive: "FP_SET_MATCH_ACTIVE",
  allowUpdateOnce: "FP_ALLOW_UPDATE_ONCE",
  status: "FP_STATUS",
  ack: "FP_ACK",
} as const;

export type ClientMessage =
  | { type: typeof MESSAGE.skipWaiting }
  | { type: typeof MESSAGE.setLocale; locale: ShellLocale }
  | { type: typeof MESSAGE.getStatus }
  | { type: typeof MESSAGE.setMatchActive; active: boolean }
  | { type: typeof MESSAGE.allowUpdateOnce };

export interface SwStatus {
  type: typeof MESSAGE.status;
  buildId: string;
  mode: "on" | "off";
  precacheName: string;
  precachedCount: number;
  lastLocale: ShellLocale | null;
  /** The update gate's view of this device (FP_SET_MATCH_ACTIVE). */
  matchActive: boolean;
  /** The build whose files are served: `buildId`, or the previous build while pinned. */
  servedBuildId: string;
}

export function parseClientMessage(data: unknown): ClientMessage | null {
  if (!data || typeof data !== "object") return null;
  const { type, locale, active } = data as { type?: unknown; locale?: unknown; active?: unknown };
  if (type === MESSAGE.skipWaiting) return { type };
  if (type === MESSAGE.getStatus) return { type };
  if (type === MESSAGE.allowUpdateOnce) return { type };
  if (type === MESSAGE.setMatchActive && typeof active === "boolean") return { type, active };
  if (type === MESSAGE.setLocale && isShellLocale(locale)) return { type, locale };
  return null;
}

export function isSwStatus(data: unknown): data is SwStatus {
  if (!data || typeof data !== "object") return false;
  const value = data as Partial<SwStatus>;
  return value.type === MESSAGE.status && typeof value.buildId === "string" && typeof value.precacheName === "string";
}

/**
 * Build-time configuration, injected by the route as an esbuild banner
 * (`self.__FP_SW_CONFIG__ = {...}`) rather than `define`, so it is a runtime
 * value: the minifier cannot fold the kill switch away, and the offline e2e
 * suite can serve a "next build" by rewriting the banner (sw-update spec).
 */
export interface SwBuildConfig {
  buildId: string;
  mode: "on" | "off";
}

export const SW_CONFIG_GLOBAL = "__FP_SW_CONFIG__";

export function swConfigBanner(config: SwBuildConfig): string {
  return `self.${SW_CONFIG_GLOBAL}=${JSON.stringify({ buildId: config.buildId, mode: config.mode })};`;
}

export function readSwConfig(value: unknown): SwBuildConfig {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<SwBuildConfig>;
  return {
    buildId: typeof raw.buildId === "string" && raw.buildId.length > 0 ? raw.buildId : "unknown",
    mode: raw.mode === "off" ? "off" : "on",
  };
}
