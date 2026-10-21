// UI-DETAIL-01: the details page lists every squad player's playing time,
// 0′ included, least played first, against the match's fair share.
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchDetailsManager } from "@/components/match/MatchDetailsManager";
import {
  createLiveMatchFromSetup,
  endCurrentHalf,
  endLiveMatch,
  startLiveMatch,
  type LiveMatchState,
} from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import { createSubstitutionEvent } from "@/domain/matchEvent";
import { applySubstitution } from "@/domain/substitutionUndo";
import no from "../../../messages/no.json";

const MIN = 60_000;
const T0 = 1_000_000;

const AUTH = { status: "authenticated" };
const ACTIVE_MATCH = { refreshActiveMatch: vi.fn(() => Promise.resolve()) };
const NAMES = ["Frida", "Ida", "Selma", "Vilde", "Maja", "Emma", "Thea"];
const WORKSPACE = {
  isLoading: false,
  teams: [
    {
      id: "team-1",
      name: "Lyn G12",
      // Thea (p7) has since left the team.
      players: NAMES.slice(0, 6).map((name, index) => ({ id: `p${index + 1}`, name })),
    },
  ],
};

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => AUTH }));
vi.mock("@/components/providers/ActiveMatchProvider", () => ({ useActiveMatch: () => ACTIVE_MATCH }));
vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({ useTeamWorkspace: () => WORKSPACE }));

function setup(): MatchSetup {
  const ids = NAMES.map((_, index) => `p${index + 1}`);
  const starters = ids.slice(0, 5);
  return {
    id: "setup-1",
    teamId: "team-1",
    format: "5v5",
    reportEnabled: false,
    formationId: "5v5-2-2",
    duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
    selectedPlayerIds: ids,
    startingPlayerIds: starters,
    slotAssignments: Object.fromEntries(starters.map((id, index) => [`5v5-${index + 1}`, id])),
    createdAt: "2026-10-21T10:00:00.000Z",
    updatedAt: "2026-10-21T10:00:00.000Z",
  };
}

/** Thea (p7) replaces Maja (p5) after 10 minutes; Emma (p6) never plays. */
function playedMatch(): LiveMatchState {
  let state = createLiveMatchFromSetup(setup());
  state = startLiveMatch(state, T0);
  // As the live screen does it: the event carries the names (MatchLiveManager).
  const event = createSubstitutionEvent({
    minute: 10,
    timestampMs: 10 * MIN,
    inPlayerId: "p7",
    inPlayerName: "Thea",
    outPlayerId: "p5",
    outPlayerName: "Maja",
  });
  state = applySubstitution(state, "p5", "p7", T0 + 10 * MIN, event)!.state;
  state = endCurrentHalf(state, T0 + 15 * MIN);
  state = startLiveMatch(state, T0 + 20 * MIN);
  return endLiveMatch(state, T0 + 35 * MIN);
}

function serverMatch(status: string, runtimeState: unknown) {
  return {
    id: "match-1",
    teamId: "team-1",
    title: "Lyn G12 – Skeid",
    opponentName: "Skeid",
    startsAt: "2026-10-21T10:00:00.000Z",
    location: null,
    format: "5v5",
    status,
    reportEnabled: false,
    reportStatus: "not_requested",
    reportText: null,
    scoreFor: 0,
    scoreAgainst: 0,
    startedAt: null,
    endedAt: null,
    runtimeState,
    source: "manual",
    externalEventId: null,
    rsvpLastSyncedAt: null,
  };
}

function renderDetails(status: string, runtimeState: unknown) {
  const match = serverMatch(status, runtimeState === undefined ? null : JSON.parse(JSON.stringify(runtimeState)));
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(String(input).endsWith("/events") ? Response.json({ events: [] }) : Response.json({ match }))
    )
  );

  return render(
    <NextIntlClientProvider locale="no" messages={no}>
      <MatchDetailsManager matchId="match-1" />
    </NextIntlClientProvider>
  );
}

/** What is on screen: the text without the screen-reader-only words. */
function shown(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll(".sr-only").forEach((node) => node.remove());
  return copy.textContent ?? "";
}

/** What a screen reader gets: the text without the aria-hidden shorthand. */
function spoken(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll("[aria-hidden]").forEach((node) => node.remove());
  return copy.textContent ?? "";
}

function rows() {
  return within(screen.getByRole("list", { name: no.matchPlanner.playingTime.listLabel })).getAllByRole("listitem");
}

describe("UI-DETAIL-01: playing time on the match details page", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lists every squad player, 0′ included, least played first", async () => {
    renderDetails("completed", playedMatch());
    await screen.findByTestId("match-playing-time");

    const lines = rows().map(shown);
    expect(lines).toHaveLength(7);
    // Emma never played; Maja came off, Thea came on; the starters still on at the end played it all.
    expect(lines[0]).toMatch(/^Emma.*Kom ikke på banen · Minst spilt · 21′ under rettferdig andel.*0′/);
    expect(lines[1]).toMatch(/^Maja.*Startet · 11′ under rettferdig andel.*10′/);
    expect(lines[2]).toMatch(/^Thea.*Byttet inn.*20′/);
    ["Frida", "Ida", "Selma", "Vilde"].forEach((name, index) => expect(lines[3 + index]).toMatch(new RegExp(`^${name}Startet`)));
    for (const line of lines.slice(3)) expect(line).toMatch(/Startet.*30′/);
  });

  it("states the fair share and how it was worked out", async () => {
    renderDetails("completed", playedMatch());

    const fairShare = await screen.findByTestId("match-fair-share");
    expect(shown(fairShare)).toBe("Rettferdig andel: 21′ per spiller5 plasser × 30′ spilt ÷ 7 spillere i troppen");
    expect(spoken(fairShare)).toBe(
      "Rettferdig andel: 21 minutter per spiller5 plasser ganger 30 minutter spilt, delt på 7 spillere i troppen"
    );
  });

  it("gives screen readers minutes in words, not the prime sign", async () => {
    renderDetails("completed", playedMatch());
    await screen.findByTestId("match-playing-time");

    expect(spoken(screen.getByTestId("playing-time-p6"))).toBe(
      "EmmaKom ikke på banen, Minst spilt, 21 minutter under rettferdig andel0 minutter"
    );
    expect(within(screen.getByTestId("playing-time-p6")).getByText("0 minutter")).toBeTruthy();
    expect(within(screen.getByTestId("playing-time-p1")).getByText("30 minutter")).toBeTruthy();
  });

  it("shows only what an incomplete historic match recorded", async () => {
    const state = JSON.parse(JSON.stringify(playedMatch())) as Record<string, unknown>;
    delete state.initialOnFieldPlayerIds;
    delete state.clock;
    renderDetails("completed", state);
    await screen.findByTestId("match-playing-time");

    expect(screen.queryByTestId("match-fair-share")).toBeNull();
    expect(screen.getByText(no.matchPlanner.playingTime.gaps.startersMissing)).toBeTruthy();
    expect(screen.getByText(no.matchPlanner.playingTime.gaps.openSpellsMissing)).toBeTruthy();
    // Still the whole squad, no roles guessed, no minutes invented.
    expect(rows()).toHaveLength(7);
    expect(screen.queryByText(no.matchPlanner.playingTime.role.starter)).toBeNull();
    expect(screen.getByTestId("playing-time-p5").textContent).toMatch(/10′/);
    expect(screen.getByTestId("playing-time-p1").textContent).toMatch(/0′/);
  });

  it("says so when a completed match recorded no playing time", async () => {
    renderDetails("completed", null);

    expect(await screen.findByText(no.matchPlanner.playingTime.unavailable)).toBeTruthy();
    expect(screen.queryByRole("list", { name: no.matchPlanner.playingTime.listLabel })).toBeNull();
  });

  it("has no playing time section for a match that has not been played", async () => {
    renderDetails("upcoming", null);
    await screen.findByText(no.matchPlanner.timelineTitle);

    expect(screen.queryByTestId("match-playing-time")).toBeNull();
  });

  it("names an unnamed squad player honestly rather than dropping them", async () => {
    const state = JSON.parse(JSON.stringify(playedMatch())) as LiveMatchState;
    // Strip the names the substitution event carried: p7 is no longer in the team.
    state.events = state.events.filter((event) => event.type !== "substitution");
    renderDetails("completed", state);
    await screen.findByTestId("match-playing-time");

    expect(screen.getByTestId("playing-time-p7").textContent).toContain(no.matchPlanner.playingTime.unknownPlayer);
  });
});
