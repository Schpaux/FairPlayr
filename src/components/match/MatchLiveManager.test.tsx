import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchLiveManager } from "@/components/match/MatchLiveManager";
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
const AUTH = { status: "authenticated" };

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

const ACTIVE_MATCH = {
  activeMatch: { id: "match-1", teamId: "team-1", title: "Match", status: "live" },
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
    activateMatch(SETUP);
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

  it("syncs the pending completion when connectivity returns and opens the report", async () => {
    renderManager();
    setOnline(false);
    startAndScoreAndEnd();
    await screen.findByText(en.matchLive.pendingSync.title);

    setOnline(true);

    await waitFor(() => {
      expect(getPendingMatchCompletion("match-1")).toBeNull();
    });
    expect(await screen.findByText(en.matchLive.endingSequence.done)).toBeTruthy();
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/match-1"), { timeout: 2500 });

    const [, init] = completionCalls().at(-1)!;
    expect(JSON.parse(init.body as string)).toMatchObject({
      status: "completed",
      scoreFor: 1,
      scoreAgainst: 1,
      runtimeState: { status: "ended" },
    });
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

      expect(await screen.findByText(en.matchLive.endingSequence.done)).toBeTruthy();
      await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/match-1"), { timeout: 2500 });

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

      expect(await screen.findByText(en.matchLive.endingSequence.done)).toBeTruthy();
      expect(completionCalls()).toHaveLength(2);
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

      await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/match-1"), { timeout: 2500 });
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
    activateMatch({ ...SETUP, id: "setup-2" });
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
});
