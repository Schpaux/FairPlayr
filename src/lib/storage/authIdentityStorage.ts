import {
  classifyVersion,
  safeRemoveItem,
  safeSetItem,
} from "@/lib/storage/storageEnvelope";

/**
 * The last signed-in identity on this device (B10, OFF-01a task 3). Only the
 * user id and e-mail, never a token. It lets a coach whose session cannot be
 * refreshed offline stay in cloud mode on the local team mirror instead of
 * dropping to guest, and it is cleared on an explicit sign-out.
 */

export const AUTH_IDENTITY_KEY = "fairplayr.authIdentity.v1";
const IDENTITY_VERSION = 1;

export interface StoredAuthIdentity {
  userId: string;
  email: string | null;
  savedAt: string;
}

export function getStoredAuthIdentity(): StoredAuthIdentity | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(AUTH_IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: unknown; userId?: unknown; email?: unknown; savedAt?: unknown };
    if (classifyVersion(parsed.version, IDENTITY_VERSION) === "invalid") return null;
    if (typeof parsed.userId !== "string" || !parsed.userId) return null;
    return {
      userId: parsed.userId,
      email: typeof parsed.email === "string" ? parsed.email : null,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

/** Never throws. Skips the write when the identity is unchanged. */
export function saveStoredAuthIdentity(userId: string, email: string | null | undefined): boolean {
  if (typeof window === "undefined" || !userId) return false;
  const existing = getStoredAuthIdentity();
  if (existing && existing.userId === userId && existing.email === (email ?? null)) return true;

  return safeSetItem(
    AUTH_IDENTITY_KEY,
    JSON.stringify({ version: IDENTITY_VERSION, userId, email: email ?? null, savedAt: new Date().toISOString() }),
    IDENTITY_VERSION
  ).ok;
}

export function clearStoredAuthIdentity(): void {
  if (typeof window === "undefined") return;
  safeRemoveItem(AUTH_IDENTITY_KEY, IDENTITY_VERSION);
}

/**
 * True for errors that mean "the auth server could not be reached", as
 * opposed to "this session is no longer valid". Supabase marks those as
 * `AuthRetryableFetchError`; plain fetch failures are network errors too.
 */
export function isNetworkAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message, status } = error as { name?: unknown; message?: unknown; status?: unknown };

  if (name === "AuthRetryableFetchError") return true;
  if (typeof status === "number" && status >= 500) return true;
  if (name === "TypeError" || name === "AbortError") return true;

  return typeof message === "string" && /failed to fetch|load failed|network|fetch failed|timed? ?out/i.test(message);
}

export type SessionLossDecision = "deferred" | "guest";

/**
 * What a missing session means (B10). A coach who signed out explicitly is a
 * guest. Otherwise a known identity stays signed in ("deferred": cloud mode on
 * the local mirror, re-authenticated when the network returns) when the
 * session could not be refreshed for lack of network, or while a match is
 * active on this device: the data source never changes mid-match.
 */
export function decideSessionLoss(input: {
  identity: StoredAuthIdentity | null;
  explicitSignOut: boolean;
  error: unknown;
  isOnline: boolean;
  hasActiveMatch: boolean;
}): SessionLossDecision {
  if (input.explicitSignOut || !input.identity) return "guest";
  if (!input.isOnline || isNetworkAuthError(input.error)) return "deferred";
  if (input.hasActiveMatch) return "deferred";
  return "guest";
}
