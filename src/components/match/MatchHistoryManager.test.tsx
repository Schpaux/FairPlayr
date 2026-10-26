// C4 (UI-HIST-01): History groups a team's matches as live, completed (newest
// first, score and result word) and the next planned ones; every row is one
// link to the match.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchHistoryManager } from "@/components/match/MatchHistoryManager";
import {
  clearPendingMatchCompletion,
  savePendingMatchCompletion,
  type PendingMatchCompletion,
} from "@/lib/storage/pendingMatchCompletionStorage";
import no from "../../../messages/no.json";

const AUTH: { status: string; user?: { id: string } | null } = { status: "authenticated" };
const WORKSPACE: {
  mode: string;
  isLoading: boolean;
  activeTeamId: string | null;
  teams: { id: string; name: string; players: never[] }[];
} = { mode: "cloud", isLoading: false, activeTeamId: "team-1", teams: [] };

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => AUTH }));
vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({ useTeamWorkspace: () => WORKSPACE }));

function match(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    teamId: "team-1",
    title: "Lyn G12",
    opponentName: `Motstander ${id}`,
    startsAt: "2026-10-14T16:00:00.000Z",
    location: null,
    format: "7v7",
    status: "completed",
    source: "manual",
    scoreFor: 0,
    scoreAgainst: 0,
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Like `/api/matches?teamId=…`: one team's matches per request. */
function serve(matches: ReturnType<typeof match>[]) {
  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const teamId = new URL(String(input), "http://localhost").searchParams.get("teamId");
    return Promise.resolve(Response.json({ matches: matches.filter((item) => item.teamId === teamId) }));
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderHistory() {
  return render(
    <NextIntlClientProvider locale="no" messages={no}>
      <MatchHistoryManager />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  AUTH.status = "authenticated";
  AUTH.user = { id: "user-1" };
  WORKSPACE.mode = "cloud";
  WORKSPACE.activeTeamId = "team-1";
  WORKSPACE.teams = [{ id: "team-1", name: "Lyn G12", players: [] }];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MatchHistoryManager (C4)", () => {
  it("groups live, planned (soonest first) and completed (newest first) matches", async () => {
    serve([
      match("old", { startsAt: "2026-09-01T16:00:00.000Z", scoreFor: 2, scoreAgainst: 2 }),
      match("new", { startsAt: "2026-10-14T16:00:00.000Z", scoreFor: 3, scoreAgainst: 1 }),
      match("lost", { startsAt: "2026-10-01T16:00:00.000Z", scoreFor: 0, scoreAgainst: 2 }),
      match("running", { status: "live" }),
      match("later", { status: "upcoming", startsAt: "2026-11-10T10:00:00.000Z" }),
      match("soon", { status: "draft", startsAt: "2026-11-01T10:00:00.000Z" }),
    ]);
    renderHistory();

    const completed = await screen.findByTestId("history-completed");
    const rows = within(completed).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["/match/new", "/match/lost", "/match/old"]);
    expect(rows[0].textContent).toContain("3–1");
    expect(rows[0].textContent).toContain("3 mot 1");
    expect(rows[0].textContent).toContain(no.matchHistory.resultWon);
    expect(rows[1].textContent).toContain(no.matchHistory.resultLost);
    expect(rows[2].textContent).toContain(no.matchHistory.resultDraw);

    const live = within(screen.getByTestId("history-live")).getByRole("link");
    expect(live.getAttribute("href")).toBe("/match/running");

    const planned = within(screen.getByTestId("history-planned")).getAllByRole("link");
    expect(planned.map((row) => row.getAttribute("href"))).toEqual(["/match/soon", "/match/later"]);

    // Live, then the next planned, then the (unbounded) results.
    const sections = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(sections).toEqual([no.matchHistory.groupLive, no.matchHistory.groupPlanned, no.matchHistory.groupCompleted]);
  });

  it("shows the next three planned matches and links to the full list on Kamp", async () => {
    serve(
      ["a", "b", "c", "d", "e"].map((id, index) =>
        match(id, { status: "upcoming", startsAt: `2026-11-0${index + 1}T10:00:00.000Z` })
      )
    );
    renderHistory();

    const planned = await screen.findByTestId("history-planned");
    const links = within(planned).getAllByRole("link");
    expect(links.map((row) => row.getAttribute("href"))).toEqual(["/match/a", "/match/b", "/match/c", "/match"]);
    expect(within(planned).getByTestId("history-all-planned").textContent).toContain("5");
  });

  it("filters by the active team and hides the filter when there is only one team", async () => {
    serve([match("mine"), match("theirs", { teamId: "team-2" })]);
    renderHistory();

    await screen.findByTestId("history-completed");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText(/Motstander theirs/)).toBeNull();
  });

  it("keeps the team filter with several teams, and names the team on «Alle lag»", async () => {
    WORKSPACE.teams = [
      { id: "team-1", name: "Lyn G12", players: [] },
      { id: "team-2", name: "Lyn J13", players: [] },
    ];
    serve([match("mine"), match("theirs", { teamId: "team-2" })]);
    renderHistory();

    await screen.findByTestId("history-completed");
    expect(screen.queryByText(/Motstander theirs/)).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: no.matchHistory.filterLabel }), { target: { value: "" } });
    await waitFor(() => expect(screen.getByText(/Motstander theirs/)).toBeTruthy());
    expect(screen.getByTestId("history-row-theirs").textContent).toContain("Lyn J13");
  });

  it("shows one empty state with a single action when the team has no matches", async () => {
    serve([]);
    renderHistory();

    const empty = await screen.findByTestId("history-empty");
    expect(within(empty).getByText(no.matchHistory.emptyTitle)).toBeTruthy();
    expect(within(empty).getByRole("link", { name: no.matchHistory.goToMatches }).getAttribute("href")).toBe("/match");
  });

  it("explains a failed load and retries on request", async () => {
    fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(Response.json({ matches: [match("m")] }));
    vi.stubGlobal("fetch", fetchMock);
    renderHistory();

    expect(await screen.findByText(no.matchHistory.errors.generic)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: no.matchHistory.retry }));
    expect(await screen.findByTestId("history-completed")).toBeTruthy();
  });

  it("treats one team's failed load as an error, not as an empty history", async () => {
    WORKSPACE.teams = [
      { id: "team-1", name: "Lyn G12", players: [] },
      { id: "team-2", name: "Lyn J13", players: [] },
    ];
    fetchMock = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input).includes("team-2")
          ? new Response("<html>502</html>", { status: 502 })
          : Response.json({ matches: [match("mine")] })
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    renderHistory();

    expect(await screen.findByText(no.matchHistory.errors.generic)).toBeTruthy();
    expect(screen.queryByTestId("history-empty")).toBeNull();
    expect(screen.getByRole("button", { name: no.matchHistory.retry })).toBeTruthy();
  });

  it("asks a guest to sign in and fetches nothing", () => {
    AUTH.status = "unauthenticated";
    WORKSPACE.mode = "guest-local";
    serve([]);
    renderHistory();

    expect(screen.getByText(no.matchHistory.guestTitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: no.matchHistory.guestCta }).getAttribute("href")).toBe("/auth/sign-in");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // MATCH-13: a match ended on this device whose result the server does not
  // have yet is listed with the server history, marked as waiting.
  describe("matches waiting to sync", () => {
    function pending(matchId: string, over: Partial<PendingMatchCompletion> = {}): PendingMatchCompletion {
      return {
        matchId,
        body: { status: "completed", scoreFor: 2, scoreAgainst: 1, reportEnabled: true, runtimeState: null },
        endedAt: "2026-10-25T10:45:00.000Z",
        userId: "user-1",
        info: { teamId: "team-1", title: "Kamp – 25. okt 10:52", startsAt: "2026-10-25T09:52:00.000Z", format: "7v7" },
        needsCreate: true,
        ...over,
      };
    }

    it("lists this coach's waiting match even when the server cannot be reached", async () => {
      savePendingMatchCompletion(pending("local-a"));
      savePendingMatchCompletion(pending("other-coach", { userId: "user-2" }));
      savePendingMatchCompletion(
        pending("other-team", { info: { ...pending("x").info!, teamId: "team-9" } })
      );
      fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      vi.stubGlobal("fetch", fetchMock);
      renderHistory();

      expect(await screen.findByText(no.matchHistory.errors.generic)).toBeTruthy();
      const row = within(screen.getByTestId("history-completed")).getByRole("link");
      expect(row.getAttribute("href")).toBe("/match/local-a");
      expect(row.textContent).toContain("2–1");
      expect(row.textContent).toContain(no.matchHistory.pendingSync);
      expect(screen.queryByTestId("history-row-other-coach")).toBeNull();
      expect(screen.queryByTestId("history-row-other-team")).toBeNull();
    });

    it("shows the match once, as waiting while the server is behind and from the server once synced", async () => {
      savePendingMatchCompletion(pending("match-a", { needsCreate: false }));
      // The server still has the row as live (the completion has not arrived).
      serve([match("match-a", { status: "live", opponentName: null, title: "Kamp – 25. okt 10:52" })]);
      renderHistory();

      const completed = await screen.findByTestId("history-completed");
      expect(within(completed).getAllByRole("link")).toHaveLength(1);
      expect(screen.queryByTestId("history-live")).toBeNull();
      expect(screen.getByTestId("history-row-match-a").textContent).toContain(no.matchHistory.pendingSync);

      // The completion syncs: the list is read again and the server row shows once.
      serve([match("match-a", { status: "completed", scoreFor: 2, scoreAgainst: 1, title: "Kamp – 25. okt 10:52" })]);
      act(() => clearPendingMatchCompletion("match-a"));

      await waitFor(() =>
        expect(screen.getByTestId("history-row-match-a").textContent).not.toContain(no.matchHistory.pendingSync)
      );
      expect(screen.getAllByTestId("history-row-match-a")).toHaveLength(1);
      expect(screen.getByTestId("history-row-match-a").textContent).toContain("2–1");
    });
  });
});
