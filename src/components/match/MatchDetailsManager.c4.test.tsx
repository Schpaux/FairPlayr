// C4 (UI-DETAIL-01 rest): the result on the club-green panel, a compact
// goals-and-substitutions timeline, every squad player's minutes (0′ too),
// and the goal edit and delete flows on the shared sheets, each destructive
// step behind its own confirmation.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchDetailsManager } from "@/components/match/MatchDetailsManager";
import { createLiveMatchFromSetup, endCurrentHalf, endLiveMatch, startLiveMatch, type LiveMatchState } from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import { createGoalEvent, createSubstitutionEvent } from "@/domain/matchEvent";
import { applySubstitution } from "@/domain/substitutionUndo";
import no from "../../../messages/no.json";

const MIN = 60_000;
const T0 = 1_000_000;
const NAMES = ["Frida", "Ida", "Selma", "Vilde", "Maja", "Emma", "Thea"];

const ROUTER = { push: vi.fn() };
const AUTH = { status: "authenticated" };
const ACTIVE_MATCH = { refreshActiveMatch: vi.fn(() => Promise.resolve()) };
const WORKSPACE = {
  isLoading: false,
  teams: [{ id: "team-1", name: "Lyn G12", players: NAMES.map((name, index) => ({ id: `p${index + 1}`, name })) }],
};

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ROUTER,
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

/** Thea (p7) replaces Maja (p5) after 10′; Emma (p6) never plays; 2–1. */
function playedMatch(): LiveMatchState {
  let state = createLiveMatchFromSetup(setup());
  state = startLiveMatch(state, T0);
  const sub = createSubstitutionEvent({
    minute: 10,
    timestampMs: 10 * MIN,
    inPlayerId: "p7",
    inPlayerName: "Thea",
    outPlayerId: "p5",
    outPlayerName: "Maja",
  });
  state = applySubstitution(state, "p5", "p7", T0 + 10 * MIN, sub)!.state;
  state = endCurrentHalf(state, T0 + 15 * MIN);
  state = startLiveMatch(state, T0 + 20 * MIN);
  state = endLiveMatch(state, T0 + 35 * MIN);
  const goals = [
    createGoalEvent({ minute: 4, timestampMs: 4 * MIN, teamSide: "own", scorerPlayerId: "p1", scorerName: "Frida", assistPlayerId: "p2", assistName: "Ida" }),
    createGoalEvent({ minute: 12, timestampMs: 12 * MIN, teamSide: "opponent" }),
    createGoalEvent({ minute: 25, timestampMs: 25 * MIN, teamSide: "own", scorerPlayerId: "p3", scorerName: "Selma" }),
  ];
  return { ...state, events: [...state.events, ...goals] };
}

function serverMatch(over: Record<string, unknown> = {}) {
  return {
    id: "match-1",
    teamId: "team-1",
    title: "Lyn G12",
    opponentName: "Skeid",
    startsAt: "2026-10-21T10:00:00.000Z",
    location: "Voldsløkka",
    format: "5v5",
    status: "completed",
    reportEnabled: false,
    reportStatus: "not_requested",
    reportText: null,
    scoreFor: 2,
    scoreAgainst: 1,
    startedAt: null,
    endedAt: null,
    runtimeState: null,
    source: "manual",
    externalEventId: null,
    rsvpLastSyncedAt: null,
    ...over,
  };
}

const SERVER_GOAL = {
  id: "ev-1",
  matchId: "match-1",
  type: "goal_for",
  minute: 17,
  timestampMs: 17 * MIN,
  teamSide: "own",
  primaryPlayerId: "p1",
  secondaryPlayerId: null,
  payload: { primaryPlayerName: "Frida" },
  createdAt: "2026-10-21T10:17:00.000Z",
  updatedAt: "2026-10-21T10:17:00.000Z",
};

let fetchMock: ReturnType<typeof vi.fn>;

function renderDetails(match: ReturnType<typeof serverMatch>, events: unknown[] = [], options: { failWrites?: boolean } = {}) {
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (options.failWrites && method !== "GET") {
      return Promise.resolve(Response.json({ message: "Serveren svarte ikke." }, { status: 503 }));
    }
    if (method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }));
    if (method === "PATCH" && url.includes("/events/")) {
      return Promise.resolve(Response.json({ event: { ...SERVER_GOAL, ...JSON.parse(String(init?.body)) } }));
    }
    if (url.endsWith("/events")) return Promise.resolve(Response.json({ events }));
    return Promise.resolve(Response.json({ match: JSON.parse(JSON.stringify(match)) }));
  });
  vi.stubGlobal("fetch", fetchMock);

  return render(
    <NextIntlClientProvider locale="no" messages={no}>
      <MatchDetailsManager matchId="match-1" />
    </NextIntlClientProvider>
  );
}

function calls(method: string) {
  return fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === method);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  ROUTER.push.mockClear();
});

describe("MatchDetailsManager (C4)", () => {
  it("puts the result first, with the result word and a way back to History", async () => {
    renderDetails(serverMatch({ runtimeState: playedMatch() }));

    const hero = await screen.findByTestId("match-hero");
    expect(within(hero).getByRole("heading", { level: 1 }).textContent).toBe("Lyn G12 – Skeid");
    expect(within(hero).getByTestId("match-score").textContent).toBe(`2–12 mot 1${no.matchPlanner.result.win}`);
    expect(screen.getByRole("link", { name: no.matchPlanner.backToHistory }).getAttribute("href")).toBe("/historikk");
  });

  it("lists goals and substitutions in order, with the minute spoken", async () => {
    renderDetails(serverMatch({ runtimeState: playedMatch() }));

    const timeline = await screen.findByRole("list", { name: no.matchPlanner.timelineTitle });
    const items = within(timeline).getAllByRole("listitem");
    // One text alternative per row, in reading order (DESIGN.md §7.2).
    expect(items.map((row) => row.querySelector(".sr-only")?.textContent)).toEqual([
      "4. minutt, mål for oss: Frida, assist Ida",
      "10. minutt, bytte: Thea inn, Maja ut",
      "12. minutt, mål for Skeid",
      "25. minutt, mål for oss: Selma",
    ]);
    // Our events on the left, the opponent's on the right; goals bold.
    expect(items.map((row) => row.getAttribute("data-side"))).toEqual(["own", "own", "opponent", "own"]);
    expect(items.map((row) => row.getAttribute("data-kind"))).toEqual(["goal", "substitution", "goal", "goal"]);
    expect(items[0].querySelector("strong")?.textContent).toBe("Frida");
    expect(items[0].textContent).toContain("Frida · assist Ida");
    expect(items[1].querySelector("strong")).toBeNull();
    expect(items[2].textContent).toContain("Mål · Skeid");
    // Runtime events are not editable here.
    expect(within(timeline).queryByRole("button")).toBeNull();
  });

  it("shows every squad player's minutes, the one who never played as 0′", async () => {
    renderDetails(serverMatch({ runtimeState: playedMatch() }));

    const unused = await screen.findByTestId("playing-time-p6");
    expect(unused.textContent).toContain("Emma");
    expect(within(unused).getByText("0 minutter")).toBeTruthy();
    // Every row has its (decorative) bar, the 0′ row an empty one.
    const list = screen.getByRole("list", { name: no.matchPlanner.playingTime.listLabel });
    expect(within(list).getAllByTestId("playing-time-bar")).toHaveLength(NAMES.length);
    const fill = within(unused).getByTestId("playing-time-bar").firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("shows a planned match without a score and starts it through setup", async () => {
    renderDetails(serverMatch({ status: "upcoming" }));

    const hero = await screen.findByTestId("match-hero");
    expect(within(hero).queryByTestId("match-score")).toBeNull();
    expect(screen.getByRole("link", { name: no.matchPlanner.backToPlanner }).getAttribute("href")).toBe("/match");
    fireEvent.click(screen.getByRole("button", { name: no.matchPlanner.startMatchCta }));
    expect(ROUTER.push).toHaveBeenCalledWith("/match/setup?matchId=match-1");
  });

  it("edits a stored goal in a sheet and saves it", async () => {
    renderDetails(serverMatch(), [SERVER_GOAL]);

    fireEvent.click(await screen.findByRole("button", { name: /Rediger mål/ }));
    const sheet = within(await screen.findByTestId("goal-edit-sheet"));
    fireEvent.change(sheet.getByRole("combobox", { name: no.matchPlanner.event.assist }), { target: { value: "p2" } });
    fireEvent.click(sheet.getByRole("button", { name: no.matchPlanner.event.save }));

    await screen.findByText(no.matchPlanner.event.editSaved);
    const [url, init] = calls("PATCH")[0];
    expect(String(url)).toBe("/api/matches/match-1/events/ev-1");
    expect(JSON.parse(String(init?.body))).toMatchObject({ minute: 17, primaryPlayerId: "p1", secondaryPlayerId: "p2" });
  });

  it("refuses an invalid goal minute with a reason and saves nothing (C4-F5)", async () => {
    renderDetails(serverMatch(), [SERVER_GOAL]);

    fireEvent.click(await screen.findByRole("button", { name: /Rediger mål/ }));
    const sheet = within(await screen.findByTestId("goal-edit-sheet"));
    const minute = sheet.getByRole("textbox", { name: no.matchPlanner.event.minute });
    for (const bad of ["-3", "abc", "12.5", "1e3", "9007199254740992"]) {
      fireEvent.change(minute, { target: { value: bad } });
      fireEvent.click(sheet.getByRole("button", { name: no.matchPlanner.event.save }));
      expect(minute.getAttribute("aria-invalid")).toBe("true");
      expect(sheet.getByText(no.matchPlanner.event.minuteError)).toBeTruthy();
    }
    expect(calls("PATCH")).toHaveLength(0);

    // Stoppage is legitimate: no match-minute limit, only the safe-integer range.
    for (const ok of ["", "0", "12345", "9007199254740991"]) {
      fireEvent.change(minute, { target: { value: ok } });
      expect(minute.getAttribute("aria-invalid")).toBeNull();
    }
    fireEvent.change(minute, { target: { value: "93" } });
    expect(minute.getAttribute("aria-invalid")).toBeNull();
    fireEvent.click(sheet.getByRole("button", { name: no.matchPlanner.event.save }));
    await screen.findByText(no.matchPlanner.event.editSaved);
    expect(JSON.parse(String(calls("PATCH")[0][1]?.body))).toMatchObject({ minute: 93 });
  });

  it("deletes a goal only after its own confirmation", async () => {
    renderDetails(serverMatch(), [SERVER_GOAL]);

    fireEvent.click(await screen.findByRole("button", { name: /Rediger mål/ }));
    fireEvent.click(within(await screen.findByTestId("goal-edit-sheet")).getByRole("button", { name: no.matchPlanner.event.deleteGoal }));

    const confirm = within(await screen.findByTestId("goal-delete-confirm"));
    confirm.getByText("Målet i 17. minutt fjernes fra kampforløpet.");
    expect(calls("DELETE")).toHaveLength(0);

    fireEvent.click(confirm.getByRole("button", { name: no.matchPlanner.event.deleteConfirmCta }));
    await screen.findByText(no.matchPlanner.event.deleted);
    expect(String(calls("DELETE")[0][0])).toBe("/api/matches/match-1/events/ev-1");
    expect(screen.getByText(no.matchPlanner.timelineEmpty)).toBeTruthy();
  });

  it("deletes the match only after confirmation, and cancelling sends nothing", async () => {
    renderDetails(serverMatch());

    fireEvent.click(await screen.findByRole("button", { name: no.matchPlanner.delete.cta }));
    let confirm = within(await screen.findByTestId("delete-match-confirm"));
    fireEvent.click(confirm.getByRole("button", { name: no.ui.confirm.cancel }));
    await waitFor(() => expect(screen.queryByTestId("delete-match-confirm")).toBeNull());
    expect(calls("DELETE")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: no.matchPlanner.delete.cta }));
    confirm = within(await screen.findByTestId("delete-match-confirm"));
    fireEvent.click(confirm.getByRole("button", { name: no.matchPlanner.delete.confirmCta }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/historikk"));
    expect(String(calls("DELETE")[0][0])).toBe("/api/matches/match-1");
  });

  it("shows the generated summary as its own section with its regenerate action", async () => {
    renderDetails(
      serverMatch({ reportEnabled: true, reportStatus: "ready", reportText: "En fin kamp.", reportGeneratedAt: "2026-10-21T11:00:00.000Z" })
    );

    const report = within(await screen.findByTestId("match-report"));
    expect(report.getByRole("heading", { name: no.matchPlanner.reportTitle })).toBeTruthy();
    expect(report.getByText("En fin kamp.")).toBeTruthy();
    expect(report.getByRole("button", { name: no.matchPlanner.reportRegenerateCta })).toBeTruthy();
  });

  it("keeps a failed goal save in the sheet, with the reason, and the page in place", async () => {
    renderDetails(serverMatch(), [SERVER_GOAL], { failWrites: true });

    fireEvent.click(await screen.findByRole("button", { name: /Rediger mål/ }));
    const sheet = within(await screen.findByTestId("goal-edit-sheet"));
    fireEvent.click(sheet.getByRole("button", { name: no.matchPlanner.event.save }));

    expect(await sheet.findByText("Serveren svarte ikke.")).toBeTruthy();
    expect(screen.getByTestId("match-hero")).toBeTruthy();
  });

  it("returns to the goal with the reason when deleting it fails", async () => {
    renderDetails(serverMatch(), [SERVER_GOAL], { failWrites: true });

    fireEvent.click(await screen.findByRole("button", { name: /Rediger mål/ }));
    fireEvent.click(within(await screen.findByTestId("goal-edit-sheet")).getByRole("button", { name: no.matchPlanner.event.deleteGoal }));
    const confirm = within(await screen.findByTestId("goal-delete-confirm"));
    fireEvent.click(confirm.getByRole("button", { name: no.matchPlanner.event.deleteConfirmCta }));
    // A second tap while it runs sends nothing more.
    fireEvent.click(confirm.getByRole("button", { name: no.matchPlanner.event.deleteConfirmCta }));

    const sheet = within(await screen.findByTestId("goal-edit-sheet"));
    expect(await sheet.findByText("Serveren svarte ikke.")).toBeTruthy();
    expect(calls("DELETE")).toHaveLength(1);
    // Still there, behind the (modal) sheet.
    expect(screen.getByRole("list", { name: no.matchPlanner.timelineTitle, hidden: true })).toBeTruthy();
  });

  it("shows a failed match delete beside the delete row and stays on the page", async () => {
    renderDetails(serverMatch(), [], { failWrites: true });

    fireEvent.click(await screen.findByRole("button", { name: no.matchPlanner.delete.cta }));
    const confirm = within(await screen.findByTestId("delete-match-confirm"));
    fireEvent.click(confirm.getByRole("button", { name: no.matchPlanner.delete.confirmCta }));

    expect(await screen.findByText("Serveren svarte ikke.")).toBeTruthy();
    expect(ROUTER.push).not.toHaveBeenCalled();
    expect(screen.getByTestId("match-hero")).toBeTruthy();
  });
});
