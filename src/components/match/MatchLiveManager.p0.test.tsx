// FP-P0 match lifecycle — reproduction tests. These encode the required
// invariant and FAIL on the current implementation; they are not a fix.
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchLiveManager } from "@/components/match/MatchLiveManager";
import { createLiveMatchFromSetup, getElapsedMs, startLiveMatch } from "@/domain/liveMatch";
import { createMatchSetup } from "@/domain/match";
import { getStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import { activateMatch, endMatch, getStoredMatchSetup } from "@/lib/storage/matchStorage";
import en from "../../../messages/en.json";

const searchParams = new URLSearchParams("matchId=match-C");
const ROUTER = { push: vi.fn() };
const AUTH = { status: "authenticated" };
const WORKSPACE = { isLoading: false, error: null, activeTeamId: "team-1", teams: [{ id: "team-1", players: [] }] };
const ACTIVE_MATCH = {
  activeMatch: null,
  activeMatchHref: "/match/live?recovery=1",
  needsRecovery: false,
  forceCloseActiveMatch: vi.fn(),
  discardActiveMatch: vi.fn(),
  refreshActiveMatch: vi.fn(() => Promise.resolve()),
};

vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ROUTER,
}));
vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => AUTH }));
vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({ useTeamWorkspace: () => WORKSPACE }));
vi.mock("@/components/providers/ActiveMatchProvider", () => ({ useActiveMatch: () => ACTIVE_MATCH }));

const STARTED_MINUTES_AGO = 1494;

let fetchMock: ReturnType<typeof vi.fn>;

describe("P0: the live screen never revives a completed match", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Completed on the server (e.g. via "Finish match" on its details page)
    // while its stored runtime state is the last running snapshot.
    const runtimeState = startLiveMatch(
      createLiveMatchFromSetup(createMatchSetup("team-1")),
      Date.now() - STARTED_MINUTES_AGO * 60_000
    );
    fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "PATCH"
          ? new Response(null, { status: 204 })
          : Response.json({ match: { id: "match-C", status: "completed", reportEnabled: false, runtimeState } })
      )
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not restore, run or re-sync a completed match's runtime state", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MatchLiveManager />
      </NextIntlClientProvider>
    );
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 900)));

    const revived = getStoredLiveMatch();
    // Today: the completed match becomes this device's live match with its
    // clock still running (~1494 min) and is PATCHed back to the server.
    expect(revived && Math.floor(getElapsedMs(revived, Date.now()) / 60_000)).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")).toBe(false);
  });
});

describe("P0-F2 final: a stale server read never revives a match ended on this device", () => {
  // Ended on this device (e.g. "Finish" on its details page with no live state
  // stored), completion still pending, while the server row still says live.
  function serverStillLive() {
    const runtimeState = startLiveMatch(
      createLiveMatchFromSetup(createMatchSetup("team-1")),
      Date.now() - 30 * 60_000
    );
    fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "PATCH"
          ? new Response(null, { status: 204 })
          : Response.json({ match: { id: "match-C", status: "live", reportEnabled: false, runtimeState } })
      )
    );
    vi.stubGlobal("fetch", fetchMock);
  }

  beforeEach(() => {
    window.localStorage.clear();
    serverStillLive();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function renderAndSettle() {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MatchLiveManager />
      </NextIntlClientProvider>
    );
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 900)));
  }

  it("ignores the stale live snapshot while the completion is pending", async () => {
    window.localStorage.setItem(
      "fairplayr.pendingMatchCompletions.v1",
      JSON.stringify({
        "match-C": {
          matchId: "match-C",
          endedAt: "2026-10-15T16:30:00.000Z",
          body: { status: "completed", scoreFor: 1, scoreAgainst: 0, reportEnabled: false },
        },
      })
    );

    await renderAndSettle();

    expect(getStoredLiveMatch()).toBeNull();
    // The only write is the pending completion itself (retried on mount), with
    // its original end time; never a runtime sync of the stale snapshot.
    const patchBodies = fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
      .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);
    expect(patchBodies.every((body) => body.status === "completed" && body.runtimeState === undefined)).toBe(true);
    expect(patchBodies.every((body) => body.endedAt === "2026-10-15T16:30:00.000Z")).toBe(true);
  });

  it("ignores it when the stored setup for that match is ended", async () => {
    const setup = createMatchSetup("team-1");
    activateMatch(setup, "match-C");
    endMatch(setup);
    expect(getStoredMatchSetup()).toMatchObject({ status: "ended", serverMatchId: "match-C" });

    await renderAndSettle();

    expect(getStoredLiveMatch()).toBeNull();
  });
});
