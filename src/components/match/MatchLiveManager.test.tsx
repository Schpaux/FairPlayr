import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchLiveManager } from "@/components/match/MatchLiveManager";
import { getElapsedMs, getPlayerAccumulatedSeconds } from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import type { Player } from "@/domain/team";
import { activateMatch } from "@/lib/storage/matchStorage";
import { clearStoredLiveMatch, getStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import { getPendingMatchCompletion } from "@/lib/storage/pendingMatchCompletionStorage";
import en from "../../../messages/en.json";

// ─── Module mocks ─────────────────────────────────────────────────────────────

const routerPush = vi.fn();
const refreshActiveMatch = vi.fn<() => Promise<void>>();

// Mocked hooks must return referentially stable values, as the real ones do —
// MatchLiveManager effects depend on them.
// Reassigned only between renders (match A → match B regression test).
let searchParams = new URLSearchParams("matchId=match-1");

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

const ROUTER = { push: routerPush };
// Mutated (not replaced) between tests so the mocked hook stays stable.
const AUTH: { status: string } = { status: "authenticated" };

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

// The Modern Sideline view is off by default; one describe block turns it on.
const FLAGS = vi.hoisted(() => ({ sidelineLiveUi: false }));

vi.mock("@/lib/featureFlags", () => ({
  isSidelineLiveUiEnabled: () => FLAGS.sidelineLiveUi,
}));

const PLAYERS: Player[] = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"].map((id, index) => ({
  id,
  name: `Player ${index + 1}`,
  source: "manual",
  externalProvider: null,
  externalId: null,
  isManaged: false,
  createdAt: "2026-04-15T10:00:00.000Z",
  updatedAt: "2026-04-15T10:00:00.000Z",
}));

const WORKSPACE = {
  isLoading: false,
  error: null,
  activeTeamId: "team-1",
  teams: [{ id: "team-1", players: PLAYERS }],
};

const SERVER_ACTIVE_MATCH = { id: "match-1", teamId: "team-1", title: "Match", status: "live" };

const ACTIVE_MATCH: {
  activeMatch: {
    id: string;
    teamId: string;
    title: string;
    status: string;
    runtimeState?: Record<string, unknown> | null;
  } | null;
  [key: string]: unknown;
} = {
  activeMatch: SERVER_ACTIVE_MATCH,
  activeMatchHref: "/match/live?matchId=match-1",
  needsRecovery: false,
  forceCloseActiveMatch: vi.fn(),
  discardActiveMatch: vi.fn(),
  refreshActiveMatch,
};

vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({
  useTeamWorkspace: () => WORKSPACE,
}));

vi.mock("@/components/providers/ActiveMatchProvider", () => ({
  useActiveMatch: () => ACTIVE_MATCH,
}));

// ─── Fixtures / helpers ───────────────────────────────────────────────────────

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

let online = true;

function setOnline(value: boolean) {
  online = value;
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

type CompletionResponder = () => Promise<Response>;
let respondToCompletion: CompletionResponder;
let fetchMock: ReturnType<typeof vi.fn>;

function completionCalls() {
  return fetchMock.mock.calls.filter(([, init]) => {
    if (!init?.body) return false;
    return (JSON.parse(init.body as string) as { status?: string }).status === "completed";
  });
}

function renderManager() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MatchLiveManager />
    </NextIntlClientProvider>
  );
}

// Longer than the 1200 ms "Done!" pause before the automatic report navigation.
function waitForTimerWindow() {
  return act(() => new Promise((resolve) => window.setTimeout(resolve, 1500)));
}

function startAndScoreAndEnd() {
  fireEvent.click(screen.getByRole("button", { name: en.matchLive.actions.start }));
  fireEvent.click(screen.getByRole("button", { name: en.matchLive.score.increaseTeam }));
  fireEvent.click(screen.getByRole("button", { name: en.matchLive.score.increaseOpponent }));
  fireEvent.click(screen.getByRole("button", { name: en.matchLive.actions.end }));
}

describe("MatchLiveManager match completion", () => {
  beforeEach(() => {
    window.localStorage.clear();
    searchParams = new URLSearchParams("matchId=match-1");
    activateMatch(SETUP, "match-1");
    AUTH.status = "authenticated";
    ACTIVE_MATCH.activeMatch = SERVER_ACTIVE_MATCH;
    online = true;
    routerPush.mockReset();
    refreshActiveMatch.mockReset().mockResolvedValue(undefined);
    vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    respondToCompletion = () => Promise.resolve(new Response(null, { status: 204 }));
    fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (!online) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }

      const body = init?.body ? (JSON.parse(init.body as string) as { status?: string }) : null;

      if (body?.status === "completed") {
        return respondToCompletion();
      }

      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("completes locally when offline without an error or stuck loading overlay", async () => {
    renderManager();
    setOnline(false);

    startAndScoreAndEnd();

    expect(await screen.findByText(en.matchLive.pendingSync.title)).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText(en.matchLive.endingSequence.title)).toBeNull();
    });
    expect(screen.getByText(en.matchLive.pendingSync.descriptionOffline)).toBeTruthy();
    expect(screen.queryByText(en.matchLive.errors.endFailed)).toBeNull();
    expect(routerPush).not.toHaveBeenCalled();

    // Local state: ended, score and events preserved.
    const stored = getStoredLiveMatch();
    expect(stored?.status).toBe("ended");
    expect(stored?.teamScore).toBe(1);
    expect(stored?.opponentScore).toBe(1);
    expect(stored?.events.filter((event) => event.type === "goal")).toHaveLength(2);

    // Pending completion keeps the full final state for later sync.
    const pending = getPendingMatchCompletion("match-1");
    expect(pending?.body).toMatchObject({ status: "completed", scoreFor: 1, scoreAgainst: 1 });
    expect(pending?.body.runtimeState?.status).toBe("ended");
    expect(
      pending?.body.runtimeState?.events.filter((event) => event.type === "goal")
    ).toHaveLength(2);
  });

  it("syncs the pending completion when connectivity returns and offers the report without navigating", async () => {
    renderManager();
    setOnline(false);
    startAndScoreAndEnd();
    await screen.findByText(en.matchLive.pendingSync.title);

    setOnline(true);

    await waitFor(() => {
      expect(getPendingMatchCompletion("match-1")).toBeNull();
    });
    expect(await screen.findByText(en.matchLive.pendingSync.syncedTitle)).toBeTruthy();
    expect(screen.queryByText(en.matchLive.pendingSync.title)).toBeNull();
    expect(screen.queryByText(en.matchLive.endingSequence.done)).toBeNull();
    await waitForTimerWindow();
    expect(routerPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: en.matchLive.endingSequence.goToReport }));
    expect(routerPush).toHaveBeenCalledWith("/match/match-1");

    const [, init] = completionCalls().at(-1)!;
    expect(JSON.parse(init.body as string)).toMatchObject({
      status: "completed",
      scoreFor: 1,
      scoreAgainst: 1,
      runtimeState: { status: "ended" },
    });
  });

  it("syncs when connectivity returns before the pending completion is shown", async () => {
    renderManager();
    setOnline(false);
    startAndScoreAndEnd();
    // The offline send is still settling, so the pending state has not been
    // rendered (or subscribed to anything) yet when the device is back online.
    setOnline(true);

    await waitFor(() => {
      expect(getPendingMatchCompletion("match-1")).toBeNull();
    });
    expect(await screen.findByText(en.matchLive.pendingSync.syncedTitle)).toBeTruthy();
    expect(completionCalls().map(([url]) => url)).toEqual([
      "/api/matches/match-1",
      "/api/matches/match-1",
    ]);
  });

  it("retries once the send that was in flight while connectivity returned has failed", async () => {
    let failFirstSend: (error: Error) => void = () => {};
    respondToCompletion = () =>
      new Promise<Response>((_resolve, reject) => {
        failFirstSend = reject;
      });
    renderManager();
    startAndScoreAndEnd();
    await waitFor(() => expect(completionCalls()).toHaveLength(1));

    setOnline(false);
    setOnline(true);
    respondToCompletion = () => Promise.resolve(new Response(null, { status: 204 }));
    await act(async () => {
      failFirstSend(new TypeError("Failed to fetch"));
    });

    expect(await screen.findByText(en.matchLive.pendingSync.syncedTitle)).toBeTruthy();
    expect(getPendingMatchCompletion("match-1")).toBeNull();
    expect(completionCalls()).toHaveLength(2);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("retries a failed completion at most once per reconnect", async () => {
    respondToCompletion = () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "Server unavailable" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        })
      );
    renderManager();
    startAndScoreAndEnd();
    await screen.findByText(en.matchLive.pendingSync.title);
    await waitForTimerWindow();
    expect(completionCalls()).toHaveLength(1);

    setOnline(false);
    setOnline(true);
    await waitFor(() => expect(completionCalls()).toHaveLength(2));
    await waitForTimerWindow();
    expect(completionCalls()).toHaveLength(2);
    expect(getPendingMatchCompletion("match-1")).not.toBeNull();

    // The manual retry still works.
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.pendingSync.retry }));
    await waitFor(() => expect(completionCalls()).toHaveLength(3));
  });

  it("falls back to a safe message for a non-JSON error response and keeps the completion pending", async () => {
    respondToCompletion = () =>
      Promise.resolve(
        new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        })
      );

    renderManager();
    startAndScoreAndEnd();

    expect(await screen.findByText(en.matchLive.errors.endFailed)).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText(en.matchLive.endingSequence.title)).toBeNull();
    });
    expect(getPendingMatchCompletion("match-1")).not.toBeNull();
    expect(getStoredLiveMatch()?.status).toBe("ended");

    // Manual retry succeeds once the server recovers.
    respondToCompletion = () => Promise.resolve(new Response(null, { status: 204 }));
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.pendingSync.retry }));

    await waitFor(() => expect(getPendingMatchCompletion("match-1")).toBeNull());
    expect(screen.queryByText(en.matchLive.errors.endFailed)).toBeNull();
  });

  it("shows the server's message for a JSON error response", async () => {
    respondToCompletion = () =>
      Promise.resolve(Response.json({ message: "Ugyldig forespørsel." }, { status: 400 }));

    renderManager();
    startAndScoreAndEnd();

    expect(await screen.findByText("Ugyldig forespørsel.")).toBeTruthy();
  });

  it("does not get stuck when refreshing the active match fails after completion", async () => {
    refreshActiveMatch.mockRejectedValue(new TypeError("Failed to fetch"));

    renderManager();
    startAndScoreAndEnd();

    expect(await screen.findByText(en.matchLive.endingSequence.done)).toBeTruthy();
    expect(getPendingMatchCompletion("match-1")).toBeNull();
    // Let the report navigation fire here rather than in a later test.
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/match-1"), { timeout: 2500 });
  });

  it("retries a completion left pending by an earlier session on mount", async () => {
    const first = renderManager();
    setOnline(false);
    startAndScoreAndEnd();
    await screen.findByText(en.matchLive.pendingSync.title);
    first.unmount();

    online = true;
    renderManager();

    await waitFor(() => expect(getPendingMatchCompletion("match-1")).toBeNull());
    // One failed offline attempt, then exactly one retry on remount.
    expect(completionCalls()).toHaveLength(2);
  });

  describe("when device storage cannot be written", () => {
    const PENDING_KEY = "fairplayr.pendingMatchCompletions.v1";

    function failStorageWrites(shouldFail: (key: string) => boolean) {
      const original = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage,
        key: string,
        value: string
      ) {
        if (shouldFail(key)) {
          throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        }

        original.call(this, key, value);
      });
    }

    it("warns that the result is not saved instead of reporting it as queued", async () => {
      failStorageWrites((key) => key === PENDING_KEY);
      renderManager();
      setOnline(false);

      startAndScoreAndEnd();

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(en.matchLive.pendingSync.notSavedTitle);
      expect(alert.textContent).toContain(en.matchLive.pendingSync.notSavedDescriptionOffline);
      expect(screen.queryByText(en.matchLive.pendingSync.title)).toBeNull();
      expect(screen.queryByText(en.matchLive.pendingSync.descriptionOffline)).toBeNull();
      expect(getPendingMatchCompletion("match-1")).toBeNull();
    });

    it("keeps the final state in memory and sends it when connectivity returns", async () => {
      failStorageWrites((key) => key === PENDING_KEY);
      renderManager();
      setOnline(false);
      startAndScoreAndEnd();
      await screen.findByRole("alert");

      setOnline(true);

      expect(await screen.findByText(en.matchLive.pendingSync.syncedTitle)).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(routerPush).not.toHaveBeenCalled();

      const [, init] = completionCalls().at(-1)!;
      const sent = JSON.parse(init.body as string) as {
        scoreFor: number;
        scoreAgainst: number;
        runtimeState: { status: string; events: { type: string }[] };
      };
      expect(sent).toMatchObject({ status: "completed", scoreFor: 1, scoreAgainst: 1 });
      expect(sent.runtimeState.status).toBe("ended");
      expect(sent.runtimeState.events.filter((event) => event.type === "goal")).toHaveLength(2);
    });

    it("lets the coach retry manually from memory after a server error", async () => {
      failStorageWrites((key) => key === PENDING_KEY);
      respondToCompletion = () => Promise.resolve(new Response(null, { status: 503 }));
      renderManager();
      startAndScoreAndEnd();

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(en.matchLive.pendingSync.notSavedDescriptionOnline);

      respondToCompletion = () => Promise.resolve(new Response(null, { status: 204 }));
      fireEvent.click(screen.getByRole("button", { name: en.matchLive.pendingSync.retry }));

      expect(await screen.findByText(en.matchLive.pendingSync.syncedTitle)).toBeTruthy();
      expect(completionCalls()).toHaveLength(2);
      expect(routerPush).not.toHaveBeenCalled();
    });

    it("asks before the page is unloaded while the result only exists in memory", async () => {
      failStorageWrites((key) => key === PENDING_KEY);
      renderManager();
      setOnline(false);
      startAndScoreAndEnd();
      await screen.findByRole("alert");

      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it("does not crash or lose the match when every storage write fails", async () => {
      renderManager();
      setOnline(false);
      fireEvent.click(screen.getByRole("button", { name: en.matchLive.actions.start }));
      fireEvent.click(screen.getByRole("button", { name: en.matchLive.score.increaseTeam }));

      failStorageWrites(() => true);
      fireEvent.click(screen.getByRole("button", { name: en.matchLive.actions.end }));

      expect(await screen.findByRole("alert")).toBeTruthy();

      vi.mocked(Storage.prototype.setItem).mockRestore();
      setOnline(true);

      fireEvent.click(
        await screen.findByRole("button", { name: en.matchLive.endingSequence.goToReport })
      );
      expect(routerPush).toHaveBeenCalledWith("/match/match-1");
      const [, init] = completionCalls().at(-1)!;
      expect(JSON.parse(init.body as string)).toMatchObject({ scoreFor: 1, scoreAgainst: 0 });
    });
  });

  it("keeps match A's pending completion intact after match B is started and ended", async () => {
    // Match A ends offline.
    const matchA = renderManager();
    setOnline(false);
    startAndScoreAndEnd();
    await screen.findByText(en.matchLive.pendingSync.title);
    const pendingA = getPendingMatchCompletion("match-1");
    expect(pendingA).not.toBeNull();
    matchA.unmount();

    // Match B is set up and started the way MatchSetupManager does it.
    clearStoredLiveMatch();
    activateMatch({ ...SETUP, id: "setup-2" }, "match-2");
    searchParams = new URLSearchParams("matchId=match-2");
    online = true;

    renderManager();
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.actions.start }));
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.score.increaseTeam }));
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.score.increaseTeam }));
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.actions.end }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/match-2"), { timeout: 2500 });

    // B completed with its own result; A's pending record is untouched.
    const [urlB, initB] = completionCalls().at(-1)!;
    expect(urlB).toBe("/api/matches/match-2");
    expect(JSON.parse(initB.body as string)).toMatchObject({ scoreFor: 2, scoreAgainst: 0 });
    expect(getPendingMatchCompletion("match-2")).toBeNull();
    expect(getPendingMatchCompletion("match-1")).toEqual(pendingA);
    expect(
      getPendingMatchCompletion("match-1")?.body.runtimeState?.events.filter((event) => event.type === "goal")
    ).toHaveLength(2);
  });

  it("opens the report automatically after an online end the server confirmed", async () => {
    renderManager();
    startAndScoreAndEnd();

    expect(await screen.findByText(en.matchLive.endingSequence.done)).toBeTruthy();
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/match-1"), { timeout: 2500 });
    expect(completionCalls()[0]?.[0]).toBe("/api/matches/match-1");
  });

  it("stays on the page if the connection drops before the report navigation", async () => {
    renderManager();
    startAndScoreAndEnd();
    await screen.findByText(en.matchLive.endingSequence.done);

    setOnline(false);
    await waitForTimerWindow();

    expect(routerPush).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(en.matchLive.endingSequence.done)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: en.matchLive.endingSequence.goToReport }));
    expect(routerPush).toHaveBeenCalledWith("/match/match-1");
  });

  describe("server-backed match restored without a URL match id", () => {
    beforeEach(() => {
      // Started via /match/setup?matchId=match-1, then reopened from
      // /match/live while offline: the provider could not reach the server.
      window.localStorage.clear();
      activateMatch(SETUP, "match-1");
      searchParams = new URLSearchParams();
      ACTIVE_MATCH.activeMatch = null;
    });

    it("keeps the completion pending for the stored server match and does not navigate", async () => {
      renderManager();
      setOnline(false);
      startAndScoreAndEnd();

      expect(await screen.findByText(en.matchLive.pendingSync.title)).toBeTruthy();
      await waitForTimerWindow();
      expect(routerPush).not.toHaveBeenCalled();
      expect(screen.queryByText(en.matchLive.endedLocally.saved)).toBeNull();
      expect(getPendingMatchCompletion("match-1")?.body).toMatchObject({ scoreFor: 1, scoreAgainst: 1 });
    });

    it("syncs to the correct server record after reconnecting, even after a reload", async () => {
      const first = renderManager();
      setOnline(false);
      startAndScoreAndEnd();
      await screen.findByText(en.matchLive.pendingSync.title);
      first.unmount();

      renderManager();
      expect(await screen.findByText(en.matchLive.pendingSync.title)).toBeTruthy();
      setOnline(true);

      expect(await screen.findByText(en.matchLive.pendingSync.syncedTitle)).toBeTruthy();
      expect(getPendingMatchCompletion("match-1")).toBeNull();
      const [url, init] = completionCalls().at(-1)!;
      expect(url).toBe("/api/matches/match-1");
      expect(JSON.parse(init.body as string)).toMatchObject({ scoreFor: 1, scoreAgainst: 1 });
      expect(routerPush).not.toHaveBeenCalled();
    });

    it("sends the completion to the match the local state belongs to, not a different URL match", async () => {
      searchParams = new URLSearchParams("matchId=match-2");
      renderManager();
      startAndScoreAndEnd();

      await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/match-1"), { timeout: 2500 });
      expect(completionCalls().map(([url]) => url)).toEqual(["/api/matches/match-1"]);
    });
  });

  describe("local-only match open while another server match is referenced", () => {
    beforeEach(() => {
      // A signed-in coach runs a local-only match (no server record) while
      // the URL and the active match provider point at an unrelated match.
      window.localStorage.clear();
      activateMatch(SETUP, null);
      searchParams = new URLSearchParams("matchId=match-9");
      ACTIVE_MATCH.activeMatch = { ...SERVER_ACTIVE_MATCH, id: "match-9" };
    });

    function apiCallsFor(matchId: string) {
      return fetchMock.mock.calls.filter(([url]) => String(url).includes(matchId));
    }

    it("never sends its result to the URL's or the provider's match when ended online", async () => {
      renderManager();
      startAndScoreAndEnd();

      expect(await screen.findByText(en.matchLive.endedLocally.saved)).toBeTruthy();
      await waitForTimerWindow();
      expect(completionCalls()).toHaveLength(0);
      expect(apiCallsFor("match-9")).toHaveLength(0);
      expect(getPendingMatchCompletion("match-9")).toBeNull();
      expect(routerPush).not.toHaveBeenCalled();
    });

    it("never queues or syncs a completion for that match after ending offline", async () => {
      const first = renderManager();
      setOnline(false);
      startAndScoreAndEnd();
      expect(await screen.findByText(en.matchLive.endedLocally.saved)).toBeTruthy();
      first.unmount();

      renderManager();
      setOnline(true);
      await waitForTimerWindow();

      expect(completionCalls()).toHaveLength(0);
      expect(apiCallsFor("match-9")).toHaveLength(0);
      expect(getPendingMatchCompletion("match-9")).toBeNull();
    });
  });

  describe("setup stored before the server match id was recorded", () => {
    function storeLegacySetup() {
      window.localStorage.clear();
      window.localStorage.setItem(
        "fairplayr.matchSetup.v1",
        JSON.stringify({ version: 2, config: SETUP, status: "active" })
      );
    }

    it("does not guess the server match from the URL or an unrelated provider match", async () => {
      storeLegacySetup();
      searchParams = new URLSearchParams("matchId=match-9");
      ACTIVE_MATCH.activeMatch = {
        ...SERVER_ACTIVE_MATCH,
        id: "match-9",
        runtimeState: { setupId: "setup-other" },
      };
      renderManager();
      startAndScoreAndEnd();

      expect(await screen.findByText(en.matchLive.endedLocally.saved)).toBeTruthy();
      await waitForTimerWindow();
      expect(completionCalls()).toHaveLength(0);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("match-9"))).toBe(false);
    });

    it("keeps completing to the provider's match when its runtime state names this setup", async () => {
      storeLegacySetup();
      searchParams = new URLSearchParams();
      ACTIVE_MATCH.activeMatch = { ...SERVER_ACTIVE_MATCH, runtimeState: { setupId: SETUP.id } };
      renderManager();
      startAndScoreAndEnd();

      await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/match-1"), { timeout: 2500 });
      expect(completionCalls().map(([url]) => url)).toEqual(["/api/matches/match-1"]);
    });
  });

  describe("guest user with a local team (new match through Kamper)", () => {
    beforeEach(() => {
      // Kamper → /match/setup → Start: no server match, setup activated
      // without a server id, then /match/live without ?matchId. The active
      // match provider resolved before the setup existed.
      window.localStorage.clear();
      AUTH.status = "unauthenticated";
      ACTIVE_MATCH.activeMatch = null;
      searchParams = new URLSearchParams();
      activateMatch(SETUP);
    });

    it("ends offline on the page with a persistent saved state and no navigation", async () => {
      const first = renderManager();
      setOnline(false);
      startAndScoreAndEnd();

      const card = (await screen.findByText(en.matchLive.endedLocally.saved)).closest("[role=status]");
      expect(card?.textContent).toContain(en.matchLive.endedLocally.title);
      expect(screen.queryByText(en.matchLive.endingSequence.title)).toBeNull();
      await waitForTimerWindow();
      expect(routerPush).not.toHaveBeenCalled();
      expect(completionCalls()).toHaveLength(0);
      expect(screen.queryByRole("link", { name: en.matchLive.endedLocally.historyCta })).toBeNull();

      // Score, events and playtime survive on the device.
      const stored = getStoredLiveMatch();
      expect(stored?.status).toBe("ended");
      expect(stored?.teamScore).toBe(1);
      expect(stored?.opponentScore).toBe(1);
      expect(stored?.events.filter((event) => event.type === "goal")).toHaveLength(2);
      expect(stored?.endedAt).not.toBeNull();
      expect(stored?.playerAccumulatedMs).toHaveProperty("p1");

      // Still shown as ended after the app is reopened.
      first.unmount();
      renderManager();
      expect(await screen.findByText(en.matchLive.endedLocally.saved)).toBeTruthy();
      expect(routerPush).not.toHaveBeenCalled();
    });

    it("never sends the local setup id to the API when it is in the URL", async () => {
      searchParams = new URLSearchParams(`matchId=${SETUP.id}`);
      ACTIVE_MATCH.activeMatch = { id: SETUP.id, teamId: "team-1", title: "Live match", status: "live" };
      renderManager();
      setOnline(false);
      startAndScoreAndEnd();

      expect(await screen.findByText(en.matchLive.endedLocally.saved)).toBeTruthy();
      setOnline(true);
      await waitForTimerWindow();

      expect(fetchMock.mock.calls.some(([url]) => String(url).includes(SETUP.id))).toBe(false);
      expect(getPendingMatchCompletion(SETUP.id)).toBeNull();
      expect(routerPush).not.toHaveBeenCalled();
    });

    it("does not navigate automatically when ended online either", async () => {
      renderManager();
      startAndScoreAndEnd();

      expect(await screen.findByText(en.matchLive.endedLocally.saved)).toBeTruthy();
      await waitForTimerWindow();
      expect(routerPush).not.toHaveBeenCalled();
      expect(screen.getByRole("link", { name: en.matchLive.endedLocally.historyCta })).toBeTruthy();
    });

    it("does not claim the match was saved when the device storage write fails", async () => {
      renderManager();
      setOnline(false);
      fireEvent.click(screen.getByRole("button", { name: en.matchLive.actions.start }));
      fireEvent.click(screen.getByRole("button", { name: en.matchLive.score.increaseTeam }));

      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      });
      fireEvent.click(screen.getByRole("button", { name: en.matchLive.actions.end }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(en.matchLive.endedLocally.title);
      expect(alert.textContent).toContain(en.matchLive.endedLocally.notSaved);
      expect(screen.queryByText(en.matchLive.endedLocally.saved)).toBeNull();
      expect(routerPush).not.toHaveBeenCalled();

      // The in-memory result is still on screen and protected from unload.
      expect(screen.getAllByText("1").length).toBeGreaterThan(0);
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe("half transitions in the live view", () => {
    const actions = en.matchLive.actions;
    const MIN = 60_000;
    let now: number;

    beforeEach(() => {
      now = 1_000_000;
      vi.spyOn(Date, "now").mockImplementation(() => now);
    });

    const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
    const advance = (minutes: number) => {
      now += minutes * MIN;
    };

    it("plays first half → half-time → second half → full time offline and persists each step", async () => {
      renderManager();
      setOnline(false);

      click(actions.start);
      advance(15);
      click(actions.endHalf);
      expect(getStoredLiveMatch()).toMatchObject({ phase: "half_time", status: "paused" });
      expect(screen.getByText(en.matchLive.phase.halfTime)).toBeTruthy();

      advance(10); // the break does not count
      click(actions.startSecondHalf);
      expect(getStoredLiveMatch()).toMatchObject({ phase: "second_half", currentHalf: 2, status: "running" });
      expect(screen.getByText(en.matchLive.phase.secondHalf)).toBeTruthy();

      // Pause and resume within the second half.
      advance(5);
      click(actions.pause);
      expect(getStoredLiveMatch()).toMatchObject({ phase: "second_half", status: "paused" });
      advance(2);
      click(actions.resume);
      expect(getStoredLiveMatch()).toMatchObject({ phase: "second_half", status: "running" });

      // The referee's final whistle, here in stoppage: ending the last half
      // goes through the confirmed end flow and queues the completion.
      advance(12);
      click(actions.endHalf);
      expect(window.confirm).toHaveBeenCalledWith(actions.confirmEnd);
      expect(await screen.findByText(en.matchLive.pendingSync.title)).toBeTruthy();

      const stored = getStoredLiveMatch();
      expect(stored).toMatchObject({ status: "ended", phase: "full_time", currentHalf: 2 });
      expect(getPlayerAccumulatedSeconds(stored!, "p1", now + 30 * MIN)).toBe(32 * 60);
      expect(stored?.events.filter((event) => event.type === "match_ended")).toHaveLength(1);
      expect(getPendingMatchCompletion("match-1")?.body.runtimeState).toMatchObject({ phase: "full_time" });
      expect(screen.getByText(en.matchLive.pendingSync.descriptionOffline)).toBeTruthy();
    });

    it("keeps the match running when the final-whistle confirmation is declined", () => {
      renderManager();
      click(actions.start);
      click(actions.endHalf);
      click(actions.startSecondHalf);

      vi.mocked(window.confirm).mockReturnValueOnce(false);
      click(actions.endHalf);
      expect(getStoredLiveMatch()).toMatchObject({ phase: "second_half", status: "running" });
    });

    it("pauses and resumes in the first half without leaving it", () => {
      renderManager();
      click(actions.start);
      advance(4);
      click(actions.pause);
      expect(getStoredLiveMatch()).toMatchObject({ phase: "first_half", status: "paused" });
      advance(3);
      click(actions.resume);
      advance(1);
      expect(getStoredLiveMatch()).toMatchObject({ phase: "first_half", currentHalf: 1, status: "running" });
      click(actions.endHalf);
      expect(getStoredLiveMatch()?.phaseStartedAtElapsedMs).toBe(5 * MIN);
    });

    it("restores the second half after a reload while offline", () => {
      renderManager();
      setOnline(false);
      click(actions.start);
      advance(15);
      click(actions.endHalf);
      click(actions.startSecondHalf);
      advance(3);

      cleanup();
      renderManager();

      expect(getStoredLiveMatch()).toMatchObject({ phase: "second_half", currentHalf: 2, status: "running" });
      expect(screen.getByText(en.matchLive.phase.secondHalf)).toBeTruthy();
      expect(screen.getByRole("button", { name: actions.pause })).toBeTruthy();
    });

    it("runs a single-period match without half-time", async () => {
      activateMatch(
        {
          ...SETUP,
          duration: { mode: "custom", presetId: null, halves: 1, minutesPerHalf: 20, totalMinutes: 20 },
        },
        "match-1"
      );
      renderManager();
      setOnline(false);

      click(actions.start);
      expect(screen.queryByRole("button", { name: actions.endHalf })).toBeNull();
      advance(8);
      click(actions.pause);
      click(actions.resume);
      expect(getStoredLiveMatch()).toMatchObject({ phase: "first_half", status: "running" });

      advance(14);
      click(actions.end);
      expect(await screen.findByText(en.matchLive.pendingSync.title)).toBeTruthy();
      expect(getStoredLiveMatch()).toMatchObject({ status: "ended", phase: "full_time", currentHalf: 1 });
      expect(getPlayerAccumulatedSeconds(getStoredLiveMatch()!, "p1", now + 30 * MIN)).toBe(22 * 60);
    });
  });

  describe("Modern Sideline view (NEXT_PUBLIC_LIVE_UI=sideline)", () => {
    const sideline = en.matchLive.sideline;

    beforeEach(() => {
      FLAGS.sidelineLiveUi = true;
    });

    afterEach(() => {
      FLAGS.sidelineLiveUi = false;
    });

    const fieldToken = (playerId: string) =>
      document.querySelector<HTMLElement>(`[data-player-id="${playerId}"]`)!;
    const benchTile = (playerId: string) =>
      document.querySelector<HTMLElement>(`[data-bench-player-id="${playerId}"]`)!;


    it("is not rendered while the flag is off", () => {
      FLAGS.sidelineLiveUi = false;
      renderManager();
      expect(screen.queryByTestId("live-sideline")).toBeNull();
      expect(screen.getByRole("button", { name: en.matchLive.actions.start })).toBeTruthy();
    });

    it("drives kickoff, goals, a substitution with undo and the end flow through the existing handlers", async () => {
      renderManager();
      setOnline(false);
      expect(screen.getByTestId("live-sideline")).toBeTruthy();

      // Goal keys are real disabled buttons before kickoff.
      expect(screen.getByRole<HTMLButtonElement>("button", { name: sideline.goals.us }).disabled).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: sideline.strip.kickoff }));
      expect(getStoredLiveMatch()?.status).toBe("running");

      fireEvent.click(screen.getByRole("button", { name: sideline.goals.us }));
      fireEvent.click(screen.getByRole("button", { name: sideline.goals.them }));
      expect(screen.getByTestId("live-score").getAttribute("aria-label")).toBe("Score: us 1, them 1");

      // Field → bench tap swaps, exactly as in the existing view.
      fireEvent.click(fieldToken("p2"));
      expect(screen.getByTestId("live-strip").getAttribute("data-strip")).toBe("selection");
      fireEvent.click(benchTile("p6"));
      await waitFor(() => {
        expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p6");
      });
      expect(getStoredLiveMatch()?.onFieldPlayerIds).not.toContain("p2");
      expect(screen.getByTestId("live-strip").getAttribute("data-strip")).toBe("undo");

      fireEvent.click(screen.getByRole("button", { name: /Undo substitution/ }));
      await waitFor(() => {
        expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p2");
      });
      expect(getStoredLiveMatch()?.onFieldPlayerIds).not.toContain("p6");
      expect(getStoredLiveMatch()?.events.filter((event) => event.type === "substitution")).toHaveLength(0);

      // End match from the menu uses the existing confirmed end flow.
      fireEvent.click(screen.getByRole("button", { name: sideline.menu.open }));
      fireEvent.click(screen.getByRole("button", { name: sideline.menu.endMatch }));
      expect(window.confirm).toHaveBeenCalledWith(en.matchLive.actions.confirmEnd);

      expect(await screen.findByText(en.matchLive.pendingSync.title)).toBeTruthy();
      const stored = getStoredLiveMatch();
      expect(stored?.status).toBe("ended");
      expect(stored?.teamScore).toBe(1);
      expect(stored?.opponentScore).toBe(1);
      expect(stored?.events.filter((event) => event.type === "goal")).toHaveLength(2);
      expect(getPendingMatchCompletion("match-1")?.body).toMatchObject({ scoreFor: 1, scoreAgainst: 1 });
      expect(screen.getByTestId("live-strip").getAttribute("data-strip")).toBe("fullTime");
    });

    // FP-MS2.1-B1: position swaps by tap and by drag share one domain path.
    describe("position swap", () => {
      const strip = () => screen.getByTestId("live-strip").getAttribute("data-strip");
      const root = () => screen.getByTestId("live-sideline");
      /** Nothing in progress: the strip rests on idle or (until A2's threshold) a suggestion. */
      const expectResting = () => expect(["idle", "suggestion"]).toContain(strip());
      let now: number;
      const advance = (minutes: number) => {
        now += minutes * 60_000;
      };

      beforeEach(() => {
        now = 1_000_000;
        vi.spyOn(Date, "now").mockImplementation(() => now);
      });

      /** What a position swap may change (slots) and must not change (everything else). */
      const domainOf = () => ({ ...getStoredLiveMatch()!, updatedAt: null });

      function tapSwap(from: string, to: string) {
        fireEvent.click(fieldToken(from));
        fireEvent.click(screen.getByRole("button", { name: sideline.strip.swapPosition }));
        expect(strip()).toBe("positionSwap");
        fireEvent.click(fieldToken(to));
      }

      function dragSwap(from: string, to: string | null) {
        const target = to ? fieldToken(to) : null;
        const elementFromPoint = vi.fn(() => target ?? root());
        Object.defineProperty(document, "elementFromPoint", { value: elementFromPoint, configurable: true });
        fireEvent.pointerDown(fieldToken(from), { pointerId: 1, isPrimary: true, clientX: 100, clientY: 100 });
        fireEvent.pointerMove(root(), { pointerId: 1, clientX: 130, clientY: 150 });
        expect(strip()).toBe("draggingPosition");
        fireEvent.pointerUp(root(), { pointerId: 1, clientX: 130, clientY: 150 });
        // The browser's click after the release lands on the dragged token.
        fireEvent.click(fieldToken(from));
      }

      it("tap and drag produce identical state: slots exchanged, no substitution, minutes unchanged", async () => {
        renderManager();
        fireEvent.click(screen.getByRole("button", { name: sideline.strip.kickoff }));
        advance(6);
        const before = domainOf();

        tapSwap("p2", "p4");
        expect(strip()).toBe("positionUndo");
        await waitFor(() => expect(getStoredLiveMatch()?.liveSlotAssignments["5v5-2"]).toBe("p4"));
        const afterTap = domainOf();
        expect(afterTap.liveSlotAssignments).toEqual({ ...before.liveSlotAssignments, "5v5-2": "p4", "5v5-4": "p2" });
        expect({ ...afterTap, liveSlotAssignments: null }).toEqual({ ...before, liveSlotAssignments: null });

        fireEvent.click(screen.getByRole("button", { name: /Undo position swap/ }));
        await waitFor(() => expect(domainOf()).toEqual(before));

        dragSwap("p2", "p4");
        expect(strip()).toBe("positionUndo");
        // The release did not also select the dragged player.
        expect(fieldToken("p2").getAttribute("aria-pressed")).toBe("false");
        await waitFor(() => expect(domainOf()).toEqual(afterTap));
        expect(getStoredLiveMatch()?.events.some((event) => event.type === "substitution")).toBe(false);
      });

      it("a drag released off any player cancels without a change or a selection", () => {
        renderManager();
        fireEvent.click(screen.getByRole("button", { name: sideline.strip.kickoff }));
        const before = domainOf();

        dragSwap("p3", null);
        expectResting();
        expect(fieldToken("p3").getAttribute("aria-pressed")).toBe("false");
        expect(domainOf()).toEqual(before);

        // Released on a bench tile: not a substitution, not a swap.
        Object.defineProperty(document, "elementFromPoint", { value: () => benchTile("p6"), configurable: true });
        fireEvent.pointerDown(fieldToken("p3"), { pointerId: 1, isPrimary: true, clientX: 100, clientY: 100 });
        fireEvent.pointerMove(root(), { pointerId: 1, clientX: 100, clientY: 300 });
        fireEvent.pointerUp(root(), { pointerId: 1, clientX: 100, clientY: 300 });
        expectResting();
        expect(domainOf()).toEqual(before);
      });

      it("swaps into the keeper slot and undoes only the swap, keeping a goal scored meanwhile", async () => {
        renderManager();
        fireEvent.click(screen.getByRole("button", { name: sideline.strip.kickoff }));
        expect(fieldToken("p1").getAttribute("aria-label")).toContain("keeper");

        tapSwap("p5", "p1");
        await waitFor(() => expect(getStoredLiveMatch()?.liveSlotAssignments["5v5-1"]).toBe("p5"));
        expect(fieldToken("p5").getAttribute("aria-label")).toContain("keeper");
        expect(fieldToken("p1").getAttribute("aria-label")).not.toContain("keeper");

        fireEvent.click(screen.getByRole("button", { name: sideline.goals.us }));
        fireEvent.click(screen.getByRole("button", { name: /Undo position swap/ }));
        await waitFor(() => expect(getStoredLiveMatch()?.liveSlotAssignments["5v5-1"]).toBe("p1"));
        expect(getStoredLiveMatch()?.teamScore).toBe(1);
        expect(getStoredLiveMatch()?.events.filter((event) => event.type === "goal")).toHaveLength(1);
      });

      it("offers Bytt plass with a labelled ✕ that cancels the selection", () => {
        renderManager();
        fireEvent.click(screen.getByRole("button", { name: sideline.strip.kickoff }));
        const before = domainOf();

        fireEvent.click(fieldToken("p3"));
        expect(strip()).toBe("selection");
        expect(screen.getByRole("button", { name: sideline.strip.swapPosition })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /^Cancel selecting \S/ }));
        expectResting();
        expect(fieldToken("p3").getAttribute("aria-pressed")).toBe("false");
        expect(domainOf()).toEqual(before);
      });

      it("keeps bench substitutions working by tap after a swap", async () => {
        renderManager();
        fireEvent.click(screen.getByRole("button", { name: sideline.strip.kickoff }));
        tapSwap("p2", "p3");
        fireEvent.click(screen.getByRole("button", { name: /Undo position swap/ }));
        expectResting();

        fireEvent.click(fieldToken("p2"));
        fireEvent.click(benchTile("p6"));
        await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p6"));
        expect(strip()).toBe("undo");
        expect(getStoredLiveMatch()?.events.filter((event) => event.type === "substitution")).toHaveLength(1);
      });
    });

    // FP-MS2.1-B1-F1: substitution undo reverses only the substitution.
    describe("substitution undo", () => {
      const strip = () => screen.getByTestId("live-strip").getAttribute("data-strip");
      const undoSubstitution = () => fireEvent.click(screen.getByRole("button", { name: /Undo substitution/ }));
      let now: number;
      const advanceMs = (ms: number) => {
        now += ms;
      };

      beforeEach(() => {
        now = 1_000_000;
        vi.spyOn(Date, "now").mockImplementation(() => now);
        if (typeof HTMLElement.prototype.setPointerCapture !== "function") {
          Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { value: () => {}, configurable: true });
        }
      });

      function tapSubstitution(out: string, incoming: string) {
        fireEvent.click(fieldToken(out));
        fireEvent.click(benchTile(incoming));
      }

      function dragSubstitution(out: string, incoming: string) {
        Object.defineProperty(document, "elementFromPoint", { value: () => fieldToken(out), configurable: true });
        const surface = screen.getByTestId("live-sideline");
        fireEvent.pointerDown(benchTile(incoming), { pointerId: 2, isPrimary: true, clientX: 50, clientY: 600 });
        fireEvent.pointerMove(surface, { pointerId: 2, clientX: 80, clientY: 300 });
        fireEvent.pointerUp(surface, { pointerId: 2, clientX: 80, clientY: 300 });
      }

      /** Kick off, play 6 minutes and substitute p2 → p6 by tap or drag. */
      async function kickoffAndSubstitute(how: "tap" | "drag") {
        renderManager();
        fireEvent.click(screen.getByRole("button", { name: sideline.strip.kickoff }));
        advanceMs(6 * 60_000);
        const before = getStoredLiveMatch()!;
        if (how === "tap") tapSubstitution("p2", "p6");
        else dragSubstitution("p2", "p6");
        await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p6"));
        expect(strip()).toBe("undo");
        return before;
      }

      const lineupOf = (state: ReturnType<typeof getStoredLiveMatch>) => ({
        onFieldPlayerIds: state!.onFieldPlayerIds,
        benchPlayerIds: state!.benchPlayerIds,
        liveSlotAssignments: state!.liveSlotAssignments,
        playerAccumulatedMs: state!.playerAccumulatedMs,
        onFieldStartedAtElapsedMs: state!.onFieldStartedAtElapsedMs,
      });

      it.each(["tap", "drag"] as const)("%s substitution then undo restores the lineup and minutes", async (how) => {
        const before = await kickoffAndSubstitute(how);
        advanceMs(3_000);
        undoSubstitution();

        await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p2"));
        const after = getStoredLiveMatch()!;
        expect(lineupOf(after)).toEqual(lineupOf(before));
        expect(after.events.some((event) => event.type === "substitution")).toBe(false);
        // p2 played on through the window; p6 never came on.
        expect(getPlayerAccumulatedSeconds(after, "p2", now)).toBe(6 * 60 + 3);
        expect(getPlayerAccumulatedSeconds(after, "p6", now)).toBe(0);
        expect(["idle", "suggestion"]).toContain(strip());
      });

      it("keeps a goal scored inside the window", async () => {
        const before = await kickoffAndSubstitute("tap");
        fireEvent.click(screen.getByRole("button", { name: sideline.goals.us }));
        await waitFor(() => expect(getStoredLiveMatch()?.teamScore).toBe(1));
        // A goal does not close the undo window.
        expect(strip()).toBe("undo");

        undoSubstitution();

        await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toEqual(before.onFieldPlayerIds));
        const after = getStoredLiveMatch()!;
        expect(after.benchPlayerIds).toEqual(before.benchPlayerIds);
        expect(after.liveSlotAssignments).toEqual(before.liveSlotAssignments);
        expect(after.teamScore).toBe(1);
        expect(after.events.filter((event) => event.type === "goal")).toHaveLength(1);
        expect(after.events.some((event) => event.type === "substitution")).toBe(false);
        expect(screen.getByTestId("live-score").getAttribute("aria-label")).toBe("Score: us 1, them 0");
      });

      it("keeps a pause made inside the window", async () => {
        const before = await kickoffAndSubstitute("tap");
        advanceMs(2_000);
        fireEvent.click(screen.getByTestId("live-clock"));
        expect(getStoredLiveMatch()?.status).toBe("paused");
        const pausedClock = getStoredLiveMatch()!.clock;

        undoSubstitution();

        await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toEqual(before.onFieldPlayerIds));
        const after = getStoredLiveMatch()!;
        expect(after.status).toBe("paused");
        expect(after.clock).toEqual(pausedClock);
        advanceMs(10 * 60_000);
        expect(getPlayerAccumulatedSeconds(after, "p2", now)).toBe(6 * 60 + 2);
        expect(getPlayerAccumulatedSeconds(after, "p6", now)).toBe(0);
      });

      it("keeps half-time ended inside the window", async () => {
        const before = await kickoffAndSubstitute("tap");
        fireEvent.click(screen.getByRole("button", { name: sideline.menu.open }));
        fireEvent.click(screen.getByRole("button", { name: sideline.menu.endHalf }));
        fireEvent.click(screen.getByRole("button", { name: sideline.confirm.endHalfConfirm }));
        expect(getStoredLiveMatch()?.phase).toBe("half_time");

        undoSubstitution();

        await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toEqual(before.onFieldPlayerIds));
        expect(getStoredLiveMatch()).toMatchObject({ phase: "half_time", status: "paused", currentHalf: 1 });
      });

      it("rejects undo once the five seconds have passed, even before the timer fires", async () => {
        await kickoffAndSubstitute("tap");
        const committed = getStoredLiveMatch()!;
        advanceMs(5_000);

        undoSubstitution();

        expect(["idle", "suggestion"]).toContain(strip());
        expect(lineupOf(getStoredLiveMatch())).toEqual(lineupOf(committed));
        expect(getStoredLiveMatch()?.events.filter((event) => event.type === "substitution")).toHaveLength(1);
      });

      it("a new substitution after an undo works and can be undone", async () => {
        const before = await kickoffAndSubstitute("tap");
        undoSubstitution();
        await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p2"));

        tapSubstitution("p3", "p7");
        await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p7"));
        expect(strip()).toBe("undo");
        expect(getStoredLiveMatch()?.events.filter((event) => event.type === "substitution")).toHaveLength(1);

        undoSubstitution();
        await waitFor(() => expect(lineupOf(getStoredLiveMatch())).toEqual(lineupOf(before)));
      });

      it("works offline and the runtime state sent afterwards has the goal but not the substitution", async () => {
        renderManager();
        fireEvent.click(screen.getByRole("button", { name: sideline.strip.kickoff }));
        setOnline(false);
        advanceMs(60_000);
        tapSubstitution("p2", "p6");
        fireEvent.click(screen.getByRole("button", { name: sideline.goals.us }));
        undoSubstitution();

        await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p2"));
        expect(getStoredLiveMatch()?.teamScore).toBe(1);
        expect(getStoredLiveMatch()?.events.some((event) => event.type === "substitution")).toBe(false);

        // Back online, the next change carries the whole state. No call ever
        // created or targets a separate server row for the substitution.
        setOnline(true);
        fetchMock.mockClear();
        fireEvent.click(screen.getByRole("button", { name: sideline.goals.them }));
        await waitFor(
          () => {
            const patch = fetchMock.mock.calls.find(
              ([url, init]) => String(url) === "/api/matches/match-1" && init?.method === "PATCH"
            );
            expect(patch).toBeTruthy();
            const body = JSON.parse(patch![1]!.body as string) as {
              runtimeState: { events: { type: string }[]; onFieldPlayerIds: string[] };
              scoreFor: number;
            };
            expect(body.scoreFor).toBe(1);
            expect(body.runtimeState.onFieldPlayerIds).toContain("p2");
            expect(body.runtimeState.events.some((event) => event.type === "substitution")).toBe(false);
            expect(body.runtimeState.events.filter((event) => event.type === "goal")).toHaveLength(2);
          },
          { timeout: 2_000 }
        );
        const eventPosts = fetchMock.mock.calls
          .filter(([url]) => String(url).includes("/events"))
          .map(([, init]) => JSON.parse(init!.body as string) as { type: string });
        expect(eventPosts.every((event) => event.type === "goal_for" || event.type === "goal_against")).toBe(true);
      });

      // FP-MS2.1-B3 (D3): consecutive substitutions without waiting.
      describe("consecutive substitutions inside the undo window", () => {
        const substitutionEvents = () =>
          getStoredLiveMatch()!.events.filter((event) => event.type === "substitution") as Array<{
            type: "substitution";
            inPlayerId: string;
            outPlayerId: string;
          }>;
        const pairs = () => substitutionEvents().map((event) => `${event.outPlayerId}>${event.inPlayerId}`);

        function substitute(how: "tap" | "drag", out: string, incoming: string) {
          if (how === "tap") tapSubstitution(out, incoming);
          else dragSubstitution(out, incoming);
        }

        it.each([
          ["tap", "tap"],
          ["drag", "drag"],
          ["tap", "drag"],
          ["drag", "tap"],
        ] as const)("%s then immediate %s: both recorded, the second has its own undo", async (first, second) => {
          const before = await kickoffAndSubstitute(first);
          advanceMs(1_000);
          substitute(second, "p3", "p7");

          await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p7"));
          const after = getStoredLiveMatch()!;
          expect(after.onFieldPlayerIds).toEqual(["p1", "p6", "p7", "p4", "p5"]);
          expect(after.benchPlayerIds).toEqual(expect.arrayContaining(["p2", "p3"]));
          expect(after.liveSlotAssignments).toMatchObject({ "5v5-2": "p6", "5v5-3": "p7" });
          expect(pairs()).toEqual(["p2>p6", "p3>p7"]);
          expect(strip()).toBe("undo");
          expect(before.events.some((event) => event.type === "substitution")).toBe(false);
        });

        it("a new selection immediately leaves the old undo state", async () => {
          await kickoffAndSubstitute("tap");
          fireEvent.click(fieldToken("p3"));
          expect(strip()).toBe("selection");
          expect(screen.queryByRole("button", { name: /Undo substitution/ })).toBeNull();
          // The first substitution is kept.
          expect(pairs()).toEqual(["p2>p6"]);
        });

        it("undo after two substitutions reverses only the second and keeps the first event", async () => {
          await kickoffAndSubstitute("tap");
          const afterFirst = getStoredLiveMatch()!;
          advanceMs(2_000);
          tapSubstitution("p3", "p7");
          await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p7"));
          advanceMs(1_000);

          undoSubstitution();

          await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p3"));
          const after = getStoredLiveMatch()!;
          expect(lineupOf(after)).toEqual(lineupOf(afterFirst));
          expect(pairs()).toEqual(["p2>p6"]);
          expect(["idle", "suggestion"]).toContain(strip());
          // There is nothing older to undo.
          expect(screen.queryByRole("button", { name: /Undo substitution/ })).toBeNull();
        });

        it("a goal registered between the substitutions survives undoing the second", async () => {
          await kickoffAndSubstitute("tap");
          fireEvent.click(screen.getByRole("button", { name: sideline.goals.us }));
          await waitFor(() => expect(getStoredLiveMatch()?.teamScore).toBe(1));
          tapSubstitution("p3", "p7");
          await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p7"));
          fireEvent.click(screen.getByRole("button", { name: sideline.goals.them }));
          await waitFor(() => expect(getStoredLiveMatch()?.opponentScore).toBe(1));

          undoSubstitution();

          await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p3"));
          const after = getStoredLiveMatch()!;
          expect(after.teamScore).toBe(1);
          expect(after.opponentScore).toBe(1);
          expect(after.events.filter((event) => event.type === "goal")).toHaveLength(2);
          expect(pairs()).toEqual(["p2>p6"]);
          expect(screen.getByTestId("live-score").getAttribute("aria-label")).toBe("Score: us 1, them 1");
        });

        it("keeps clock and playing minutes exact across two quick substitutions", async () => {
          await kickoffAndSubstitute("tap"); // p2 → p6 at 6:00
          advanceMs(2_000);
          tapSubstitution("p3", "p7"); // p3 → p7 at 6:02
          await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p7"));
          advanceMs(65_000); // well past the window's deadline

          const match = getStoredLiveMatch()!;
          const at = 6 * 60 + 2 + 65; // match seconds
          expect(getElapsedMs(match, now)).toBe(at * 1000);
          expect(getPlayerAccumulatedSeconds(match, "p2", now)).toBe(6 * 60);
          expect(getPlayerAccumulatedSeconds(match, "p3", now)).toBe(6 * 60 + 2);
          expect(getPlayerAccumulatedSeconds(match, "p6", now)).toBe(at - 6 * 60);
          expect(getPlayerAccumulatedSeconds(match, "p7", now)).toBe(at - (6 * 60 + 2));
          expect(getPlayerAccumulatedSeconds(match, "p1", now)).toBe(at);
          expect(pairs()).toEqual(["p2>p6", "p3>p7"]);
        });

        it("works offline", async () => {
          renderManager();
          setOnline(false);
          fireEvent.click(screen.getByRole("button", { name: sideline.strip.kickoff }));
          advanceMs(60_000);
          tapSubstitution("p2", "p6");
          dragSubstitution("p3", "p7");
          await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p7"));
          expect(pairs()).toEqual(["p2>p6", "p3>p7"]);
          undoSubstitution();
          await waitFor(() => expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p3"));
          expect(pairs()).toEqual(["p2>p6"]);
          expect(getStoredLiveMatch()?.onFieldPlayerIds).toContain("p6");
        });
      });
    });

    it("ends the half only after an explicit confirmation", () => {
      renderManager();
      fireEvent.click(screen.getByRole("button", { name: sideline.strip.kickoff }));

      fireEvent.click(screen.getByRole("button", { name: sideline.menu.open }));
      fireEvent.click(screen.getByRole("button", { name: sideline.menu.endHalf }));
      expect(screen.getByRole("dialog", { name: sideline.confirm.endHalfTitle })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: sideline.confirm.keepPlaying }));
      expect(getStoredLiveMatch()?.phase).toBe("first_half");

      fireEvent.click(screen.getByRole("button", { name: sideline.menu.open }));
      fireEvent.click(screen.getByRole("button", { name: sideline.menu.endHalf }));
      fireEvent.click(screen.getByRole("button", { name: sideline.confirm.endHalfConfirm }));
      expect(getStoredLiveMatch()?.phase).toBe("half_time");
      expect(screen.getByRole<HTMLButtonElement>("button", { name: sideline.goals.us }).disabled).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: sideline.strip.startSecondHalf }));
      expect(getStoredLiveMatch()?.status).toBe("running");
      // Goals stay available once play resumes, as in the existing view.
      expect(screen.getByRole<HTMLButtonElement>("button", { name: sideline.goals.us }).disabled).toBe(false);
    });

    // FP-MATCH-001: restarting the clock after half-time starts the second half.
    it("enters the second-half phase after half-time", () => {
      renderManager();
      fireEvent.click(screen.getByRole("button", { name: sideline.strip.kickoff }));
      fireEvent.click(screen.getByRole("button", { name: sideline.menu.open }));
      fireEvent.click(screen.getByRole("button", { name: sideline.menu.endHalf }));
      fireEvent.click(screen.getByRole("button", { name: sideline.confirm.endHalfConfirm }));
      fireEvent.click(screen.getByRole("button", { name: sideline.strip.startSecondHalf }));
      expect(getStoredLiveMatch()).toMatchObject({ phase: "second_half", currentHalf: 2, status: "running" });

      // The view reads the second half from the phase: it is labelled, goals
      // are live again and the strip no longer offers the second half.
      expect(screen.getByTestId("live-clock").textContent).toContain(sideline.phase.secondHalf);
      expect(screen.getByRole<HTMLButtonElement>("button", { name: sideline.goals.us }).disabled).toBe(false);
      expect(screen.getByTestId("live-strip").getAttribute("data-strip")).not.toBe("halfTime");

      // Pausing and resuming from the clock key stays in the second half.
      fireEvent.click(screen.getByTestId("live-clock"));
      expect(getStoredLiveMatch()).toMatchObject({ phase: "second_half", status: "paused" });
      expect(screen.getByTestId("live-clock").textContent).toContain(sideline.phase.secondHalf);
      expect(screen.getByRole<HTMLButtonElement>("button", { name: sideline.goals.us }).disabled).toBe(false);
      fireEvent.click(screen.getByTestId("live-clock"));
      expect(getStoredLiveMatch()).toMatchObject({ phase: "second_half", status: "running" });
    });

    it("removes the last goal through the existing correction after a confirmation", () => {
      renderManager();
      fireEvent.click(screen.getByRole("button", { name: sideline.strip.kickoff }));
      fireEvent.click(screen.getByRole("button", { name: sideline.goals.us }));
      expect(getStoredLiveMatch()?.teamScore).toBe(1);

      fireEvent.click(screen.getByRole("button", { name: sideline.menu.open }));
      fireEvent.click(screen.getByRole("button", { name: sideline.menu.removeGoalUs }));
      expect(screen.getByText("The score becomes 0–0.")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: sideline.confirm.removeGoalConfirm }));

      const stored = getStoredLiveMatch();
      expect(stored?.teamScore).toBe(0);
      expect(stored?.events.filter((event) => event.type === "goal")).toHaveLength(0);
    });

    it("pauses and resumes from the clock key", () => {
      renderManager();
      fireEvent.click(screen.getByRole("button", { name: sideline.strip.kickoff }));
      fireEvent.click(screen.getByTestId("live-clock"));
      expect(getStoredLiveMatch()?.status).toBe("paused");
      fireEvent.click(screen.getByTestId("live-clock"));
      expect(getStoredLiveMatch()?.status).toBe("running");
    });
  });
});
