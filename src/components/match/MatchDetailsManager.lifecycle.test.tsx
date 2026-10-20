// FP-P0-F2: details-page Start/Finish against this device's own match.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchDetailsManager } from "@/components/match/MatchDetailsManager";
import { createLiveMatchFromSetup, getPlayerAccumulatedSeconds, startLiveMatch } from "@/domain/liveMatch";
import { assignStarterToSlot, createMatchSetup, setSelectedSquad } from "@/domain/match";
import { getStoredLiveMatch, saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import { activateMatch, getStoredMatchSetup } from "@/lib/storage/matchStorage";
import { getPendingMatchCompletion } from "@/lib/storage/pendingMatchCompletionStorage";
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

function serverMatch(id: string, status: string, runtimeState: Record<string, unknown> | null = null) {
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
    runtimeState,
    source: "manual",
    externalEventId: null,
    rsvpLastSyncedAt: null,
    createdAt: "2026-10-15T10:31:00.000Z",
    updatedAt: "2026-10-15T10:31:00.000Z",
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let offline = false;

function stubServer(match: ReturnType<typeof serverMatch>) {
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/events")) {
      return Promise.resolve(Response.json({ events: [] }));
    }
    if (init?.method === "PATCH") {
      if (offline) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      const body = JSON.parse(init.body as string) as { status?: string };
      return Promise.resolve(Response.json({ match: { ...match, status: body.status ?? match.status } }));
    }
    return Promise.resolve(Response.json({ match }));
  });
  vi.stubGlobal("fetch", fetchMock);
}

function patches() {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
    .map(([input, init]) => ({
      url: String(input),
      body: JSON.parse((init as RequestInit).body as string) as Record<string, unknown>,
    }));
}

function renderDetails(matchId: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MatchDetailsManager matchId={matchId} />
    </NextIntlClientProvider>
  );
}

function runOnDevice(serverMatchId: string, startedMsAgo = 60_000) {
  const setup = createMatchSetup("team-1");
  activateMatch(setup, serverMatchId);
  saveStoredLiveMatch(startLiveMatch(createLiveMatchFromSetup(setup), Date.now() - startedMsAgo));
  return setup;
}

function snapshot() {
  return {
    setup: window.localStorage.getItem("fairplayr.matchSetup.v1"),
    live: window.localStorage.getItem("fairplayr.liveMatch.v1"),
  };
}

// UI-A11Y-02: Finish is confirmed in a sheet (no window.confirm).
async function finishSheet() {
  return within(await screen.findByRole("dialog", { name: en.matchPlanner.finishConfirm.title }));
}

async function finishAndConfirm() {
  fireEvent.click(await screen.findByRole("button", { name: en.matchPlanner.finishMatchCta }));
  const sheet = await finishSheet();
  fireEvent.click(sheet.getByRole("button", { name: en.matchPlanner.finishConfirm.confirm }));
}

beforeEach(() => {
  window.localStorage.clear();
  offline = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("details Finish", () => {
  it("finishing a different, server-only match never touches this device's match", async () => {
    runOnDevice("match-A");
    const before = snapshot();
    stubServer(serverMatch("match-B", "live"));
    renderDetails("match-B");

    await screen.findByText(en.matchPlanner.otherMatchOnDevice);
    // No link that would open this device's match A instead of B.
    expect(screen.queryByText(en.matchPlanner.continueMatchCta)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: en.matchPlanner.finishMatchCta }));
    const sheet = await finishSheet();
    // The consequence: only the server record, nothing on this device.
    sheet.getByText(en.matchPlanner.finishConfirm.descriptionServerOnly);
    expect(patches()).toEqual([]);
    fireEvent.click(sheet.getByRole("button", { name: en.matchPlanner.finishConfirm.confirm }));

    await waitFor(() => expect(patches()).toEqual([{ url: "/api/matches/match-B", body: { status: "completed" } }]));
    expect(snapshot()).toEqual(before);
    expect(getStoredLiveMatch()?.clock.isRunning).toBe(true);
    await screen.findByText(en.matchPlanner.completedNotice);
  });

  it("does nothing when the coach cancels the confirmation", async () => {
    runOnDevice("match-A");
    const before = snapshot();
    stubServer(serverMatch("match-A", "live"));
    renderDetails("match-A");

    fireEvent.click(await screen.findByRole("button", { name: en.matchPlanner.finishMatchCta }));
    const sheet = await finishSheet();
    sheet.getByText(en.matchPlanner.finishConfirm.description);
    fireEvent.click(sheet.getByRole("button", { name: en.ui.confirm.cancel }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(patches()).toEqual([]);
    expect(snapshot()).toEqual(before);
    expect(getStoredLiveMatch()?.clock.isRunning).toBe(true);
  });

  it("does nothing when the device's match changed while the confirmation was open", async () => {
    runOnDevice("match-A");
    stubServer(serverMatch("match-A", "live"));
    renderDetails("match-A");

    fireEvent.click(await screen.findByRole("button", { name: en.matchPlanner.finishMatchCta }));
    const sheet = await finishSheet();
    // Another tab starts a different match on this device meanwhile.
    runOnDevice("match-C");
    const before = snapshot();
    fireEvent.click(sheet.getByRole("button", { name: en.matchPlanner.finishConfirm.confirm }));

    await screen.findByText(en.matchPlanner.otherMatchOnDevice);
    await screen.findByText(en.matchPlanner.finishConfirm.changed);
    expect(patches()).toEqual([]);
    expect(snapshot()).toEqual(before);
  });

  it("offline: stops the clock on the device at once and queues the completion", async () => {
    runOnDevice("match-A");
    stubServer(serverMatch("match-A", "live"));
    renderDetails("match-A");
    offline = true;

    await finishAndConfirm();

    await screen.findByText(en.matchPlanner.completedOfflineNotice);
    expect(getStoredMatchSetup()?.status).toBe("ended");
    expect(getStoredLiveMatch()).toMatchObject({ status: "ended", clock: { isRunning: false } });
    expect(getPendingMatchCompletion("match-A")?.body).toMatchObject({
      status: "completed",
      runtimeState: { status: "ended" },
    });
    // The finished match no longer offers to continue or finish.
    expect(screen.queryByRole("button", { name: en.matchPlanner.finishMatchCta })).toBeNull();
  });

  it("closes an overlong match at once, keeping every recorded minute", async () => {
    const MINUTES = 1494;
    let setup = setSelectedSquad(createMatchSetup("team-1"), ["p1", "p2"]);
    const [slotA, slotB] = Object.keys(setup.slotAssignments);
    setup = assignStarterToSlot(assignStarterToSlot(setup, slotA, "p1"), slotB, "p2");
    activateMatch(setup, "match-A");
    const running = startLiveMatch(createLiveMatchFromSetup(setup), Date.now() - MINUTES * 60_000);
    saveStoredLiveMatch(running);
    stubServer(serverMatch("match-A", "live"));
    renderDetails("match-A");

    await finishAndConfirm();

    await waitFor(() => expect(patches()).toHaveLength(1));
    const sent = patches()[0].body.runtimeState as Parameters<typeof getPlayerAccumulatedSeconds>[0];
    expect(sent.status).toBe("ended");
    // Not rounded away or reset: the clock stops where it was.
    const ended = sent.events.find((event) => event.type === "match_ended");
    expect(ended?.minute).toBe(MINUTES);
    expect(running.onFieldPlayerIds).toEqual(expect.arrayContaining(["p1", "p2"]));
    for (const playerId of running.onFieldPlayerIds) {
      expect(Math.floor(getPlayerAccumulatedSeconds(sent, playerId, Date.now()) / 60)).toBe(MINUTES);
    }
  });
});

describe("details for a match ended here but not yet synced", () => {
  it("offers no Start or Continue, and sends the stored result instead of a bare finish", async () => {
    const setup = runOnDevice("match-A");
    stubServer(serverMatch("match-A", "live", { status: "running" }));
    // Ended offline on this device: the server row is still live.
    offline = true;
    const view = renderDetails("match-A");
    await finishAndConfirm();
    await screen.findByText(en.matchPlanner.completedOfflineNotice);
    view.unmount();
    expect(getStoredMatchSetup()).toMatchObject({ status: "ended", config: { id: setup.id } });
    fetchMock.mockClear();

    offline = false;
    renderDetails("match-A");
    await screen.findByText(en.matchPlanner.closedOnDevice);
    expect(screen.queryByRole("button", { name: en.matchPlanner.startMatchCta })).toBeNull();
    expect(screen.queryByText(en.matchPlanner.continueMatchCta)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: en.matchPlanner.syncFinishCta }));

    // Already confirmed when it was ended: sending the result asks nothing.
    await screen.findByText(en.matchPlanner.completedNotice);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(patches()).toHaveLength(1);
    expect(patches()[0].body).toMatchObject({ status: "completed", runtimeState: { status: "ended" } });
    expect(getPendingMatchCompletion("match-A")).toBeNull();
  });
});

describe("details Start", () => {
  it("routes to setup without marking anything live when the device is free", async () => {
    stubServer(serverMatch("match-B", "draft"));
    renderDetails("match-B");

    fireEvent.click(await screen.findByRole("button", { name: en.matchPlanner.startMatchCta }));

    expect(ROUTER.push).toHaveBeenCalledWith("/match/setup?matchId=match-B");
    expect(patches()).toEqual([]);
  });

  it("offers Start (not Continue) for a live server match that no device has started", async () => {
    stubServer(serverMatch("match-B", "live", null));
    renderDetails("match-B");

    fireEvent.click(await screen.findByRole("button", { name: en.matchPlanner.startMatchCta }));

    expect(screen.queryByText(en.matchPlanner.continueMatchCta)).toBeNull();
    expect(ROUTER.push).toHaveBeenCalledWith("/match/setup?matchId=match-B");
    expect(patches()).toEqual([]);
  });

  it("offers Continue for a live server snapshot when the device is free (explicit recovery)", async () => {
    stubServer(serverMatch("match-B", "live", { status: "paused" }));
    renderDetails("match-B");

    const link = (await screen.findByText(en.matchPlanner.continueMatchCta)).closest("a");
    expect(link?.getAttribute("href")).toBe("/match/live?matchId=match-B");
  });

  it("links Continue for this device's own match to its live screen", async () => {
    runOnDevice("match-A");
    stubServer(serverMatch("match-A", "live"));
    renderDetails("match-A");

    const link = (await screen.findByText(en.matchPlanner.continueMatchCta)).closest("a");
    expect(link?.getAttribute("href")).toBe("/match/live?matchId=match-A");
  });
});

describe("details history", () => {
  it("shows a completed match's result with no lifecycle actions", async () => {
    stubServer({ ...serverMatch("match-C", "completed", { status: "ended", events: [] }), scoreFor: 2, scoreAgainst: 1 });
    renderDetails("match-C");

    await screen.findByText(en.matchPlanner.result.win);
    expect(screen.queryByRole("button", { name: en.matchPlanner.finishMatchCta })).toBeNull();
    expect(screen.queryByRole("button", { name: en.matchPlanner.startMatchCta })).toBeNull();
    expect(patches()).toEqual([]);
  });
});
