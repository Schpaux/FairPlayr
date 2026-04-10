"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocale } from "next-intl";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ensureUserProfile } from "@/lib/supabase/profile";

type AuthStatus = "loading" | "guest" | "authenticated";

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  supabase: SupabaseClient;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const locale = useLocale();

  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const bootstrappedUserRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      const nextSession = data.session ?? null;
      setSession(nextSession);
      setStatus(nextSession ? "authenticated" : "guest");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? "authenticated" : "guest");
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

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

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      supabase,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [status, session, supabase]
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
