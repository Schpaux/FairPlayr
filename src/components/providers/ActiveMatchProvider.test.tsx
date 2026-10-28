// FP-P0-F2: which match the banner names, where it links, and what the
// provider's close actions may touch.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveMatchBanner } from "@/components/layout/ActiveMatchBanner";
import { ActiveMatchProvider, useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { createLiveMatchFromSetup, endLiveMatch, startLiveMatch } from "@/domain/liveMatch";
import { createMatchSetup } from "@/domain/match";
import { endLocalActiveMatch } from "@/lib/match/activeMatchRecovery";
import { submitMatchCompletion } from "@/lib/match/matchCompletion";
import { getStoredLiveMatch, saveStoredLiveMatch } from "@/lib/storage/liveMatchStorage";
import { activateMatch, endMatch, getStoredMatchSetup } from "@/lib/storage/matchStorage";
import { getPendingMatchCompletion } from "@/lib/storage/pendingMatchCompletionStorage";
import en from "../../../messages/en.json";

const AUTH = { status: "authenticated", user: { id: "user-1" } };
const WORKSPACE = { activeTeamId: "team-1" as string | null };
const NAV = { pathname: "/" };

vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => AUTH }));
vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({ useTeamWorkspace: () => WORKSPACE }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
  usePathname: () => NAV.pathname,
}));

type ServerRow = { id: string; title: string; teamId: string; status: string; runtimeState: Record<string, unknown> | null };

interface ServerState {
  activeMatch: ServerRow | null;
  online: boolean;
  /** When set, the answer to a match create (e.g. one still in flight). */
  createReply?: Promise<Response>;
}

let server: ServerState;
let fetchMock: ReturnType<typeof vi.fn>;

function row(id: string, status = "live", runtimeState: Record<string, unknown> | null = null): ServerRow {
  return { id, title: `Kamp ${id}`, teamId: "team-1", status, runtimeState };
}

function patches() {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
    .map(([input, init]) => ({ url: String(input), body: JSON.parse((init as RequestInit).body as string) as Record<string, unknown> }));
}

function setOnline(online: boolean) {
  server.online = online;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
}

function runOnDevice(serverMatchId: string | null = "match-A", startedMsAgo = 60_000) {
  const setup = createMatchSetup("team-1");
  activateMatch(setup, serverMatchId);
  saveStoredLiveMatch(startLiveMatch(createLiveMatchFromSetup(setup), Date.now() - startedMsAgo));
  return setup;
}

let actions: ReturnType<typeof useActiveMatch> | null = null;
function Probe() {
  const value = useActiveMatch();
  useEffect(() => {
    actions = value;
  });
  return null;
}

function renderShell() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ActiveMatchProvider>
        <ActiveMatchBanner />
        <Probe />
      </ActiveMatchProvider>
    </NextIntlClientProvider>
  );
}

function bannerLink(): HTMLAnchorElement | null {
  return document.querySelector("a.sticky");
}

beforeEach(() => {
  window.localStorage.clear();
  // Not Home: there the fixture panel shows this device's match (C2).
  NAV.pathname = "/team";
  WORKSPACE.activeTeamId = "team-1";
  server = { activeMatch: null, online: true };
  setOnline(true);
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (!server.online) {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    const url = String(input);
    if (init?.method === "POST" && url === "/api/matches") {
      return server.createReply ?? Promise.resolve(Response.json({ match: {} }, { status: 201 }));
    }
    if (init?.method === "PATCH") {
      const id = decodeURIComponent(url.split("/").pop() ?? "");
      if (server.activeMatch?.id === id) {
        server.activeMatch = null;
      }
      return Promise.resolve(Response.json({ match: { id, status: "completed" } }));
    }
    if (url.startsWith("/api/matches/active/resolve")) {
      return Promise.resolve(Response.json({ activeMatch: server.activeMatch, recoverableMatch: null }));
    }
    return Promise.resolve(Response.json({}, { status: 404 }));
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  actions = null;
  vi.unstubAllGlobals();
});

describe("active-match banner identity", () => {
  it("names and links the match this device runs, not another live server row", async () => {
    runOnDevice("match-A");
    server.activeMatch = row("match-B");
    renderShell();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(bannerLink()?.getAttribute("href")).toBe("/match/live?matchId=match-A"));
    expect(screen.getByText(en.activeMatchBanner.label)).toBeTruthy();
    expect(screen.queryByText("Kamp match-B")).toBeNull();
    expect(actions?.recoveryMatch?.id).toBe("match-B");
  });

  it("leaves this device's match to the fixture panel on Home", async () => {
    runOnDevice("match-A");
    NAV.pathname = "/play"; // APP_HOME_PATH (WEB-01d)
    renderShell();

    await waitFor(() => expect(actions?.activeMatch?.id).toBe("match-A"));
    expect(bannerLink()).toBeNull();
    expect(screen.queryByText(en.activeMatchBanner.label)).toBeNull();
  });

  it("uses the server title when the live row is this device's own match", async () => {
    runOnDevice("match-A");
    server.activeMatch = row("match-A", "live", { status: "running" });
    renderShell();

    await screen.findByText("Kamp match-A");
    expect(bannerLink()?.getAttribute("href")).toBe("/match/live?matchId=match-A");
  });

  it("shows a server-only live match as recovery, linking to its own page, never as in progress", async () => {
    server.activeMatch = row("match-B");
    renderShell();

    await screen.findByText(en.activeMatchBanner.recoveryLabel);
    expect(bannerLink()?.getAttribute("href")).toBe("/match/match-B");
    expect(screen.queryByText(en.activeMatchBanner.label)).toBeNull();
    expect(actions?.activeMatch).toBeNull();
  });

  it("hides the recovery banner on that match's own page", async () => {
    server.activeMatch = row("match-B");
    NAV.pathname = "/match/match-B";
    renderShell();

    await waitFor(() => expect(actions?.recoveryMatch?.id).toBe("match-B"));
    expect(bannerLink()).toBeNull();
  });

  it("shows nothing once the match is completed", async () => {
    const setup = runOnDevice("match-A");
    endMatch(setup);
    renderShell();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bannerLink()).toBeNull();
  });

  it("keeps showing this device's match after switching to another team", async () => {
    runOnDevice("match-A");
    const view = renderShell();
    await waitFor(() => expect(bannerLink()?.getAttribute("href")).toBe("/match/live?matchId=match-A"));

    WORKSPACE.activeTeamId = "team-2";
    view.rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <ActiveMatchProvider>
          <ActiveMatchBanner />
          <Probe />
        </ActiveMatchProvider>
      </NextIntlClientProvider>
    );

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("teamId=team-2"))).toBe(true)
    );
    expect(bannerLink()?.getAttribute("href")).toBe("/match/live?matchId=match-A");
  });
});

describe("recovery across team switch and reload", () => {
  it("team switch + reload: the banner keeps opening the device's running match; a stale match on the other team never replaces it", async () => {
    runOnDevice("match-A");
    const liveBefore = window.localStorage.getItem("fairplayr.liveMatch.v1");
    // Team 2 has a stale live row that no device runs.
    const staleB = { ...row("match-B", "live", { status: "running" }), teamId: "team-2" };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/matches/active/resolve")) {
        const teamId = new URL(url, "http://x").searchParams.get("teamId");
        return Promise.resolve(
          Response.json({ activeMatch: teamId === "team-2" ? server.activeMatch : null, recoverableMatch: null })
        );
      }
      return Promise.resolve(Response.json({}, { status: 404 }));
    });
    server.activeMatch = staleB;

    // Switch to team 2, then reload the app there.
    WORKSPACE.activeTeamId = "team-2";
    renderShell();
    await waitFor(() => expect(actions?.recoveryMatch?.id).toBe("match-B"));
    cleanup();
    renderShell();
    await waitFor(() => expect(actions?.recoveryMatch?.id).toBe("match-B"));

    // The device's own match stays the active one and the banner opens it.
    // B is finished from its own page (recoveryMatchHref); the "Finish" there
    // completes only B (MatchDetailsManager.lifecycle.test.tsx).
    expect(actions?.activeMatch?.id).toBe("match-A");
    expect(actions?.recoveryMatchHref).toBe("/match/match-B");
    expect(bannerLink()?.getAttribute("href")).toBe("/match/live?matchId=match-A");
    expect(patches()).toEqual([]);

    // B completed on the server; reload on team 2, then switch back to team 1.
    server.activeMatch = null;
    cleanup();
    renderShell();
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("teamId=team-2")).length).toBeGreaterThanOrEqual(3)
    );
    await waitFor(() => expect(actions?.recoveryMatch ?? null).toBeNull());
    cleanup();
    WORKSPACE.activeTeamId = "team-1";
    renderShell();
    await waitFor(() => expect(bannerLink()?.getAttribute("href")).toBe("/match/live?matchId=match-A"));
    expect(actions?.recoveryMatch ?? null).toBeNull();

    // Nothing stored on the device changed along the way.
    expect(window.localStorage.getItem("fairplayr.liveMatch.v1")).toBe(liveBefore);
    expect(getStoredMatchSetup()).toMatchObject({ status: "active", serverMatchId: "match-A" });
  });
});

describe("offline completion", () => {
  it("offline finish → reload → reconnect sends the completion exactly once and clears the banner", async () => {
    // Ended on the device while offline: the stale server row still says live.
    runOnDevice("match-A");
    server.activeMatch = row("match-A", "live", { status: "running" });
    setOnline(false);
    const ended = endLocalActiveMatch({ onlyServerMatchId: "match-A" });
    expect(await submitMatchCompletion(ended!.completion!.matchId, ended!.completion!.body, ended!.completion!.endedAt))
      .toEqual({ status: "offline", persisted: true });
    fetchMock.mockClear(); // count only what reaches the server from here on

    // "Reload" while still offline.
    renderShell();
    await act(() => Promise.resolve());
    expect(bannerLink()).toBeNull();
    expect(patches()).toEqual([]);

    // Connectivity returns.
    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toMatchObject({
      url: "/api/matches/match-A",
      body: { status: "completed", runtimeState: { status: "ended" } },
    });
    await waitFor(() => expect(getPendingMatchCompletion("match-A")).toBeNull());

    // A later reconnect has nothing left to send.
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await act(() => Promise.resolve());
    expect(patches()).toHaveLength(1);
    expect(bannerLink()).toBeNull();
  });
});

describe("offline completion keeps the coach's end time", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ended 18:30 offline, reloaded, synced the next morning: the completion still says 18:30", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const ENDED_AT = "2026-10-15T16:30:00.000Z"; // 18:30 in Oslo
    vi.setSystemTime(new Date("2026-10-15T15:30:00.000Z"));
    runOnDevice("match-A");
    server.activeMatch = row("match-A", "live", { status: "running" });

    vi.setSystemTime(new Date(ENDED_AT));
    setOnline(false);
    const ended = endLocalActiveMatch({ onlyServerMatchId: "match-A" });
    await submitMatchCompletion(ended!.completion!.matchId, ended!.completion!.body, ended!.completion!.endedAt);
    fetchMock.mockClear();

    // The next morning: the app is reopened, still offline, then reconnects.
    vi.setSystemTime(new Date("2026-10-16T06:05:00.000Z"));
    renderShell();
    await act(() => Promise.resolve());
    expect(patches()).toEqual([]);

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toMatchObject({ status: "completed", endedAt: ENDED_AT });
    expect((patches()[0].body.runtimeState as { endedAt?: string }).endedAt).toBe(ENDED_AT);
    await waitFor(() => expect(getPendingMatchCompletion("match-A")).toBeNull());
  });
});

describe("scoped close actions", () => {
  it("ending this device's match ends it locally and completes only its own server row", async () => {
    runOnDevice("match-A");
    server.activeMatch = row("match-B");
    renderShell();
    await waitFor(() => expect(actions?.activeMatch?.id).toBe("match-A"));

    await act(async () => {
      await actions!.forceCloseActiveMatch();
    });

    expect(getStoredMatchSetup()?.status).toBe("ended");
    expect(getStoredLiveMatch()).toMatchObject({ status: "ended" });
    expect(patches().map((patch) => patch.url)).toEqual(["/api/matches/match-A"]);
    // Ended, not wiped: the final state goes to the server.
    expect(patches()[0].body).toMatchObject({ status: "completed", runtimeState: { status: "ended" } });
  });

  it("finishing a server-only match never touches what this device holds", async () => {
    // The device holds another, already ended match (kept for its summary).
    const setup = runOnDevice("match-A");
    saveStoredLiveMatch(endLiveMatch(getStoredLiveMatch()!, Date.now()));
    endMatch(setup);
    const before = {
      setup: window.localStorage.getItem("fairplayr.matchSetup.v1"),
      live: window.localStorage.getItem("fairplayr.liveMatch.v1"),
    };
    server.activeMatch = row("match-B");
    renderShell();
    await waitFor(() => expect(actions?.recoveryMatch?.id).toBe("match-B"));

    await act(async () => {
      await actions!.forceCloseActiveMatch();
    });

    expect(patches()).toEqual([{ url: "/api/matches/match-B", body: { status: "completed" } }]);
    expect(window.localStorage.getItem("fairplayr.matchSetup.v1")).toBe(before.setup);
    expect(window.localStorage.getItem("fairplayr.liveMatch.v1")).toBe(before.live);
    await waitFor(() => expect(bannerLink()).toBeNull());
  });

  it("discarding the shown recovery match never hits a match started since (e.g. in another tab)", async () => {
    server.activeMatch = row("match-B");
    renderShell();
    await waitFor(() => expect(actions?.recoveryMatch?.id).toBe("match-B"));

    // Another tab starts match C after this screen rendered.
    const setupC = runOnDevice("match-C");

    await act(async () => {
      await actions!.discardActiveMatch();
    });

    expect(patches().map((patch) => patch.url)).toEqual(["/api/matches/match-B"]);
    // Only the discarded match's link is turned off.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT").map(([input]) => String(input))
      ).toEqual(["/api/matches/match-B/share"])
    );
    expect(getStoredMatchSetup()).toMatchObject({ status: "active", serverMatchId: "match-C", config: { id: setupC.id } });
    expect(getStoredLiveMatch()?.clock.isRunning).toBe(true);
  });

  it("does nothing to this device when the match it showed was replaced meanwhile", async () => {
    const setupA = runOnDevice("match-A");
    renderShell();
    await waitFor(() => expect(actions?.activeMatch?.setupId).toBe(setupA.id));

    // A ends and D starts elsewhere before the coach taps "End".
    endMatch(setupA);
    window.localStorage.removeItem("fairplayr.liveMatch.v1");
    runOnDevice("match-D");

    await act(async () => {
      await actions!.forceCloseActiveMatch();
    });

    expect(patches()).toEqual([]);
    expect(getStoredMatchSetup()).toMatchObject({ status: "active", serverMatchId: "match-D" });
  });

  it("discarding a match whose create is still in flight lets the create finish, then discards that row", async () => {
    // MATCH-13: started here without a planned match; the row may well exist.
    const setup = createMatchSetup("team-1");
    activateMatch(setup, "match-N", {
      ownerUserId: "user-1",
      pendingCreate: { title: "Kamp N", startsAt: new Date().toISOString() },
    });
    saveStoredLiveMatch(startLiveMatch(createLiveMatchFromSetup(setup), Date.now() - 60_000));
    let answerCreate!: (response: Response) => void;
    server.createReply = new Promise((resolve) => {
      answerCreate = resolve;
    });
    renderShell();
    await waitFor(() => expect(actions?.activeMatch?.serverMatchId).toBe("match-N"));
    // The create sent on start is still waiting for its answer.
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "POST")).toBe(true));

    let discarded = false;
    const discard = actions!.discardActiveMatch().then(() => {
      discarded = true;
    });
    await Promise.resolve();
    expect(discarded).toBe(false);
    expect(patches()).toEqual([]);

    await act(async () => {
      answerCreate(Response.json({ match: { id: "match-N" } }, { status: 201 }));
      await discard;
    });

    const methods = fetchMock.mock.calls
      .map(([input, init]) => `${(init as RequestInit | undefined)?.method ?? "GET"} ${String(input)}`)
      .filter((line) => !line.startsWith("GET "));
    // One create (the discard joined it), then the discard of that row, then
    // its public link is turned off (FEAT-SHARE-01, a durable queue); nothing after.
    expect(methods).toEqual(["POST /api/matches", "PATCH /api/matches/match-N", "PUT /api/matches/match-N/share"]);
    expect(patches()[0].body).toEqual({ status: "completed", runtimeState: null, reportStatus: "failed" });
    expect(getStoredMatchSetup()?.status).not.toBe("active");
  });
});
