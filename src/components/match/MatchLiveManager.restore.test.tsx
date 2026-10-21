import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchLiveManager } from "@/components/match/MatchLiveManager";
import {
  createLiveMatchFromSetup,
  startLiveMatch,
  substitutePlayers,
  updateScore,
  type LiveMatchState,
} from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import { createGoalEvent, createSubstitutionEvent } from "@/domain/matchEvent";
import type { Player } from "@/domain/team";
import {
  getLiveHeartbeat,
  resetLiveHeartbeatSessionForTests,
  saveLiveHeartbeat,
} from "@/lib/storage/liveHeartbeatStorage";
import { getStoredLiveMatch, saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import { activateMatch } from "@/lib/storage/matchStorage";
import { getSquadSnapshot, saveSquadSnapshot } from "@/lib/storage/squadSnapshotStorage";
import { resetStorageSignalsForTests } from "@/lib/storage/storageEnvelope";
import en from "../../../messages/en.json";

// ─── Module mocks (same pattern as MatchLiveManager.test.tsx) ─────────────────

let searchParams = new URLSearchParams("");

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

const ROUTER = { push: vi.fn() };
const AUTH: { status: string } = { status: "guest" };

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ROUTER,
}));

vi.mock("@/components/providers/AuthProvider", () => ({
  useAuth: () => AUTH,
}));

vi.mock("@/lib/featureFlags", () => ({
  isSidelineLiveUiEnabled: () => true,
}));

function player(id: string, name: string, number?: number): Player {
  return {
    id,
    name,
    number,
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: "2026-04-15T10:00:00.000Z",
    updatedAt: "2026-04-15T10:00:00.000Z",
  };
}

const PLAYERS: Player[] = [
  player("p1", "Frida", 1),
  player("p2", "Ida", 2),
  player("p3", "Selma", 3),
  player("p4", "Vilde", 4),
  player("p5", "Nora", 5),
  player("p6", "Emma", 6),
  player("p7", "Thea", 7),
];

// Mutated (never replaced) between tests so the mocked hook stays stable.
const WORKSPACE: {
  isLoading: boolean;
  error: string | null;
  activeTeamId: string | null;
  teams: { id: string; players: Player[] }[];
} = { isLoading: false, error: null, activeTeamId: "team-1", teams: [] };

const ACTIVE_MATCH = {
  activeMatch: null,
  activeMatchHref: "/match/live",
  needsRecovery: false,
  forceCloseActiveMatch: vi.fn(),
  discardActiveMatch: vi.fn(),
  refreshActiveMatch: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({
  useTeamWorkspace: () => WORKSPACE,
}));

vi.mock("@/components/providers/ActiveMatchProvider", () => ({
  useActiveMatch: () => ACTIVE_MATCH,
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SETUP: MatchSetup = {
  id: "setup-1",
  teamId: "team-1",
  format: "5v5",
  reportEnabled: false,
  formationId: "5v5-2-2",
  duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
  selectedPlayerIds: PLAYERS.map((item) => item.id),
  startingPlayerIds: ["p1", "p2", "p3", "p4", "p5"],
  slotAssignments: { "5v5-1": "p1", "5v5-2": "p2", "5v5-3": "p3", "5v5-4": "p4", "5v5-5": "p5" },
  createdAt: "2026-04-15T10:00:00.000Z",
  updatedAt: "2026-04-15T10:00:00.000Z",
};

const MIN = 60_000;
const KICKOFF = 1_000_000_000;
let now = KICKOFF;

/** 2–1 with a scorer, and Emma on for Vilde at 5'. */
function seedPlayedMatch(): LiveMatchState {
  let state = startLiveMatch(createLiveMatchFromSetup(SETUP), KICKOFF);
  state = {
    ...updateScore(updateScore(state, "team", 1), "team", 1),
    events: [
      createGoalEvent({ minute: 2, timestampMs: KICKOFF + 2 * MIN, teamSide: "own", scorerPlayerId: "p2", scorerName: "Ida" }),
      createGoalEvent({ minute: 4, timestampMs: KICKOFF + 4 * MIN, teamSide: "own", scorerPlayerId: "p3", scorerName: "Selma" }),
    ],
  };
  state = {
    ...substitutePlayers(state, "p4", "p6", KICKOFF + 5 * MIN),
    events: [...state.events, createSubstitutionEvent({ minute: 5, timestampMs: KICKOFF + 5 * MIN, inPlayerId: "p6", outPlayerId: "p4" })],
  };
  state = {
    ...updateScore(state, "opponent", 1),
    events: [...state.events, createGoalEvent({ minute: 6, timestampMs: KICKOFF + 6 * MIN, teamSide: "opponent" })],
  };
  activateMatch(SETUP, null);
  saveStoredLiveMatch(state);
  return state;
}

function renderManager() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MatchLiveManager />
    </NextIntlClientProvider>
  );
}

function scoreLabel() {
  return screen.getByTestId("live-score").getAttribute("aria-label");
}

describe("MatchLiveManager restore (OFF-01a)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStorageSignalsForTests();
    // Every test is a fresh document load (B9 is evaluated once per document).
    resetLiveHeartbeatSessionForTests();
    searchParams = new URLSearchParams("");
    AUTH.status = "guest";
    WORKSPACE.isLoading = false;
    WORKSPACE.error = null;
    WORKSPACE.teams = [{ id: "team-1", players: PLAYERS }];
    now = KICKOFF + 8 * MIN;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
  });

  afterEach(() => {
    cleanup();
    resetLiveHeartbeatSessionForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("restores score, scorers, pitch and bench after a reload, and saves the squad snapshot", async () => {
    seedPlayedMatch();
    renderManager();

    await waitFor(() => expect(scoreLabel()).toBe("Score: us 2, them 1"));
    expect(screen.getAllByText("Emma").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Vilde").length).toBeGreaterThan(0);
    expect(getSquadSnapshot("setup-1")?.players.map((item) => item.name)).toContain("Emma");
    expect(getStoredLiveMatch()?.events.filter((event) => event.type === "goal")).toHaveLength(3);
  });

  it("signed in offline without the team list: restores from the squad snapshot, not to an empty screen", async () => {
    seedPlayedMatch();
    saveSquadSnapshot({ setupId: "setup-1", teamId: "team-1", squadPlayerIds: SETUP.selectedPlayerIds, players: PLAYERS });
    AUTH.status = "authenticated";
    WORKSPACE.teams = [];
    WORKSPACE.error = "TypeError: Failed to fetch";
    renderManager();

    await waitFor(() => expect(scoreLabel()).toBe("Score: us 2, them 1"));
    expect(screen.getAllByText("Emma").length).toBeGreaterThan(0);
    expect(screen.queryByText(en.matchLive.recovery.title)).toBeNull();
  });

  it("does not wait for a slow team list when a squad snapshot exists", async () => {
    seedPlayedMatch();
    saveSquadSnapshot({ setupId: "setup-1", teamId: "team-1", squadPlayerIds: SETUP.selectedPlayerIds, players: PLAYERS });
    WORKSPACE.isLoading = true;
    WORKSPACE.teams = [];
    renderManager();

    await waitFor(() => expect(scoreLabel()).toBe("Score: us 2, them 1"));
  });

  it("without team or snapshot keeps the match with placeholder names (never liveMatch = null)", async () => {
    seedPlayedMatch();
    WORKSPACE.teams = [];
    renderManager();

    await waitFor(() => expect(scoreLabel()).toBe("Score: us 2, them 1"));
    expect(screen.queryByText(en.matchLive.empty)).toBeNull();
    expect(getStoredLiveMatch()?.teamScore).toBe(2);
  });

  it("tells the coach how long the app was closed while the clock ran, without moving the clock", async () => {
    const state = seedPlayedMatch();
    saveLiveHeartbeat(state.id, KICKOFF + 1 * MIN);
    now = KICKOFF + 8 * MIN; // closed for 7 minutes
    renderManager();

    const notice = await screen.findByTestId("restored-match-notice");
    expect(notice.textContent).toContain(en.restore.closedGap.replace("{minutes}", "7"));
    expect(notice.getAttribute("role")).toBe("status");
    expect(getStoredLiveMatch()?.clock).toEqual(state.clock);
  });

  it("is silent after a quick reload", async () => {
    const state = seedPlayedMatch();
    saveLiveHeartbeat(state.id, now - 30_000);
    renderManager();

    await waitFor(() => expect(scoreLabel()).toBe("Score: us 2, them 1"));
    expect(screen.queryByTestId("restored-match-notice")).toBeNull();
  });

  it("a failed save shows a persistent error, keeps the match in memory and never reverts it from storage", async () => {
    seedPlayedMatch();
    const view = renderManager();
    await waitFor(() => expect(scoreLabel()).toBe("Score: us 2, them 1"));

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.sideline.goals.us }));

    const notice = await screen.findByTestId("storage-error-notice");
    expect(notice.getAttribute("role")).toBe("alert");
    expect(scoreLabel()).toBe("Score: us 3, them 1");
    expect(getStoredLiveMatch()?.teamScore).toBe(2);

    // A team list reload re-runs the restore; the newer in-memory match stays.
    WORKSPACE.teams = [{ id: "team-1", players: [...PLAYERS] }];
    view.rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <MatchLiveManager />
      </NextIntlClientProvider>
    );
    expect(scoreLabel()).toBe("Score: us 3, them 1");

    // The scoreboard meta line says it in words with a glyph (never only a
    // wordless cue), the clock key's label too.
    expect(screen.getByTestId("live-meta").textContent).toContain(en.restore.storageError.short);
    expect(screen.getByTestId("live-clock").getAttribute("aria-label")).toContain(en.restore.storageError.short);

    // Hiding the band leaves the meta line and the menu's first row: the
    // condition keeps speaking until it is resolved.
    fireEvent.click(screen.getByRole("button", { name: en.restore.storageError.hide }));
    expect(screen.queryByTestId("storage-error-notice")).toBeNull();
    expect(screen.queryByTestId("storage-error-cue")).toBeNull();
    expect(screen.getByTestId("live-meta").textContent).toContain(en.restore.storageError.short);
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.sideline.menu.open }));
    const menu = screen.getByTestId("live-menu");
    const firstNote = menu.querySelector("p");
    expect(firstNote?.getAttribute("data-testid")).toBe("live-menu-save-failed");
    expect(firstNote?.textContent).toContain(en.restore.storageError.title);
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.sideline.menu.close }));

    // A later successful save resolves the condition.
    vi.mocked(Storage.prototype.setItem).mockRestore();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: en.matchLive.sideline.goals.them }));
    });
    await waitFor(() => expect(screen.queryByTestId("storage-error-notice")).toBeNull());
    expect(getStoredLiveMatch()?.teamScore).toBe(3);
    expect(screen.getByTestId("live-meta").textContent).not.toContain(en.restore.storageError.short);
  }, 20_000);

  it("a match restored with placeholder names never stores or sends them (substitution and scorer)", async () => {
    seedPlayedMatch();
    AUTH.status = "authenticated";
    activateMatch(SETUP, "match-1");
    WORKSPACE.teams = [];
    const requests: { method: string; url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        requests.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
        const json = (value: unknown) =>
          Promise.resolve(new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }));
        if (method === "GET") return json({ match: { reportEnabled: true } });
        if (method === "POST") return json({ event: { id: "ev-1" } });
        return json({});
      })
    );
    renderManager();
    await waitFor(() => expect(scoreLabel()).toBe("Score: us 2, them 1"));

    // Substitution: p5 («Player 5») off, p7 («Player 7») on.
    fireEvent.click(document.querySelector('[data-player-id="p5"]')!);
    fireEvent.click(document.querySelector('[data-bench-player-id="p7"]')!);
    await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p7"));
    const sub = getStoredLiveMatch()!.events.at(-1)!;
    expect(sub).toMatchObject({ type: "substitution", inPlayerId: "p7", outPlayerId: "p5" });
    expect(sub.type === "substitution" ? [sub.inPlayerName, sub.outPlayerName] : null).toEqual([null, null]);

    // Goal with the scorer prompt: the scorer is stored by id only.
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.sideline.goals.us }));
    const scorerSheet = await screen.findByTestId("live-scorer");
    fireEvent.click(scorerSheet.querySelectorAll("button")[1]);
    await waitFor(() => {
      const goal = getStoredLiveMatch()!.events.filter((event) => event.type === "goal").at(-1)!;
      expect(goal.type === "goal" ? goal.scorerPlayerId : null).toBeTruthy();
    });
    const goal = getStoredLiveMatch()!.events.filter((event) => event.type === "goal").at(-1)!;
    const scorerId = goal.type === "goal" ? goal.scorerPlayerId : null;
    expect(goal.type === "goal" ? goal.scorerName : "x").toBeNull();
    await waitFor(() => expect(requests.some((request) => request.method === "PATCH" && request.url.includes("/events/"))).toBe(true));
    const patch = requests.find((request) => request.method === "PATCH" && request.url.includes("/events/"))!;
    expect(patch.body).toMatchObject({ primaryPlayerId: scorerId, payload: { primaryPlayerName: null } });

    // Nothing stored or sent carries a placeholder name.
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 700)));
    expect(window.localStorage.getItem("fairplayr.liveMatch.v1")).not.toMatch(/Player \d/);
    for (const request of requests) expect(JSON.stringify(request.body ?? "")).not.toMatch(/Player \d/);
  }, 20_000);

  it("in-app navigation away and back (Live unmounted for 3 min) shows no closed-app notice", async () => {
    const state = seedPlayedMatch();
    saveLiveHeartbeat(state.id, now - 10_000);
    const first = renderManager();
    await waitFor(() => expect(scoreLabel()).toBe("Score: us 2, them 1"));
    expect(screen.queryByTestId("restored-match-notice")).toBeNull();

    first.unmount();
    // Live beats once more when it unmounts.
    expect(getLiveHeartbeat()).toEqual({ matchId: state.id, atMs: now });

    now += 3 * MIN;
    renderManager();
    await waitFor(() => expect(scoreLabel()).toBe("Score: us 2, them 1"));
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 20)));
    expect(screen.queryByTestId("restored-match-notice")).toBeNull();
  });

  it("a real cold start after the gap still tells the coach, and the menu keeps it for the session", async () => {
    const state = seedPlayedMatch();
    saveLiveHeartbeat(state.id, now - 7 * MIN);
    const first = renderManager();
    expect(await screen.findByTestId("restored-match-notice")).toBeTruthy();
    first.unmount();

    // Back on Live in the same session: no band again, but the menu has it.
    renderManager();
    await waitFor(() => expect(scoreLabel()).toBe("Score: us 2, them 1"));
    expect(screen.queryByTestId("restored-match-notice")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.sideline.menu.open }));
    expect(screen.getByTestId("live-menu-note-restoredMatch").textContent).toContain(
      en.restore.closedGap.replace("{minutes}", "7")
    );
  });

  it("a team list error while the match is shown is a non-blocking warning (band and menu)", async () => {
    seedPlayedMatch();
    saveSquadSnapshot({ setupId: "setup-1", teamId: "team-1", squadPlayerIds: SETUP.selectedPlayerIds, players: PLAYERS });
    WORKSPACE.teams = [];
    WORKSPACE.error = "TypeError: Failed to fetch";
    renderManager();

    await waitFor(() => expect(scoreLabel()).toBe("Score: us 2, them 1"));
    const notice = await screen.findByTestId("workspace-error-notice");
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.textContent).toContain(en.restore.workspaceError.title);
    expect(screen.queryByText("TypeError: Failed to fetch")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: en.restore.workspaceError.hide }));
    expect(screen.queryByTestId("workspace-error-notice")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.sideline.menu.open }));
    expect(screen.getByTestId("live-menu-note-workspaceError").textContent).toContain(en.restore.workspaceError.title);
  });

  it("shows one band at a time: the storage error outranks the restored-match info", async () => {
    const state = seedPlayedMatch();
    saveLiveHeartbeat(state.id, now - 7 * MIN);
    renderManager();
    await screen.findByTestId("restored-match-notice");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.sideline.goals.us }));

    await screen.findByTestId("storage-error-notice");
    expect(screen.queryByTestId("restored-match-notice")).toBeNull();
    expect(screen.getAllByTestId("live-notice-band")).toHaveLength(1);
  });

  it("never replaces the local match with an older server snapshot", async () => {
    const local = seedPlayedMatch();
    AUTH.status = "authenticated";
    activateMatch(SETUP, "match-1");
    searchParams = new URLSearchParams("matchId=match-1");
    const stale = { ...local, teamScore: 0, opponentScore: 0, updatedAt: "2000-01-01T00:00:00.000Z" };
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ match: { status: "live", runtimeState: stale } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        )
      )
    );
    renderManager();

    await waitFor(() => expect(scoreLabel()).toBe("Score: us 2, them 1"));
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 50)));
    expect(scoreLabel()).toBe("Score: us 2, them 1");
    expect(getStoredLiveMatch()?.teamScore).toBe(2);
  });
});
