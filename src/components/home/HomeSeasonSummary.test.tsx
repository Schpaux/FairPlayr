import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
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
  teams: Array<{ id: string; name: string }>;
};
let online: boolean;
let activeMatch: { id: string; title: string; status: "live" | "completed" } | null;

vi.mock("@/components/providers/AuthProvider", () => ({
  useAuth: () => ({ status: authStatus }),
}));
vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({
  useTeamWorkspace: () => workspace,
}));
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => online,
}));
vi.mock("@/components/providers/ActiveMatchProvider", () => ({
  useActiveMatch: () => ({ activeMatch, activeMatchHref: "/match/live" }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const { HomeSummaryProvider, HomeSeasonSummary, HomeFixturePanel } = await import("./HomeSeasonSummary");

const SUMMARY: HomeSummary = {
  teamId: TEAM_ID,
  stats: {
    balance: 83,
    spreadMinutes: 12,
    totalMatches: 4,
    matchesPlayed: 4,
    timedMatches: 4,
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
        <HomeFixturePanel />
        <HomeSeasonSummary />
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
    teams: [{ id: TEAM_ID, name: "Lyn G12" }],
  };
  online = true;
  activeMatch = null;
  fetchMock = vi.fn();
  respondWith(SUMMARY);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HomeSeasonSummary", () => {
  it("shows 'no data' instead of a perfect balance when no match has measured playing time", async () => {
    respondWith({
      ...SUMMARY,
      stats: { ...SUMMARY.stats!, balance: 100, spreadMinutes: 0, timedMatches: 0, needsMinutes: [] },
    });
    render(<Home />);
    await flush();

    expect(screen.getByTestId("home-stat-balance").textContent).toContain(no.home.summary.noData);
    expect(screen.getByTestId("home-stat-balance").textContent).not.toContain("100");
    expect(screen.getByTestId("home-season-hint").textContent).toBe(no.home.summary.noDataHint);
    expect(screen.queryByTestId("home-needs-minutes")).toBeNull();
    // The match count and the last result are still true.
    expect(screen.getByTestId("home-stat-played").textContent).toContain("4");
  });

  it("hides 'needs minutes' without data, even if the server sent a list", async () => {
    respondWith({ ...SUMMARY, stats: { ...SUMMARY.stats!, timedMatches: 0 } });
    render(<Home />);
    await flush();
    expect(screen.queryByText("Ida Ruud")).toBeNull();
    expect(screen.getByTestId("home-stat-balance").textContent).toContain(no.home.summary.noData);
  });

  it("says how many matches the balance is based on when some lack playing time", async () => {
    respondWith({ ...SUMMARY, stats: { ...SUMMARY.stats!, timedMatches: 3 } });
    render(<Home />);
    await flush();
    expect(screen.getByTestId("home-stat-balance").textContent).toContain("83\u00a0%");
    expect(screen.getByTestId("home-season-hint").textContent).toContain("3 av 4 kamper");
    expect(screen.getByText("Ida Ruud")).toBeTruthy();
  });

  it("shows nothing before the team's first completed match", async () => {
    respondWith({
      ...SUMMARY,
      stats: { ...SUMMARY.stats!, matchesPlayed: 0, totalMatches: 0, timedMatches: 0, needsMinutes: [], lastMatch: null },
    });
    render(<Home />);
    await flush();
    expect(screen.queryByTestId("home-season-summary")).toBeNull();
  });

  it("turns the panel into the running match, with one action that opens it", async () => {
    activeMatch = { id: "local-1", title: "Lyn G12 – Skeid", status: "live" };
    render(<Home />);
    await flush();

    const panel = screen.getByTestId("home-fixture-panel");
    expect(panel.getAttribute("data-state")).toBe("live");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Lyn G12 – Skeid");
    expect(panel.textContent).toContain(no.home.fixture.liveLabel);
    const action = screen.getByTestId("home-primary-action");
    expect(action.getAttribute("href")).toBe("/match/live");
    expect(action.textContent).toBe(no.home.fixture.continue);
    // Found as "Kamp pågår" like the banner elsewhere, visible label first.
    expect(action.getAttribute("aria-label")).toBe(`${no.home.fixture.continue} – ${no.home.fixture.liveLabel}`);
    // One action only: the fixture's setup link is not offered alongside.
    expect(screen.queryByText(no.home.fixture.setup)).toBeNull();
  });

  it("ignores an ended match", async () => {
    activeMatch = { id: "local-1", title: "Lyn G12 – Skeid", status: "completed" };
    render(<Home />);
    await flush();
    expect(screen.getByTestId("home-fixture-panel").getAttribute("data-state")).toBe("upcoming");
  });

  it("sends a workspace without a team to create one first", async () => {
    authStatus = "guest";
    workspace = { mode: "guest-local", isLoading: false, activeTeamId: null, activeTeam: null, teams: [] };
    render(<Home />);
    await flush();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(no.home.fixture.noTeamTitle);
    expect(screen.getByTestId("home-primary-action").getAttribute("href")).toBe("/team");
  });

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
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mot Lyn");
    expect(screen.getByTestId("home-stat-played").textContent).toContain("4");
    expect(screen.getByTestId("home-stat-balance").textContent).toContain("83\u00a0%");
    expect(screen.getByTestId("home-stat-last").textContent).toContain("3–1");
    expect(screen.getByTestId("home-stat-last").textContent).toContain("Seier");
    expect(screen.getByTestId("home-season-hint").textContent).toBe("12 min skiller mest og minst spilletid.");
    // The countdown is in words ("om 26 663 dager"), not "D"/"T" abbreviations.
    expect(screen.getByTestId("home-fixture-panel").textContent).toMatch(/Neste kamp · om [\d\s\u00a0]+ dager/);
    // The score is spoken as words, not "2 dash 1".
    expect(screen.getByTestId("home-stat-last").textContent).toContain("3 mot 1");
    expect(screen.getByTestId("home-primary-action").getAttribute("href")).toBe("/match/setup");
    expect(screen.queryByTestId("home-summary-loading")).toBeNull();
  });

  it("is hidden for guests and never calls the API, but still offers a new match", async () => {
    authStatus = "guest";
    workspace = {
      ...workspace,
      mode: "guest-local",
      activeTeamId: "team-local",
      activeTeam: { id: "team-local", name: "Lokalt lag" },
      teams: [{ id: "team-local", name: "Lokalt lag" }],
    };
    render(<Home />);
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("home-season-summary")).toBeNull();
    expect(screen.queryByTestId("home-summary-loading")).toBeNull();
    expect(screen.getByText(no.home.fixture.noFixture)).toBeTruthy();
    expect(screen.getByText(no.home.fixture.setup)).toBeTruthy();
  });

  it("is hidden offline and does not fetch (D2: nothing cached on the device)", async () => {
    online = false;
    render(<Home />);
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("home-season-summary")).toBeNull();
    expect(screen.queryByTestId("home-summary-loading")).toBeNull();
    expect(screen.getByText(no.home.fixture.setup)).toBeTruthy();
  });

  it("hides loaded stats when the device goes offline", async () => {
    const { rerender } = render(<Home />);
    await flush();
    expect(screen.getByTestId("home-season-summary")).toBeTruthy();

    online = false;
    rerender(<Home />);
    expect(screen.queryByTestId("home-season-summary")).toBeNull();
    expect(screen.queryByText("Ida Ruud")).toBeNull();
    expect(screen.getByText(no.home.fixture.setup)).toBeTruthy();
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
    activeMatch = { id: "local-1", title: "Lyn G12 – Skeid", status: "live" };
    const signedIn = renderToString(<Home />);
    expect(signedIn).not.toContain("Ida Ruud");
    expect(signedIn).not.toContain("Skeid");
    // No action until hydrated: a running match must not be offered "set up" first.
    expect(signedIn).not.toContain("home-primary-action");
    expect(signedIn).not.toContain("Lyn G12");
    expect(signedIn).not.toContain("home-summary-loading");

    authStatus = "guest";
    workspace = { ...workspace, mode: "guest-local", activeTeam: { id: "x", name: "Et annet lag" } };
    expect(renderToString(<Home />)).toBe(signedIn);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
