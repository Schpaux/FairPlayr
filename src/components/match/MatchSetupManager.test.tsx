import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchSetupManager } from "@/components/match/MatchSetupManager";
import type { MatchSetup } from "@/domain/match";
import type { Player } from "@/domain/team";
import { createLiveMatchFromSetup, startLiveMatch, updateScore } from "@/domain/liveMatch";
import { activateMatch, endMatch, getStoredMatchSetup, saveMatchSetupDraft } from "@/lib/storage/matchStorage";
import { getStoredLiveMatch, saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import en from "../../../messages/en.json";

const routerPush = vi.fn();
const ROUTER = { push: routerPush };
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ROUTER,
}));

const PLAYERS: Player[] = ["p1", "p2", "p3", "p4", "p5", "p6"].map((id, index) => ({
  id,
  name: `Player ${index + 1}`,
  source: "manual",
  externalProvider: null,
  externalId: null,
  isManaged: false,
  createdAt: "2026-04-15T10:00:00.000Z",
  updatedAt: "2026-04-15T10:00:00.000Z",
}));

const TEAM = { id: "team-1", name: "Local team", players: PLAYERS };
const WORKSPACE = { isLoading: false, error: null, activeTeamId: "team-1", activeTeam: TEAM, teams: [TEAM] };

vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({
  useTeamWorkspace: () => WORKSPACE,
}));

const ACTIVE_MATCH = {
  activeMatch: null,
  activeMatchHref: "/match/live?recovery=1",
  hasActiveConflict: () => false,
  forceCloseActiveMatch: vi.fn(),
  discardActiveMatch: vi.fn(),
};

vi.mock("@/components/providers/ActiveMatchProvider", () => ({
  useActiveMatch: () => ACTIVE_MATCH,
}));

const SETUP: MatchSetup = {
  id: "setup-1",
  teamId: "team-1",
  format: "5v5",
  reportEnabled: false,
  formationId: "5v5-2-2",
  duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
  selectedPlayerIds: PLAYERS.map((player) => player.id),
  startingPlayerIds: ["p1", "p2", "p3", "p4", "p5"],
  slotAssignments: {
    "5v5-1": "p1",
    "5v5-2": "p2",
    "5v5-3": "p3",
    "5v5-4": "p4",
    "5v5-5": "p5",
  },
  createdAt: "2026-04-15T10:00:00.000Z",
  updatedAt: "2026-04-15T10:00:00.000Z",
};

function renderManager() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MatchSetupManager />
    </NextIntlClientProvider>
  );
}

describe("MatchSetupManager start match", () => {
  beforeEach(() => {
    window.localStorage.clear();
    saveMatchSetupDraft(SETUP);
    routerPush.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("stores no server match id for a guest/local-only match started through Kamper", async () => {
    searchParams = new URLSearchParams();
    renderManager();

    fireEvent.click(await screen.findByRole("button", { name: en.matchSetup.startMatch }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/live"));
    expect(getStoredMatchSetup()).toMatchObject({ status: "active", serverMatchId: null });
  });

  it("stores the server match id with the local setup for a server-backed match", async () => {
    searchParams = new URLSearchParams("matchId=match-1");
    renderManager();

    fireEvent.click(await screen.findByRole("button", { name: en.matchSetup.startMatch }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/live?matchId=match-1"));
    expect(getStoredMatchSetup()).toMatchObject({ status: "active", serverMatchId: "match-1" });
  });
});

// FP-MS2.1-A1 (MS-10): opening setup or pressing "Start match" must never
// demote, replace or reset a match that is already running on this device.
describe("MatchSetupManager with an active match", () => {
  const KICKOFF_MS = Date.parse("2026-04-15T10:00:00.000Z");

  function storeRunningMatch(config: MatchSetup = SETUP) {
    activateMatch(config, null);
    let live = startLiveMatch(createLiveMatchFromSetup(config), KICKOFF_MS);
    live = updateScore(live, "team", 1);
    saveStoredLiveMatch(live);
    return {
      setup: window.localStorage.getItem("fairplayr.matchSetup.v1"),
      live: window.localStorage.getItem("fairplayr.liveMatch.v1"),
    };
  }

  beforeEach(() => {
    window.localStorage.clear();
    searchParams = new URLSearchParams();
    routerPush.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the way back to the match instead of the editor and leaves storage untouched", async () => {
    const before = storeRunningMatch();

    renderManager();

    expect(await screen.findByText(en.matchSetup.activeMatch.title)).toBeTruthy();
    expect(screen.getByRole("link", { name: en.matchSetup.activeMatch.continue }).getAttribute("href")).toBe(
      "/match/live"
    );
    expect(screen.queryByRole("button", { name: en.matchSetup.startMatch })).toBeNull();
    expect(window.localStorage.getItem("fairplayr.matchSetup.v1")).toBe(before.setup);
    expect(window.localStorage.getItem("fairplayr.liveMatch.v1")).toBe(before.live);
  });

  it("links back to the server match when the active match has one", async () => {
    activateMatch(SETUP, "match-9");
    saveStoredLiveMatch(startLiveMatch(createLiveMatchFromSetup(SETUP), KICKOFF_MS));

    renderManager();

    expect(
      (await screen.findByRole("link", { name: en.matchSetup.activeMatch.continue })).getAttribute("href")
    ).toBe("/match/live?matchId=match-9");
    expect(getStoredMatchSetup()).toMatchObject({ status: "active", serverMatchId: "match-9" });
  });

  it("rejects a start when a match became active after setup opened, keeping that match", async () => {
    saveMatchSetupDraft(SETUP);
    renderManager();
    const startButton = await screen.findByRole("button", { name: en.matchSetup.startMatch });

    // Another tab starts a different match while this setup is open.
    const other = { ...SETUP, id: "setup-other" };
    const before = storeRunningMatch(other);

    fireEvent.click(startButton);

    expect(await screen.findByText(en.matchSetup.activeMatch.title)).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("fairplayr.matchSetup.v1")).toBe(before.setup);
    expect(window.localStorage.getItem("fairplayr.liveMatch.v1")).toBe(before.live);
    expect(getStoredLiveMatch()).toMatchObject({ setupId: "setup-other", teamScore: 1, status: "running" });
  });

  it("swaps the editor for the way back when an edit is rejected because a match became active", async () => {
    saveMatchSetupDraft(SETUP);
    renderManager();
    const playerToggle = (await screen.findAllByRole("button", { name: /Player 6/ })).find((button) =>
      button.hasAttribute("aria-pressed")
    )!;

    // Another tab starts a match; this tab's next edit must not look saved.
    const other = { ...SETUP, id: "setup-other" };
    const before = storeRunningMatch(other);

    fireEvent.click(playerToggle);

    expect(await screen.findByText(en.matchSetup.activeMatch.title)).toBeTruthy();
    expect(screen.queryByRole("button", { name: en.matchSetup.startMatch })).toBeNull();
    expect(window.localStorage.getItem("fairplayr.matchSetup.v1")).toBe(before.setup);
    expect(window.localStorage.getItem("fairplayr.liveMatch.v1")).toBe(before.live);
  });

  it("starts normally again once the previous match has ended", async () => {
    storeRunningMatch();
    // The match lifecycle ends it (live screen → end match).
    endMatch(SETUP);
    saveMatchSetupDraft({ ...SETUP, id: "setup-next" });

    renderManager();
    fireEvent.click(await screen.findByRole("button", { name: en.matchSetup.startMatch }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/live"));
    expect(getStoredMatchSetup()).toMatchObject({ status: "active", config: { id: "setup-next" } });
    expect(getStoredLiveMatch()).toMatchObject({ setupId: "setup-next", status: "not_started", teamScore: 0 });
  });
});
