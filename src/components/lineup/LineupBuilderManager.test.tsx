import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LineupBuilderManager } from "@/components/lineup/LineupBuilderManager";
import type { MatchSetup } from "@/domain/match";
import type { Player } from "@/domain/team";
import { createLiveMatchFromSetup, startLiveMatch, updateScore } from "@/domain/liveMatch";
import { activateMatch, endMatch, getStoredMatchSetup, saveMatchSetupDraft } from "@/lib/storage/matchStorage";
import { saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import en from "../../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
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

const KICKOFF_MS = Date.parse("2026-04-15T10:00:00.000Z");

function storeRunningMatch(config: MatchSetup, serverMatchId: string | null = null) {
  activateMatch(config, serverMatchId);
  saveStoredLiveMatch(updateScore(startLiveMatch(createLiveMatchFromSetup(config), KICKOFF_MS), "team", 1));
  return {
    setup: window.localStorage.getItem("fairplayr.matchSetup.v1"),
    live: window.localStorage.getItem("fairplayr.liveMatch.v1"),
  };
}

function renderManager() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LineupBuilderManager />
    </NextIntlClientProvider>
  );
}

// FP-MS2.1-A1: storage refuses lineup writes while a match is active, so the
// lineup must never look editable (and silently drop changes) during a match.
describe("LineupBuilderManager with an active match", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("is read-only with a way back to the match and leaves storage untouched", async () => {
    const before = storeRunningMatch(SETUP);

    renderManager();

    expect(await screen.findByText(en.lineup.activeMatch.title)).toBeTruthy();
    expect(screen.getByRole("link", { name: en.lineup.activeMatch.continue }).getAttribute("href")).toBe(
      "/match/live"
    );
    expect(screen.queryByRole("button", { name: en.lineup.actions.autoFill })).toBeNull();
    expect(screen.queryByRole("button", { name: en.lineup.players.clear })).toBeNull();
    expect(window.localStorage.getItem("fairplayr.matchSetup.v1")).toBe(before.setup);
    expect(window.localStorage.getItem("fairplayr.liveMatch.v1")).toBe(before.live);
  });

  it("links back to the server match when the active match has one", async () => {
    storeRunningMatch(SETUP, "match-9");

    renderManager();

    expect(
      (await screen.findByRole("link", { name: en.lineup.activeMatch.continue })).getAttribute("href")
    ).toBe("/match/live?matchId=match-9");
  });

  it("swaps the editor for the way back when an edit is rejected because a match became active", async () => {
    saveMatchSetupDraft(SETUP);
    renderManager();
    const clearSquad = await screen.findByRole("button", { name: en.lineup.players.clear });

    // Another tab starts a match; this tab's next edit must not look saved.
    const before = storeRunningMatch({ ...SETUP, id: "setup-other" });

    fireEvent.click(clearSquad);

    expect(await screen.findByText(en.lineup.activeMatch.title)).toBeTruthy();
    expect(screen.queryByRole("button", { name: en.lineup.players.clear })).toBeNull();
    expect(window.localStorage.getItem("fairplayr.matchSetup.v1")).toBe(before.setup);
    expect(window.localStorage.getItem("fairplayr.liveMatch.v1")).toBe(before.live);
  });

  it("stays editable and saves a draft when no match is active", async () => {
    saveMatchSetupDraft(SETUP);
    renderManager();

    fireEvent.click(await screen.findByRole("button", { name: en.lineup.players.clear }));

    expect(screen.queryByText(en.lineup.activeMatch.title)).toBeNull();
    expect(getStoredMatchSetup()).toMatchObject({ status: "draft", config: { selectedPlayerIds: [] } });
  });
});

// FP-MS2.1-A3: opening the lineup never writes, and an ended match is never
// revived as a draft (which Match Setup would then resume).
describe("LineupBuilderManager with an ended match or no edits", () => {
  const SETUP_KEY = "fairplayr.matchSetup.v1";

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("leaves an ended match ended when the lineup is only opened", async () => {
    activateMatch(SETUP, null);
    endMatch(SETUP);
    const before = window.localStorage.getItem(SETUP_KEY);

    renderManager();
    await screen.findByRole("button", { name: en.lineup.actions.autoFill });

    expect(window.localStorage.getItem(SETUP_KEY)).toBe(before);
    expect(getStoredMatchSetup()).toMatchObject({ status: "ended", config: { id: SETUP.id } });
  });

  it("starts a new draft, not the ended match, once the coach edits", async () => {
    activateMatch(SETUP, null);
    endMatch(SETUP);

    renderManager();
    fireEvent.click(await screen.findByRole("button", { name: en.lineup.players.clear }));

    const stored = getStoredMatchSetup();
    expect(stored).toMatchObject({ status: "draft", config: { selectedPlayerIds: [] } });
    expect(stored?.config.id).not.toBe(SETUP.id);
  });

  it("writes nothing when opened with no stored setup", async () => {
    renderManager();
    await screen.findByRole("button", { name: en.lineup.actions.autoFill });

    expect(window.localStorage.getItem(SETUP_KEY)).toBeNull();
  });

  it("leaves an unfinished draft byte-for-byte unchanged when nothing is edited", async () => {
    saveMatchSetupDraft(SETUP);
    const before = window.localStorage.getItem(SETUP_KEY);

    renderManager();
    await screen.findByRole("button", { name: en.lineup.actions.autoFill });

    expect(window.localStorage.getItem(SETUP_KEY)).toBe(before);
  });
});
