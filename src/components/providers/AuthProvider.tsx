"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocale } from "next-intl";
import type { AuthChangeEvent, Session, SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ensureUserProfile } from "@/lib/supabase/profile";
import {
  clearStoredAuthIdentity,
  decideSessionLoss,
  getStoredAuthIdentity,
  saveStoredAuthIdentity,
  type StoredAuthIdentity,
} from "@/lib/storage/authIdentityStorage";
import { clearCloudTeamMirror } from "@/lib/storage/cloudTeamMirrorStorage";
import {
  hasActiveStoredMatch,
  MATCH_SETUP_CHANGED_EVENT,
  MATCH_SETUP_KEY,
} from "@/lib/storage/matchStorage";
import { clearSquadSnapshot } from "@/lib/storage/squadSnapshotStorage";

type AuthStatus = "loading" | "guest" | "authenticated";

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /**
   * True while a previously signed-in coach is kept signed in without a live
   * session (B10): the token could not be refreshed offline, or a match is
   * active. Team data then comes from the local mirror, read-only, and the
   * session is refreshed again when the network returns.
   */
  isSessionDeferred: boolean;
  supabase: SupabaseClient;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** The identity as a minimal `User`: id and e-mail are all the app reads. */
function toDeferredUser(identity: StoredAuthIdentity): User {
  return {
    id: identity.userId,
    email: identity.email ?? undefined,
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: identity.savedAt,
  } as User;
}

function isBrowserOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/** How long an online sign-out waits for the server before ending locally. */
export const SIGN_OUT_SERVER_TIMEOUT_MS = 4_000;

/**
 * Removes the stored Supabase session on this device without the network.
 * auth-js (2.103) has no public offline sign-out: `signOut()` with any scope
 * first calls the server and, on a network error, returns that error before
 * it removes the stored session. Without this the session would survive an
 * offline sign-out and sign the coach back in on the next load.
 * `_removeSession` clears the stored session and emits SIGNED_OUT; it is
 * internal, so it is feature-checked (an upgrade that drops it only loses the
 * offline case, never the sign-out itself).
 */
async function removeLocalSession(client: SupabaseClient): Promise<void> {
  const auth = client.auth as unknown as { _removeSession?: () => Promise<void> };
  if (typeof auth._removeSession !== "function") return;

  try {
    await auth._removeSession();
  } catch {
    // Best effort; the app state is guest either way.
  }
}

/** The server sign-out (revokes the session everywhere), or its failure. */
async function signOutOnServer(client: SupabaseClient): Promise<{ error: unknown }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ error: unknown }>((resolve) => {
    timer = setTimeout(() => resolve({ error: new Error("Sign-out timed out.") }), SIGN_OUT_SERVER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      client.auth.signOut().then(({ error }) => ({ error: error ?? null })),
      timeout,
    ]);
  } catch (error) {
    return { error };
  } finally {
    clearTimeout(timer);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const locale = useLocale();

  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [deferredIdentity, setDeferredIdentity] = useState<StoredAuthIdentity | null>(null);
  const bootstrappedUserRef = useRef<string | null>(null);
  const explicitSignOutRef = useRef(false);

  // One place that turns "session or none" into a status (B10).
  const applySession = useCallback((nextSession: Session | null, error: unknown) => {
    if (nextSession) {
      explicitSignOutRef.current = false;
      saveStoredAuthIdentity(nextSession.user.id, nextSession.user.email);
      setDeferredIdentity(null);
      setSession(nextSession);
      setStatus("authenticated");
      return;
    }

    const identity = getStoredAuthIdentity();
    const decision = decideSessionLoss({
      identity,
      explicitSignOut: explicitSignOutRef.current,
      error,
      isOnline: isBrowserOnline(),
      hasActiveMatch: hasActiveStoredMatch(),
    });

    setSession(null);

    if (decision === "deferred" && identity) {
      setDeferredIdentity((previous) =>
        previous && previous.userId === identity.userId ? previous : identity
      );
      setStatus("authenticated");
      return;
    }

    if (!explicitSignOutRef.current) {
      // The server ended the session (or there never was one): forget it,
      // with that coach's team mirror (definitive, not a network problem:
      // that case is "deferred" above).
      clearStoredAuthIdentity();
      if (identity) clearCloudTeamMirror(identity.userId);
    }

    setDeferredIdentity(null);
    setStatus("guest");
  }, []);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }

        applySession(data.session ?? null, error);
      })
      .catch((error: unknown) => {
        if (isMounted) applySession(null, error);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      // An initial event without a session says nothing new: getSession above
      // decides, with the refresh error that tells offline from signed out.
      if (event === "INITIAL_SESSION" && !nextSession) {
        return;
      }

      applySession(nextSession, null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [applySession, supabase]);

  // Re-evaluate a deferred session (B10): getSession refreshes the stored
  // session, which then replaces the deferred identity, or (online, no match
  // active) ends it. Run when the network returns, when the app comes back to
  // the foreground, and when the active match ends: a deferral kept "for the
  // match" must not outlive it. Mid-match the decision stays "deferred", so
  // the data source never changes during a match.
  useEffect(() => {
    if (!deferredIdentity) {
      return;
    }

    const reevaluate = () => {
      void supabase.auth
        .getSession()
        .then(({ data, error }) => applySession(data.session ?? null, error))
        .catch((error: unknown) => applySession(null, error));
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") reevaluate();
    };
    const handleMatchChange = () => {
      if (!hasActiveStoredMatch()) reevaluate();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === MATCH_SETUP_KEY || event.key === null) handleMatchChange();
    };

    window.addEventListener("online", reevaluate);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener(MATCH_SETUP_CHANGED_EVENT, handleMatchChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("online", reevaluate);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener(MATCH_SETUP_CHANGED_EVENT, handleMatchChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [applySession, deferredIdentity, supabase]);

  useEffect(() => {
    const user = session?.user;

    if (!user || status !== "authenticated") {
      bootstrappedUserRef.current = null;
      return;
    }

    if (bootstrappedUserRef.current === user.id) {
      return;
    }

    bootstrappedUserRef.current = user.id;

    void ensureUserProfile({
      supabase,
      userId: user.id,
      userEmail: user.email,
      userMetadata: user.user_metadata,
      preferredLanguage: locale,
    }).catch((error) => {
      console.error("Failed to bootstrap user profile", error);
    });
  }, [locale, session, status, supabase]);

  const deferredUser = useMemo(
    () => (deferredIdentity ? toDeferredUser(deferredIdentity) : null),
    [deferredIdentity]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? deferredUser,
      isSessionDeferred: status === "authenticated" && !session && Boolean(deferredUser),
      supabase,
      signOut: async () => {
        // An explicit sign-out always ends cloud mode on this device, also
        // offline: the local identity, team mirror and squad snapshot go
        // first, then the session itself.
        explicitSignOutRef.current = true;
        const userId = session?.user.id ?? deferredIdentity?.userId ?? getStoredAuthIdentity()?.userId;
        clearStoredAuthIdentity();
        if (userId) clearCloudTeamMirror(userId);
        clearSquadSnapshot();

        // Online: revoke on the server (best effort, bounded), which also
        // removes the stored session. Offline, or when that fails or hangs,
        // the stored session is removed on this device only; the server
        // session then lapses on its own.
        const { error } = isBrowserOnline()
          ? await signOutOnServer(supabase)
          : { error: new Error("offline") };
        if (error) await removeLocalSession(supabase);

        setSession(null);
        setDeferredIdentity(null);
        setStatus("guest");
      },
    }),
    [deferredIdentity, deferredUser, status, session, supabase]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
