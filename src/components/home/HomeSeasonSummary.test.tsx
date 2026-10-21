import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import no from "../../../messages/no.json";
import type { HomeSummary } from "@/lib/server/seasonStats";

const TEAM_ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";

let authStatus: "loading" | "guest" | "authenticated";
let workspace: {
  mode: "guest-local" | "cloud";
  isLoading: boolean;
  activeTeamId: string | null;
  activeTeam: { id: string; name: string } | null;
};
let online: boolean;

vi.mock("@/components/providers/AuthProvider", () => ({
  useAuth: () => ({ status: authStatus }),
}));
vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({
  useTeamWorkspace: () => workspace,
}));
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => online,
}));

const { HomeSummaryProvider, HomeSeasonSummary, HomeTeamName, HomeNextMatch, HomeHistoryHint } = await import(
  "./HomeSeasonSummary"
);

const SUMMARY: HomeSummary = {
  teamId: TEAM_ID,
  stats: {
    balance: 83,
    spreadMinutes: 12,
    totalMatches: 4,
    matchesPlayed: 4,
    needsMinutes: [
      { playerId: "p2", name: "Ida Ruud", number: 2, position: null, totalMinutes: 30, deficitMinutes: 18 },
    ],
    lastMatch: {
      matchId: "m4",
      opponent: "Skeid",
      scoreFor: 3,
      scoreAgainst: 1,
      when: "2026-10-18T11:00:00.000Z",
      result: "win",
    },
  },
  upcoming: { matchId: "m5", opponent: "Lyn", startsAt: "2099-01-01T10:00:00.000Z", location: null },
};

function Home() {
  return (
    <NextIntlClientProvider locale="no" messages={no}>
      <HomeSummaryProvider>
        <HomeTeamName />
        <HomeNextMatch />
        <HomeSeasonSummary />
        <HomeHistoryHint />
      </HomeSummaryProvider>
    </NextIntlClientProvider>
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

function respondWith(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  authStatus = "authenticated";
  workspace = {
    mode: "cloud",
    isLoading: false,
    activeTeamId: TEAM_ID,
    activeTeam: { id: TEAM_ID, name: "Lyn G12" },
  };
  online = true;
  fetchMock = vi.fn();
  respondWith(SUMMARY);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HomeSeasonSummary", () => {
  it("shows stats, the fixture and the team name for a signed-in member online", async () => {
    render(<Home />);
    expect(screen.getByTestId("home-summary-loading")).toBeTruthy();
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/home/summary?teamId=${TEAM_ID}`);
    expect(init).toMatchObject({ cache: "no-store", credentials: "same-origin" });

    expect(screen.getByTestId("home-season-summary")).toBeTruthy();
    expect(screen.getByText("Ida Ruud")).toBeTruthy();
    expect(screen.getByText("vs Lyn")).toBeTruthy();
    expect(screen.getByText("4 kamper denne sesongen")).toBeTruthy();
    expect(screen.getByTestId("home-team-name").textContent).toBe("Lyn G12");
    expect(screen.queryByTestId("home-summary-loading")).toBeNull();
  });

  it("is hidden for guests and never calls the API, but shows the local team name", async () => {
    authStatus = "guest";
    workspace = { ...workspace, mode: "guest-local", activeTeamId: "team-local", activeTeam: { id: "team-local", name: "Lokalt lag" } };
    render(<Home />);
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("home-season-summary")).toBeNull();
    expect(screen.queryByTestId("home-summary-loading")).toBeNull();
    expect(screen.getByTestId("home-team-name").textContent).toBe("Lokalt lag");
    expect(screen.getByText(no.home.nextMatch.setup)).toBeTruthy();
    expect(screen.getByText(no.home.actions.historyHintEmpty)).toBeTruthy();
  });

  it("is hidden offline and does not fetch (D2: nothing cached on the device)", async () => {
    online = false;
    render(<Home />);
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("home-season-summary")).toBeNull();
    expect(screen.queryByTestId("home-summary-loading")).toBeNull();
    expect(screen.getByText(no.home.nextMatch.setup)).toBeTruthy();
  });

  it("hides loaded stats when the device goes offline", async () => {
    const { rerender } = render(<Home />);
    await flush();
    expect(screen.getByTestId("home-season-summary")).toBeTruthy();

    online = false;
    rerender(<Home />);
    expect(screen.queryByTestId("home-season-summary")).toBeNull();
    expect(screen.queryByText("Ida Ruud")).toBeNull();
    expect(screen.getByText(no.home.nextMatch.setup)).toBeTruthy();
  });

  it("shows nothing when the API refuses (401/403) or fails", async () => {
    for (const status of [401, 403, 500]) {
      respondWith({ errorCode: "X" }, status);
      render(<Home />);
      await flush();
      expect(screen.queryByTestId("home-season-summary")).toBeNull();
      expect(screen.queryByTestId("home-summary-loading")).toBeNull();
      cleanup();
    }
  });

  it("ignores a response for another team", async () => {
    respondWith({ ...SUMMARY, teamId: "a0000000-0000-4000-8000-000000000000" });
    render(<Home />);
    await flush();
    expect(screen.queryByTestId("home-season-summary")).toBeNull();
  });

  it("server-renders the same static HTML for every user, even with providers ready", () => {
    const signedIn = renderToString(<Home />);
    expect(signedIn).not.toContain("Ida Ruud");
    expect(signedIn).not.toContain("Lyn G12");
    expect(signedIn).not.toContain("home-summary-loading");

    authStatus = "guest";
    workspace = { ...workspace, mode: "guest-local", activeTeam: { id: "x", name: "Et annet lag" } };
    expect(renderToString(<Home />)).toBe(signedIn);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
