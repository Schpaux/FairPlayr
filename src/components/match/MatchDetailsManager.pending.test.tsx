// MATCH-13: a match ended on this device that the server does not have yet
// opens from the device, with its result, goals and a way to sync it.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchDetailsManager } from "@/components/match/MatchDetailsManager";
import { createLiveMatchFromSetup, endLiveMatch, startLiveMatch, updateScore } from "@/domain/liveMatch";
import { createMatchSetup } from "@/domain/match";
import { createGoalEvent } from "@/domain/matchEvent";
import {
  getPendingMatchCompletion,
  savePendingMatchCompletion,
} from "@/lib/storage/pendingMatchCompletionStorage";
import en from "../../../messages/en.json";

const MATCH_A = "0b6f4d1e-2c3a-4b5d-8e6f-7a8b9c0d1e2f";
const AUTH = { status: "authenticated", user: { id: "user-1" } };
const ACTIVE_MATCH = { refreshActiveMatch: vi.fn(() => Promise.resolve()) };
const WORKSPACE = { isLoading: false, teams: [{ id: "team-1", name: "G2014", players: [] }] };

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => AUTH }));
vi.mock("@/components/providers/ActiveMatchProvider", () => ({ useActiveMatch: () => ACTIVE_MATCH }));
vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({ useTeamWorkspace: () => WORKSPACE }));

function savePendingA() {
  const setup = { ...createMatchSetup("team-1"), selectedPlayerIds: ["p1", "p2"], startingPlayerIds: ["p1"] };
  let live = updateScore(startLiveMatch(createLiveMatchFromSetup(setup), Date.parse("2026-10-25T09:52:00.000Z")), "team", 1);
  live = {
    ...live,
    events: [
      ...live.events,
      createGoalEvent({ minute: 12, timestampMs: 720_000, teamSide: "own", scorerPlayerId: "p2", scorerName: "Emma Haugen" }),
    ],
  };
  savePendingMatchCompletion({
    matchId: MATCH_A,
    body: {
      status: "completed",
      scoreFor: 1,
      scoreAgainst: 0,
      reportEnabled: true,
      runtimeState: endLiveMatch(live, Date.parse("2026-10-25T10:45:00.000Z")),
    },
    endedAt: "2026-10-25T10:45:00.000Z",
    userId: "user-1",
    info: { teamId: "team-1", title: "Kamp – 25. okt 10:52", startsAt: "2026-10-25T09:52:00.000Z", format: "7v7" },
    needsCreate: true,
  });
}

function renderDetails() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MatchDetailsManager matchId={MATCH_A} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MatchDetailsManager for a match waiting to sync", () => {
  it("opens from the device when the server cannot be reached, and syncs it on request", async () => {
    savePendingA();
    let serverUp = false;
    const sent: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        sent.push(`${method} ${String(input)}`);
        if (!serverUp) return Promise.reject(new TypeError("Failed to fetch"));
        if (method === "POST") return Promise.resolve(Response.json({ match: { id: MATCH_A } }, { status: 201 }));
        if (method === "PATCH") return Promise.resolve(new Response(null, { status: 204 }));
        return Promise.resolve(new Response(JSON.stringify({ message: "Fant ikke kampen." }), { status: 404 }));
      })
    );
    renderDetails();

    expect(await screen.findByTestId("match-pending-sync")).toBeTruthy();
    expect(screen.getByTestId("match-score").textContent).toContain("1");
    expect(screen.getByTestId("match-timeline").textContent).toContain("Emma Haugen");
    expect(screen.getByTestId("match-hero").textContent).toContain("7v7");

    // Back online: the row is created with the match's own id, then completed.
    serverUp = true;
    sent.length = 0;
    fireEvent.click(screen.getByRole("button", { name: en.matchPlanner.syncFinishCta }));

    await waitFor(() => expect(getPendingMatchCompletion(MATCH_A)).toBeNull());
    expect(sent.slice(0, 2)).toEqual(["POST /api/matches", `PATCH /api/matches/${MATCH_A}`]);
  });

  it("shows the waiting result over a server row that is still live", async () => {
    savePendingA();
    const serverLive = {
      id: MATCH_A,
      title: "Kamp – 25. okt 10:52",
      teamId: "team-1",
      opponentName: null,
      startsAt: "2026-10-25T09:52:00.000Z",
      location: null,
      format: "7v7",
      status: "live",
      source: "manual",
      externalEventId: null,
      rsvpLastSyncedAt: null,
      startedAt: "2026-10-25T09:52:00.000Z",
      endedAt: null,
      scoreFor: 0,
      scoreAgainst: 0,
      reportEnabled: true,
      reportStatus: "not_requested",
      reportText: null,
      runtimeState: null,
    };
    const sent: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        sent.push(`${init?.method ?? "GET"} ${String(input)}`);
        return Promise.resolve(
          String(input).endsWith("/events") ? Response.json({ events: [] }) : Response.json({ match: serverLive })
        );
      })
    );
    renderDetails();

    // Same as the history row: completed with this device's 1–0, still to sync.
    expect(await screen.findByTestId("match-pending-sync")).toBeTruthy();
    expect(screen.getByTestId("match-score").textContent).toContain("1");
    expect(screen.queryByRole("button", { name: en.matchPlanner.finishMatchCta })).toBeNull();
    expect(screen.getByRole("button", { name: en.matchPlanner.syncFinishCta })).toBeTruthy();
    // No summary is asked for before the server has the result.
    expect(sent.every((line) => line.startsWith("GET "))).toBe(true);
  });
});
