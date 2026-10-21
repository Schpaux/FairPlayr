import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchSetup } from "@/domain/match";
import { AuthProvider, useAuth } from "@/components/providers/AuthProvider";
import { getStoredAuthIdentity, saveStoredAuthIdentity } from "@/lib/storage/authIdentityStorage";
import { getMirroredTeams, saveMirroredTeams } from "@/lib/storage/cloudTeamMirrorStorage";
import { activateMatch, endMatch } from "@/lib/storage/matchStorage";
import { getSquadSnapshot, saveSquadSnapshot } from "@/lib/storage/squadSnapshotStorage";

type AuthCallback = (event: string, session: unknown) => void;

const SUPABASE = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  removeSession: vi.fn(),
  callback: null as AuthCallback | null,
}));

vi.mock("next-intl", () => ({ useLocale: () => "no" }));
vi.mock("@/lib/supabase/profile", () => ({ ensureUserProfile: () => Promise.resolve() }));
vi.mock("@/lib/supabase/browser", () => {
  const client = {
    auth: {
      getSession: (...args: unknown[]) => SUPABASE.getSession(...args),
      signOut: (...args: unknown[]) => SUPABASE.signOut(...args),
      _removeSession: (...args: unknown[]) => SUPABASE.removeSession(...args),
      onAuthStateChange: (callback: AuthCallback) => {
        SUPABASE.callback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  };
  return { createSupabaseBrowserClient: () => client };
});

const SESSION = { user: { id: "user-1", email: "coach@example.com", user_metadata: {} } };
const RETRYABLE = Object.assign(new Error("Failed to fetch"), { name: "AuthRetryableFetchError", status: 0 });
const INVALID = Object.assign(new Error("Invalid Refresh Token"), { name: "AuthApiError", status: 400 });

const SETUP: MatchSetup = {
  id: "setup-1",
  teamId: "team-1",
  format: "5v5",
  reportEnabled: false,
  formationId: "5v5-2-2",
  duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
  selectedPlayerIds: ["p1"],
  startingPlayerIds: ["p1"],
  slotAssignments: { "5v5-1": "p1" },
  createdAt: "2026-04-15T10:00:00.000Z",
  updatedAt: "2026-04-15T10:00:00.000Z",
};

let online = true;

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <p data-testid="status">{auth.status}</p>
      <p data-testid="user">{auth.user?.id ?? "none"}</p>
      <p data-testid="deferred">{String(auth.isSessionDeferred)}</p>
      <button type="button" onClick={() => void auth.signOut()}>
        sign out
      </button>
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

describe("AuthProvider offline (B10)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    online = true;
    vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online);
    SUPABASE.getSession.mockReset();
    SUPABASE.signOut.mockReset().mockResolvedValue({ error: null });
    SUPABASE.removeSession.mockReset().mockImplementation(async () => {
      SUPABASE.callback?.("SIGNED_OUT", null);
    });
    SUPABASE.callback = null;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("remembers the identity of a live session", async () => {
    SUPABASE.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    renderAuth();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(screen.getByTestId("deferred").textContent).toBe("false");
    expect(getStoredAuthIdentity()?.userId).toBe("user-1");
  });

  it("stays authenticated when the token refresh fails offline", async () => {
    saveStoredAuthIdentity("user-1", "coach@example.com");
    online = false;
    SUPABASE.getSession.mockResolvedValue({ data: { session: null }, error: RETRYABLE });
    renderAuth();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(screen.getByTestId("user").textContent).toBe("user-1");
    expect(screen.getByTestId("deferred").textContent).toBe("true");
  });

  it("re-authenticates when the network returns", async () => {
    saveStoredAuthIdentity("user-1", "coach@example.com");
    online = false;
    SUPABASE.getSession.mockResolvedValue({ data: { session: null }, error: RETRYABLE });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("deferred").textContent).toBe("true"));

    online = true;
    SUPABASE.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(screen.getByTestId("deferred").textContent).toBe("false"));
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
  });

  it("never drops to guest mid-match, even when the server says the session is gone", async () => {
    saveStoredAuthIdentity("user-1", "coach@example.com");
    activateMatch(SETUP, "match-1");
    SUPABASE.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("deferred").textContent).toBe("false"));

    act(() => {
      SUPABASE.callback?.("SIGNED_OUT", null);
    });

    expect(screen.getByTestId("status").textContent).toBe("authenticated");
    expect(screen.getByTestId("deferred").textContent).toBe("true");
  });

  it("is a guest when the session is invalid and no match is active", async () => {
    saveStoredAuthIdentity("user-1", "coach@example.com");
    SUPABASE.getSession.mockResolvedValue({ data: { session: null }, error: INVALID });
    renderAuth();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("guest"));
    expect(getStoredAuthIdentity()).toBeNull();
  });

  it("an explicit sign-out ends cloud mode and clears the identity and team mirror, also offline", async () => {
    saveStoredAuthIdentity("user-1", "coach@example.com");
    saveMirroredTeams("user-1", []);
    online = false;
    SUPABASE.getSession.mockResolvedValue({ data: { session: null }, error: RETRYABLE });
    SUPABASE.signOut.mockImplementation(async () => {
      SUPABASE.callback?.("SIGNED_OUT", null);
      return { error: RETRYABLE };
    });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("deferred").textContent).toBe("true"));

    await act(async () => {
      screen.getByRole("button", { name: "sign out" }).click();
    });

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("guest"));
    expect(getStoredAuthIdentity()).toBeNull();
    expect(getMirroredTeams("user-1")).toBeNull();
    // Offline the server is not asked; the stored session is removed locally.
    expect(SUPABASE.signOut).not.toHaveBeenCalled();
    expect(SUPABASE.removeSession).toHaveBeenCalledTimes(1);
  });

  it("an online sign-out revokes on the server and does not touch the session itself on success", async () => {
    SUPABASE.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    saveSquadSnapshot({
      setupId: "setup-1",
      teamId: "team-1",
      squadPlayerIds: ["p1"],
      players: [{ id: "p1", name: "Ida", source: "manual", externalProvider: null, externalId: null, isManaged: false, createdAt: "", updatedAt: "" }],
    });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));

    await act(async () => {
      screen.getByRole("button", { name: "sign out" }).click();
    });

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("guest"));
    expect(SUPABASE.signOut).toHaveBeenCalledTimes(1);
    expect(SUPABASE.removeSession).not.toHaveBeenCalled();
    // The match squad's names leave the device with the coach.
    expect(getSquadSnapshot("setup-1")).toBeNull();
  });

  it("removes the stored session locally when the online sign-out fails for lack of network (auth-js keeps it then)", async () => {
    SUPABASE.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    SUPABASE.signOut.mockResolvedValue({ error: RETRYABLE });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));

    await act(async () => {
      screen.getByRole("button", { name: "sign out" }).click();
    });

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("guest"));
    expect(SUPABASE.removeSession).toHaveBeenCalledTimes(1);
  });

  it("a definitive session loss (online, invalid, no match) also clears that coach's team mirror", async () => {
    saveStoredAuthIdentity("user-1", "coach@example.com");
    saveMirroredTeams("user-1", []);
    SUPABASE.getSession.mockResolvedValue({ data: { session: null }, error: INVALID });
    renderAuth();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("guest"));
    expect(getMirroredTeams("user-1")).toBeNull();
  });

  it("keeps the mirror when the session is only deferred (offline)", async () => {
    saveStoredAuthIdentity("user-1", "coach@example.com");
    saveMirroredTeams("user-1", []);
    online = false;
    SUPABASE.getSession.mockResolvedValue({ data: { session: null }, error: RETRYABLE });
    renderAuth();

    await waitFor(() => expect(screen.getByTestId("deferred").textContent).toBe("true"));
    expect(getMirroredTeams("user-1")).not.toBeNull();
  });

  it("a deferral kept for the match is re-evaluated when the match ends, not mid-match", async () => {
    saveStoredAuthIdentity("user-1", "coach@example.com");
    activateMatch(SETUP, "match-1");
    SUPABASE.getSession.mockResolvedValue({ data: { session: null }, error: INVALID });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("deferred").textContent).toBe("true"));

    // Mid-match, coming back to the foreground keeps the data source.
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(() => Promise.resolve());
    expect(screen.getByTestId("deferred").textContent).toBe("true");

    act(() => {
      endMatch(SETUP);
    });

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("guest"));
    expect(getStoredAuthIdentity()).toBeNull();
  });

  it("re-evaluates a deferred session when the app comes back to the foreground online", async () => {
    saveStoredAuthIdentity("user-1", "coach@example.com");
    SUPABASE.getSession.mockResolvedValue({ data: { session: null }, error: RETRYABLE });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("deferred").textContent).toBe("true"));

    SUPABASE.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(screen.getByTestId("deferred").textContent).toBe("false"));
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
  });
});
