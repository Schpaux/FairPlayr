// C1 (UI-MS-01a, planner): a match in progress comes first, the «Aktivt lag»
// card and the subtitle are gone, Avslutt/Forkast still go through the
// confirmation sheet, and the guest (signed-out) planner still renders.
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";
import { MatchPlannerManager } from "@/components/match/MatchPlannerManager";
import no from "../../../messages/no.json";

const planner = no.matchPlanner;

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const TEAM = { id: "team-1", name: "Lyn G12", players: [] };
const SIGNED_IN = {
  auth: { status: "authenticated" },
  workspace: { mode: "authenticated", isLoading: false, error: null, activeTeamId: "team-1", activeTeam: TEAM, teams: [TEAM] },
};
const GUEST = {
  auth: { status: "unauthenticated" },
  workspace: { mode: "guest-local", isLoading: false, error: null, activeTeamId: "team-1", activeTeam: TEAM, teams: [TEAM] },
};

let session: typeof SIGNED_IN | typeof GUEST = SIGNED_IN;
let storedSetupStatus: string | null = null;

const DEVICE_TITLE = "Lyn – Fram";
const ACTIVE_MATCH = {
  activeMatch: null as { title: string; serverMatchId: string | null } | null,
  activeMatchHref: "/match/live",
  forceCloseActiveMatch: vi.fn<() => Promise<void>>(),
  discardActiveMatch: vi.fn<() => Promise<void>>(),
};

vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => session.auth }));
vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({ useTeamWorkspace: () => session.workspace }));
vi.mock("@/components/providers/ActiveMatchProvider", () => ({ useActiveMatch: () => ACTIVE_MATCH }));
vi.mock("@/lib/storage/matchStorage", () => ({
  getStoredMatchSetup: () => (storedSetupStatus ? { status: storedSetupStatus } : null),
}));

const LIVE_ELSEWHERE = {
  id: "m-live",
  title: "Lyn – Skeid",
  opponentName: "Skeid",
  startsAt: "2026-10-22T10:00:00.000Z",
  location: null,
  status: "live",
  source: "manual",
};
const PLANNED = {
  id: "m-planned",
  title: "Lyn – Vålerenga",
  opponentName: "Vålerenga",
  startsAt: "2026-10-29T10:00:00.000Z",
  location: "Kringsjå",
  status: "upcoming",
  source: "spond",
};

let serverMatches: unknown[] = [];

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
  session = SIGNED_IN;
  storedSetupStatus = null;
  serverMatches = [];
  ACTIVE_MATCH.activeMatch = null;
  ACTIVE_MATCH.forceCloseActiveMatch.mockReset().mockResolvedValue(undefined);
  ACTIVE_MATCH.discardActiveMatch.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/matches")) return json({ matches: serverMatches });
      if (url.startsWith("/api/integrations/spond/status")) return json({ connected: false, teamLink: null });
      return json({});
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** True when `a` comes before `b` in document order. */
function isBefore(a: Element, b: Element) {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

async function renderSignedIn() {
  renderWithIntl(<MatchPlannerManager />);
  // The new-match form is ready once the entry mode has resolved.
  await screen.findByRole("button", { name: planner.createCta });
}

describe("MatchPlannerManager (signed in)", () => {
  it("shows the match in progress first, directly under the title and before the new-match form", async () => {
    ACTIVE_MATCH.activeMatch = { title: DEVICE_TITLE, serverMatchId: null };
    serverMatches = [LIVE_ELSEWHERE, PLANNED];
    await renderSignedIn();
    await screen.findByText(LIVE_ELSEWHERE.title);

    const title = screen.getByRole("heading", { level: 1, name: planner.title });
    const ongoing = screen.getByTestId("planner-ongoing");
    const newMatch = screen.getByTestId("planner-new-match");
    const planned = screen.getByTestId("planner-planned");

    expect(isBefore(title, ongoing)).toBe(true);
    expect(isBefore(ongoing, newMatch)).toBe(true);
    expect(isBefore(newMatch, planned)).toBe(true);
    // Nothing sits between the title and the ongoing section.
    expect(title.parentElement?.parentElement?.nextElementSibling).toBe(ongoing);

    const section = within(ongoing);
    section.getByRole("heading", { name: planner.ongoingTitle });
    section.getByText(DEVICE_TITLE);
    expect(section.getByRole("link", { name: planner.activeActions.continue }).getAttribute("href")).toBe("/match/live");
    // Another live match opens its own page.
    expect(section.getByRole("link", { name: planner.ongoingResolve }).getAttribute("href")).toBe("/match/m-live");

    // The planned match is listed below the form, linking to its page.
    const plannedLink = within(planned).getByRole("link", { name: new RegExp(PLANNED.title) });
    expect(plannedLink.getAttribute("href")).toBe("/match/m-planned");
    // Lime belongs to "Fortsett" while a match is in progress, not to "Opprett kamp".
    expect(screen.getByRole("button", { name: planner.createCta }).className).not.toMatch(/primary/);
  });

  it("has no «Aktivt lag» card and no subtitle", async () => {
    ACTIVE_MATCH.activeMatch = { title: DEVICE_TITLE, serverMatchId: null };
    await renderSignedIn();

    expect(screen.queryByText(/Aktivt lag/)).toBeNull();
    expect(screen.queryByText(no.matchPlanner.activeTeam.replace("{name}", TEAM.name))).toBeNull();
    expect(screen.queryByText(planner.subtitle)).toBeNull();
    expect(screen.queryByText(TEAM.name)).toBeNull();
  });

  it("shows no ongoing section when nothing is in progress, and the create button is the next action", async () => {
    serverMatches = [PLANNED];
    await renderSignedIn();
    await screen.findByText(PLANNED.title);

    expect(screen.queryByTestId("planner-ongoing")).toBeNull();
    expect(screen.queryByRole("button", { name: planner.activeActions.end })).toBeNull();
    expect(screen.getByRole("button", { name: planner.createCta }).className).toMatch(/primary/);
  });

  it.each([
    ["end", planner.activeActions.end, `Avslutte ${DEVICE_TITLE}?`, no.matchClose.end.confirm],
    ["discard", planner.activeActions.discard, `Forkaste ${DEVICE_TITLE}?`, no.matchClose.discard.confirm],
  ] as const)("%s goes through the confirmation sheet", async (kind, trigger, sheetTitle, confirm) => {
    ACTIVE_MATCH.activeMatch = { title: DEVICE_TITLE, serverMatchId: null };
    await renderSignedIn();
    const run = kind === "end" ? ACTIVE_MATCH.forceCloseActiveMatch : ACTIVE_MATCH.discardActiveMatch;
    const other = kind === "end" ? ACTIVE_MATCH.discardActiveMatch : ACTIVE_MATCH.forceCloseActiveMatch;

    fireEvent.click(within(screen.getByTestId("planner-ongoing")).getByRole("button", { name: trigger }));
    const sheet = within(await screen.findByRole("dialog", { name: sheetTitle }));
    expect(run).not.toHaveBeenCalled();

    fireEvent.click(sheet.getByRole("button", { name: confirm }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(run).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it("keeps the manual / Spond choice and the now / scheduled choice", async () => {
    await renderSignedIn();

    const manual = screen.getByRole("radio", { name: planner.mode.manual }) as HTMLInputElement;
    expect(manual.checked).toBe(true);
    expect(screen.queryByLabelText(planner.fields.startsAt)).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: planner.manualStart.scheduled }));
    expect(screen.getByLabelText(planner.fields.startsAt)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: planner.mode.spond }));
    await screen.findByText(planner.mode.spondNotLinkedTitle);
    expect(screen.getByRole("link", { name: planner.mode.spondGoToSettings }).getAttribute("href")).toBe("/settings");
  });
});

describe("MatchPlannerManager (guest)", () => {
  beforeEach(() => {
    session = GUEST;
  });

  it("still renders the guest planner without calling the API", async () => {
    renderWithIntl(<MatchPlannerManager />);

    await screen.findByRole("heading", { level: 1, name: planner.title });
    screen.getByText(planner.guest.title);
    screen.getByText(planner.guest.cloudHint);
    expect(screen.getByRole("link", { name: planner.guest.startCta }).getAttribute("href")).toBe("/match/setup");
    expect(screen.queryByRole("link", { name: planner.guest.resumeCta })).toBeNull();
    expect(screen.queryByText(planner.subtitle)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("puts the match in progress on this device first", async () => {
    storedSetupStatus = "active";
    renderWithIntl(<MatchPlannerManager />);

    const resume = await screen.findByRole("link", { name: planner.guest.resumeCta });
    expect(resume.getAttribute("href")).toBe("/match/live");
    const start = screen.getByRole("link", { name: planner.guest.startCta });
    expect(isBefore(resume, start)).toBe(true);
    // Lime is the next action: resuming, not starting another.
    expect(resume.className).toMatch(/primary/);
    expect(start.className).not.toMatch(/primary/);
  });

  it("asks for a team when the guest has none", async () => {
    session = { ...GUEST, workspace: { ...GUEST.workspace, activeTeamId: null as unknown as string, activeTeam: null as unknown as typeof TEAM } };
    renderWithIntl(<MatchPlannerManager />);

    await screen.findByText(planner.noTeamTitle);
    expect(screen.getByRole("link", { name: planner.goToTeam }).getAttribute("href")).toBe("/team");
  });
});
