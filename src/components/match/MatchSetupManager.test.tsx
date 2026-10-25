import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchSetupManager } from "@/components/match/MatchSetupManager";
import {
  autoFillLineup,
  createMatchSetupWithPrefs,
  selectAllSquad,
  type MatchSetup,
} from "@/domain/match";
import type { Player } from "@/domain/team";
import { createLiveMatchFromSetup, startLiveMatch, updateScore } from "@/domain/liveMatch";
import { activateMatch, endMatch, getStoredMatchSetup, saveMatchSetupDraft } from "@/lib/storage/matchStorage";
import { getStoredLiveMatch, saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import { getTeamMatchPrefs, saveTeamMatchPrefs } from "@/lib/storage/teamPrefsStorage";
import en from "../../../messages/en.json";
import no from "../../../messages/no.json";

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

const PLAYERS: Player[] = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"].map((id, index) => ({
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

// FP-MS2.1-A3 (MS-03): team defaults own the formation of a new match. Opening
// setup never writes them, and a match's own formation never changes them.
describe("MatchSetupManager team defaults and drafts", () => {
  const PREFS_KEY = "fairplayr.teamPrefs.v1";
  const SETUP_KEY = "fairplayr.matchSetup.v1";
  const DEFAULTS = { format: "7v7", formationId: "7v7-2-3-1", durationPresetId: "2x20" } as const;

  function sevenASide(formationId: string): MatchSetup {
    const config = createMatchSetupWithPrefs("team-1", { format: "7v7", formationId });
    return autoFillLineup(selectAllSquad(config, PLAYERS.map((player) => player.id)));
  }

  /** The compact settings card shows the formation as its shape, e.g. "2-3-1". */
  async function shownFormation() {
    await screen.findByText(en.matchSetup.compact.title);
    return ["2-3-1", "3-2-1", "2-2-2"].filter((shape) => screen.queryByText(shape));
  }

  beforeEach(() => {
    window.localStorage.clear();
    searchParams = new URLSearchParams();
    routerPush.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    saveTeamMatchPrefs("team-1", DEFAULTS);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens with the team default 2-3-1 after a previous match ended in 3-2-1", async () => {
    const previous = sevenASide("7v7-3-2-1");
    activateMatch(previous, null);
    endMatch(previous);

    renderManager();

    expect(await shownFormation()).toEqual(["2-3-1"]);
    expect(screen.queryByText(en.matchSetup.draft.resumed)).toBeNull();
    expect(getTeamMatchPrefs("team-1")).toEqual(DEFAULTS);
  });

  it("leaves team defaults and the stored setup byte-for-byte unchanged when nothing is changed", async () => {
    const previous = sevenASide("7v7-3-2-1");
    endMatch(previous);
    const before = {
      prefs: window.localStorage.getItem(PREFS_KEY),
      setup: window.localStorage.getItem(SETUP_KEY),
    };

    renderManager();
    await shownFormation();
    cleanup();

    expect(window.localStorage.getItem(PREFS_KEY)).toBe(before.prefs);
    expect(window.localStorage.getItem(SETUP_KEY)).toBe(before.setup);
  });

  it("starts a fresh guest match offline in the default formation, which Live receives", async () => {
    const previous = sevenASide("7v7-3-2-1");
    activateMatch(previous, null);
    endMatch(previous);

    renderManager();
    fireEvent.click(await screen.findByRole("button", { name: en.matchSetup.squad.selectAll }));
    fireEvent.click(await screen.findByRole("button", { name: en.matchSetup.pitch.autoFill }));
    fireEvent.click(await screen.findByRole("button", { name: en.matchSetup.startMatch }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/live"));
    expect(fetch).not.toHaveBeenCalled();
    expect(getStoredMatchSetup()).toMatchObject({
      status: "active",
      serverMatchId: null,
      config: { formationId: "7v7-2-3-1" },
    });
    expect(getStoredMatchSetup()?.config.id).not.toBe(previous.id);
    expect(getStoredLiveMatch()).toMatchObject({ formationId: "7v7-2-3-1", status: "not_started" });
    expect(getTeamMatchPrefs("team-1")).toEqual(DEFAULTS);
  });

  it("resumes an unfinished draft, labelled, and can start over from the team defaults", async () => {
    const draft = sevenASide("7v7-3-2-1");
    saveMatchSetupDraft(draft);

    renderManager();

    expect(await screen.findByText(en.matchSetup.draft.resumed)).toBeTruthy();
    expect(screen.getByText(en.matchSetup.draft.replaceHint)).toBeTruthy();
    expect(await shownFormation()).toEqual(["3-2-1"]);
    expect(getStoredMatchSetup()?.config).toEqual(draft);

    fireEvent.click(screen.getByRole("button", { name: en.matchSetup.draft.startFromDefaults }));

    await waitFor(() => expect(screen.queryByText(en.matchSetup.draft.resumed)).toBeNull());
    expect(await shownFormation()).toEqual(["2-3-1"]);
    expect(getStoredMatchSetup()).toBeNull();
    expect(getTeamMatchPrefs("team-1")).toEqual(DEFAULTS);
  });

  it("changes one match's formation without changing team defaults, and keeps it after a reload", async () => {
    const prefsBefore = window.localStorage.getItem(PREFS_KEY);

    renderManager();
    fireEvent.click(await screen.findByRole("button", { name: en.matchSetup.compact.edit }));
    fireEvent.click(await screen.findByRole("button", { name: "3-2-1" }));

    await waitFor(() =>
      expect(getStoredMatchSetup()).toMatchObject({ status: "draft", config: { formationId: "7v7-3-2-1" } })
    );
    expect(window.localStorage.getItem(PREFS_KEY)).toBe(prefsBefore);

    // Reload / navigate back: the unfinished draft is resumed, not the default.
    cleanup();
    renderManager();

    expect(await screen.findByText(en.matchSetup.draft.resumed)).toBeTruthy();
    expect(await shownFormation()).toEqual(["3-2-1"]);
    expect(window.localStorage.getItem(PREFS_KEY)).toBe(prefsBefore);
  });

  it("leaves an active match and the team defaults untouched", async () => {
    const running = sevenASide("7v7-3-2-1");
    activateMatch(running, null);
    saveStoredLiveMatch(startLiveMatch(createLiveMatchFromSetup(running), Date.parse("2026-04-15T10:00:00.000Z")));
    const before = {
      prefs: window.localStorage.getItem(PREFS_KEY),
      setup: window.localStorage.getItem(SETUP_KEY),
      live: window.localStorage.getItem("fairplayr.liveMatch.v1"),
    };

    renderManager();

    expect(await screen.findByText(en.matchSetup.activeMatch.title)).toBeTruthy();
    expect(screen.queryByText(en.matchSetup.draft.resumed)).toBeNull();
    expect(window.localStorage.getItem(PREFS_KEY)).toBe(before.prefs);
    expect(window.localStorage.getItem(SETUP_KEY)).toBe(before.setup);
    expect(window.localStorage.getItem("fairplayr.liveMatch.v1")).toBe(before.live);
  });
});

// UI-MS-01a + U9: attendance first, the whole squad preselected for a new
// setup but nobody on the pitch, settings collapsed, a sticky Start bar.
describe("MatchSetupManager attendance and preselection (U9)", () => {
  const SETUP_KEY = "fairplayr.matchSetup.v1";

  const attendance = (name: string) =>
    screen
      .getAllByRole("button", { name: new RegExp(`^${name}`) })
      .find((button) => button.closest("ul") !== null)!;
  const startButton = () => screen.getByRole("button", { name: en.matchSetup.startMatch }) as HTMLButtonElement;
  const filledSlots = () => document.querySelectorAll("[data-slot-id][data-player-id]");

  beforeEach(() => {
    window.localStorage.clear();
    searchParams = new URLSearchParams();
    routerPush.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("a new setup has everyone present, nobody on the pitch, Start disabled and nothing stored", async () => {
    renderManager();
    await screen.findByText(en.matchSetup.sections.squad);

    for (const player of PLAYERS) {
      expect(attendance(player.name).getAttribute("aria-pressed")).toBe("true");
    }
    expect(screen.queryByText(en.matchSetup.squad.absent)).toBeNull();
    expect(screen.getByText(en.matchSetup.footer.squad.replace("{count}", "8"))).toBeTruthy();
    expect(filledSlots()).toHaveLength(0);
    expect(startButton().disabled).toBe(true);
    expect(screen.getByText(en.matchSetup.footer.notReady)).toBeTruthy();
    expect(window.localStorage.getItem(SETUP_KEY)).toBeNull();
  });

  it("says why Start is locked, in reading order and as the button's description", async () => {
    renderManager();
    await screen.findByText(en.matchSetup.sections.squad);

    const description = () => document.getElementById(startButton().getAttribute("aria-describedby")!)!;
    expect(description().textContent).toMatch(/^Start match is not available yet\. Place \d+ more players on the pitch\.$/);
    // Read right before the button, since a disabled button can't be tabbed to.
    expect(description().nextElementSibling).toBe(startButton());

    fireEvent.click(screen.getByRole("button", { name: en.matchSetup.pitch.autoFill }));

    await waitFor(() => expect(startButton().disabled).toBe(false));
    expect(description().textContent).toBe(en.matchSetup.footer.ready);
  });

  it("enables Start only once the lineup is filled explicitly", async () => {
    renderManager();
    await screen.findByText(en.matchSetup.sections.squad);
    expect(startButton().disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: en.matchSetup.pitch.autoFill }));

    await waitFor(() => expect(startButton().disabled).toBe(false));
    expect(filledSlots().length).toBeGreaterThan(0);
    expect(screen.getByText(en.matchSetup.footer.ready)).toBeTruthy();
    expect(getStoredMatchSetup()).toMatchObject({ status: "draft" });
  });

  it("keeps focus in the bar while the match starts (C1-F2)", async () => {
    renderManager();
    await screen.findByText(en.matchSetup.sections.squad);
    fireEvent.click(screen.getByRole("button", { name: en.matchSetup.pitch.autoFill }));
    await waitFor(() => expect(startButton().disabled).toBe(false));

    startButton().focus();
    fireEvent.click(startButton());

    const status = await screen.findByText(en.matchSetup.footer.starting);
    expect(document.activeElement).toBe(status);
    expect(status.getAttribute("role")).toBe("status");
  });

  it("returns focus to Start when starting fails before any request (C1-F2)", async () => {
    renderManager();
    await screen.findByText(en.matchSetup.sections.squad);
    fireEvent.click(screen.getByRole("button", { name: en.matchSetup.pitch.autoFill }));
    await waitFor(() => expect(startButton().disabled).toBe(false));

    // The device cannot store the match: it must not start.
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    startButton().focus();
    fireEvent.click(startButton());
    setItem.mockRestore();

    expect(await screen.findByText(en.matchSetup.errors.startFailed)).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(startButton());
  });

  it("deselecting a player marks them away and removes them from the squad and the pitch", async () => {
    renderManager();
    await screen.findByText(en.matchSetup.sections.squad);
    fireEvent.click(screen.getByRole("button", { name: en.matchSetup.pitch.autoFill }));
    await waitFor(() => expect(startButton().disabled).toBe(false));
    const starter = getStoredMatchSetup()!.config.startingPlayerIds[0];
    const name = PLAYERS.find((player) => player.id === starter)!.name;

    fireEvent.click(attendance(name));

    await waitFor(() => expect(attendance(name).getAttribute("aria-pressed")).toBe("false"));
    // Absent says so in words, never colour only.
    expect(attendance(name).textContent).toContain(en.matchSetup.squad.absent);
    const stored = getStoredMatchSetup()!.config;
    expect(stored.selectedPlayerIds).not.toContain(starter);
    expect(stored.startingPlayerIds).not.toContain(starter);
    expect(document.querySelector(`[data-player-id="${starter}"]`)).toBeNull();
    expect(startButton().disabled).toBe(true);
  });

  it("resumes a draft with its own selection, without adding the rest of the team", async () => {
    const draft = selectAllSquad(createMatchSetupWithPrefs("team-1", { format: "5v5" }), ["p1", "p2", "p3"]);
    saveMatchSetupDraft(draft);

    renderManager();

    expect(await screen.findByText(en.matchSetup.draft.resumed)).toBeTruthy();
    expect(PLAYERS.map((player) => attendance(player.name).getAttribute("aria-pressed"))).toEqual([
      "true", "true", "true", "false", "false", "false", "false", "false",
    ]);
    expect(getStoredMatchSetup()?.config).toEqual(draft);
  });

  it("starting over from the team defaults preselects the squad again, with an empty pitch", async () => {
    saveMatchSetupDraft(autoFillLineup(selectAllSquad(createMatchSetupWithPrefs("team-1", { format: "5v5" }), ["p1", "p2", "p3", "p4", "p5"])));

    renderManager();
    fireEvent.click(await screen.findByRole("button", { name: en.matchSetup.draft.startFromDefaults }));

    await waitFor(() => expect(screen.queryByText(en.matchSetup.draft.resumed)).toBeNull());
    for (const player of PLAYERS) {
      expect(attendance(player.name).getAttribute("aria-pressed")).toBe("true");
    }
    expect(filledSlots()).toHaveLength(0);
    expect(startButton().disabled).toBe(true);
    expect(getStoredMatchSetup()).toBeNull();
  });

  it("keeps the match settings collapsed by default, even without team defaults", async () => {
    renderManager();

    const toggle = await screen.findByRole("button", { name: en.matchSetup.compact.edit });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "7v7" })).toBeNull();
    // The summary row: format · formation · duration.
    expect(screen.getByText("5v5")).toBeTruthy();
    expect(screen.getByText("2-2")).toBeTruthy();

    fireEvent.click(toggle);

    // One stable name; aria-expanded carries the state.
    expect(screen.getByRole("button", { name: en.matchSetup.compact.edit })).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /^7v7/ })).toBeTruthy();
    // Opening the settings is not an edit.
    expect(window.localStorage.getItem(SETUP_KEY)).toBeNull();
  });

  it("the report row is one switch that toggles and is saved with the draft", async () => {
    renderManager();

    // The switch sits inside the match card (DESIGN.md §7.1).
    fireEvent.click(await screen.findByRole("button", { name: en.matchSetup.compact.edit }));
    const toggle = screen.getByRole("switch", { name: en.matchSetup.reportToggle.label });
    const before = toggle.getAttribute("aria-checked");

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle.getAttribute("aria-checked")).not.toBe(before));
    expect(getStoredMatchSetup()?.config.reportEnabled).toBe(before !== "true");
  });

  it("puts the match first, then attendance, then the lineup (UI-MS-01d)", async () => {
    renderManager();

    const match = await screen.findByRole("heading", { name: en.matchSetup.compact.title });
    const squad = screen.getByRole("heading", { name: en.matchSetup.sections.squad });
    const lineup = screen.getByRole("heading", { name: en.matchSetup.sections.lineup });
    expect(match.compareDocumentPosition(squad) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(squad.compareDocumentPosition(lineup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The report state is in the summary while the card is closed.
    expect(screen.getByText(/^Summary (on|off)$/)).toBeTruthy();
  });

  it("lets the coach clear the custom field and type 2 × 18, and keeps it (UI-DURATION-01)", async () => {
    renderManager();
    fireEvent.click(await screen.findByRole("button", { name: en.matchSetup.compact.edit }));

    const field = screen.getByRole("textbox", { name: en.matchSetup.duration.customPerHalf });
    fireEvent.change(field, { target: { value: "" } });
    // Empty is not applied and says why, but the field stays empty.
    expect((field as HTMLInputElement).value).toBe("");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Enter a whole number from 3 to 120.")).toBeTruthy();

    fireEvent.change(field, { target: { value: "1" } });
    expect((field as HTMLInputElement).value).toBe("1");
    fireEvent.change(field, { target: { value: "18" } });
    expect((field as HTMLInputElement).value).toBe("18");
    expect(field.getAttribute("aria-invalid")).toBeNull();

    await waitFor(() =>
      expect(getStoredMatchSetup()?.config.duration).toMatchObject({
        mode: "custom",
        halves: 2,
        minutesPerHalf: 18,
        totalMinutes: 36,
      })
    );

    fireEvent.blur(field);
    expect((field as HTMLInputElement).value).toBe("18");
    expect(screen.getAllByText(/2×18 min/).length).toBeGreaterThan(0);
  });

  it("restores the applied value when the coach leaves an invalid custom entry", async () => {
    renderManager();
    fireEvent.click(await screen.findByRole("button", { name: en.matchSetup.compact.edit }));

    const field = screen.getByRole("textbox", { name: en.matchSetup.duration.customPerHalf }) as HTMLInputElement;
    const applied = field.value;
    fireEvent.change(field, { target: { value: "500" } });
    expect(field.getAttribute("aria-invalid")).toBe("true");
    fireEvent.blur(field);
    expect(field.value).toBe(applied);
    expect(window.localStorage.getItem(SETUP_KEY)).toBeNull();
  });

  it("has every matchSetup string in both English and Norwegian", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      value && typeof value === "object"
        ? Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key))
        : [prefix];

    expect(keys(no.matchSetup).sort()).toEqual(keys(en.matchSetup).sort());
    for (const key of ["squad.absent", "footer.squad", "footer.ready", "compact.edit", "pitch.autoFill", "pitch.benchTitle"]) {
      expect(keys(en.matchSetup)).toContain(key);
    }
  });
});
