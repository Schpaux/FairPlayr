// FP-P0 match lifecycle — reproduction tests. These encode the required
// invariant and FAIL on the current implementation; they are not a fix.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchDetailsManager } from "@/components/match/MatchDetailsManager";
import { createMatchSetup } from "@/domain/match";
import { createLiveMatchFromSetup, startLiveMatch } from "@/domain/liveMatch";
import { activateMatch, hasActiveStoredMatch } from "@/lib/storage/matchStorage";
import { getStoredLiveMatch, saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import en from "../../../messages/en.json";

const ROUTER = { push: vi.fn() };
const AUTH = { status: "authenticated" };
const ACTIVE_MATCH = { refreshActiveMatch: vi.fn(() => Promise.resolve()) };
const WORKSPACE = { isLoading: false, teams: [{ id: "team-1", name: "G2014", players: [] }] };

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ROUTER,
}));
vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => AUTH }));
vi.mock("@/components/providers/ActiveMatchProvider", () => ({ useActiveMatch: () => ACTIVE_MATCH }));
vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({ useTeamWorkspace: () => WORKSPACE }));

const DAY_MS = 24 * 60 * 60 * 1000;

function serverMatch(id: string, status: string) {
  return {
    id,
    teamId: "team-1",
    title: `Kamp ${id}`,
    opponentName: null,
    startsAt: "2026-10-15T10:31:00.000Z",
    location: null,
    format: "5v5",
    status,
    reportEnabled: false,
    reportStatus: "not_requested",
    reportText: null,
    reportGeneratedAt: null,
    scoreFor: 0,
    scoreAgainst: 0,
    startedAt: null,
    endedAt: null,
    runtimeState: null,
    source: "manual",
    externalEventId: null,
    rsvpLastSyncedAt: null,
    createdAt: "2026-10-15T10:31:00.000Z",
    updatedAt: "2026-10-15T10:31:00.000Z",
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubServer(match: ReturnType<typeof serverMatch>) {
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/events")) {
      return Promise.resolve(Response.json({ events: [] }));
    }
    if (init?.method === "PATCH") {
      const body = JSON.parse(init.body as string) as { status?: string };
      return Promise.resolve(Response.json({ match: { ...match, status: body.status ?? match.status } }));
    }
    return Promise.resolve(Response.json({ match }));
  });
  vi.stubGlobal("fetch", fetchMock);
}

function statusPatches() {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
    .map(([input, init]) => ({
      url: String(input),
      status: (JSON.parse((init as RequestInit).body as string) as { status?: string }).status,
    }));
}

function renderDetails(matchId: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MatchDetailsManager matchId={matchId} />
    </NextIntlClientProvider>
  );
}

describe("P0: details-page lifecycle buttons vs this device's live match", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // This device runs match A, clock running since yesterday.
    const setup = createMatchSetup("team-1");
    activateMatch(setup, "match-A");
    saveStoredLiveMatch(startLiveMatch(createLiveMatchFromSetup(setup), Date.now() - DAY_MS));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("Finish match on this device's live match ends it on the device too", async () => {
    stubServer(serverMatch("match-A", "live"));
    renderDetails("match-A");

    fireEvent.click(await screen.findByRole("button", { name: en.matchPlanner.finishMatchCta }));
    // Ending a match is always a confirmed action (FP-P0-F2; a sheet since UI-A11Y-02).
    const sheet = within(await screen.findByRole("dialog", { name: en.matchPlanner.finishConfirm.title }));
    fireEvent.click(sheet.getByRole("button", { name: en.matchPlanner.finishConfirm.confirm }));
    await waitFor(() => expect(statusPatches()).toEqual([{ url: "/api/matches/match-A", status: "completed" }]));

    // Today the server row is completed but the device keeps the match active
    // with its clock running, so it resumes (and syncs) under a completed row.
    expect(hasActiveStoredMatch()).toBe(false);
    expect(getStoredLiveMatch()?.clock.isRunning).not.toBe(true);
  });

  it("Start match on another match does not mark it live while this device still runs one", async () => {
    stubServer(serverMatch("match-B", "draft"));
    renderDetails("match-B");

    fireEvent.click(await screen.findByRole("button", { name: en.matchPlanner.startMatchCta }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalled());

    // Today B is set live on the server before any device starts it; setup
    // then refuses to start B (A owns the device) and offers to continue A,
    // leaving B "live" with no runtime anywhere — the stuck banner.
    expect(statusPatches()).not.toContainEqual({ url: "/api/matches/match-B", status: "live" });
  });
});
