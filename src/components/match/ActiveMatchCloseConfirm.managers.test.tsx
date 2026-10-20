// MATCH-03 in the real callers: "Avslutt" and "Forkast" in the planner and in
// the setup start guard are wired to the right ActiveMatchProvider action,
// only run after confirmation, never on Avbryt/Escape, and never twice.
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";
import { MatchPlannerManager } from "@/components/match/MatchPlannerManager";
import { MatchSetupManager } from "@/components/match/MatchSetupManager";
import type { MatchSetup } from "@/domain/match";
import type { Player } from "@/domain/team";
import { saveMatchSetupDraft } from "@/lib/storage/matchStorage";
import no from "../../../messages/no.json";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const PLAYERS: Player[] = ["p1", "p2", "p3", "p4", "p5", "p6"].map((id, index) => ({
  id,
  name: `Spiller ${index + 1}`,
  source: "manual",
  externalProvider: null,
  externalId: null,
  isManaged: false,
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-20T10:00:00.000Z",
}));

const TEAM = { id: "team-1", name: "Lyn G12", players: PLAYERS };
const WORKSPACE = {
  mode: "authenticated",
  isLoading: false,
  error: null,
  activeTeamId: "team-1",
  activeTeam: TEAM,
  teams: [TEAM],
};
const AUTH = { status: "authenticated" };

const MATCH_TITLE = "Lyn – Fram";
const ACTIVE_MATCH = {
  activeMatch: { title: MATCH_TITLE, serverMatchId: null } as { title: string; serverMatchId: string | null } | null,
  activeMatchHref: "/match/live",
  recoveryMatch: null,
  recoveryMatchHref: null,
  hasActiveConflict: () => true,
  forceCloseActiveMatch: vi.fn<() => Promise<void>>(),
  discardActiveMatch: vi.fn<() => Promise<void>>(),
};

vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => AUTH }));
vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({ useTeamWorkspace: () => WORKSPACE }));
vi.mock("@/components/providers/ActiveMatchProvider", () => ({ useActiveMatch: () => ACTIVE_MATCH }));

const SETUP: MatchSetup = {
  id: "setup-1",
  teamId: "team-1",
  format: "5v5",
  reportEnabled: false,
  formationId: "5v5-2-2",
  duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
  selectedPlayerIds: PLAYERS.map((player) => player.id),
  startingPlayerIds: ["p1", "p2", "p3", "p4", "p5"],
  slotAssignments: { "5v5-1": "p1", "5v5-2": "p2", "5v5-3": "p3", "5v5-4": "p4", "5v5-5": "p5" },
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-20T10:00:00.000Z",
};

const copy = no.matchClose;
const END_TITLE = `Avslutte ${MATCH_TITLE}?`;
const DISCARD_TITLE = `Forkaste ${MATCH_TITLE}?`;

/** Resolvable on demand, to hold an action "in progress". */
function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

const SURFACES = [
  {
    name: "planner",
    triggers: { end: no.matchPlanner.activeActions.end, discard: no.matchPlanner.activeActions.discard },
    render: async () => {
      renderWithIntl(<MatchPlannerManager />);
      await screen.findByRole("button", { name: no.matchPlanner.activeActions.end });
    },
  },
  {
    name: "setup start guard",
    triggers: { end: no.matchSetup.startGuard.end, discard: no.matchSetup.startGuard.discard },
    render: async () => {
      saveMatchSetupDraft(SETUP);
      renderWithIntl(<MatchSetupManager />);
      fireEvent.click(await screen.findByRole("button", { name: no.matchSetup.startMatch }));
      await screen.findByText(no.matchSetup.startGuard.title);
    },
  },
] as const;

beforeEach(() => {
  window.localStorage.clear();
  ACTIVE_MATCH.forceCloseActiveMatch.mockReset().mockResolvedValue(undefined);
  ACTIVE_MATCH.discardActiveMatch.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => json({ matches: [], events: [], connected: false }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(SURFACES)("MATCH-03 close actions in the $name", (surface) => {
  async function openSheet(kind: "end" | "discard") {
    fireEvent.click(screen.getByRole("button", { name: surface.triggers[kind] }));
    return within(await screen.findByRole("dialog", { name: kind === "end" ? END_TITLE : DISCARD_TITLE }));
  }

  async function sheetClosed() {
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }

  it("Avslutt runs forceCloseActiveMatch only after confirmation, and never discards", async () => {
    await surface.render();

    const sheet = await openSheet("end");
    expect(ACTIVE_MATCH.forceCloseActiveMatch).not.toHaveBeenCalled();
    sheet.getByText(copy.end.description);

    fireEvent.click(sheet.getByRole("button", { name: copy.end.confirm }));
    await sheetClosed();

    expect(ACTIVE_MATCH.forceCloseActiveMatch).toHaveBeenCalledTimes(1);
    expect(ACTIVE_MATCH.discardActiveMatch).not.toHaveBeenCalled();
  });

  it("Forkast runs discardActiveMatch only after confirmation, and never ends", async () => {
    await surface.render();

    const sheet = await openSheet("discard");
    expect(ACTIVE_MATCH.discardActiveMatch).not.toHaveBeenCalled();
    sheet.getByText(copy.discard.description);

    fireEvent.click(sheet.getByRole("button", { name: copy.discard.confirm }));
    await sheetClosed();

    expect(ACTIVE_MATCH.discardActiveMatch).toHaveBeenCalledTimes(1);
    expect(ACTIVE_MATCH.forceCloseActiveMatch).not.toHaveBeenCalled();
  });

  it.each(["end", "discard"] as const)(
    "Behold kampen and Escape never end or discard (%s)",
    async (kind) => {
      await surface.render();

      const viaCancel = await openSheet(kind);
      fireEvent.click(viaCancel.getByRole("button", { name: copy.cancel }));
      await sheetClosed();

      await openSheet(kind);
      const dialog = screen.getByRole("dialog");
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
      await sheetClosed();

      expect(ACTIVE_MATCH.forceCloseActiveMatch).not.toHaveBeenCalled();
      expect(ACTIVE_MATCH.discardActiveMatch).not.toHaveBeenCalled();
      // The match is still there to act on.
      expect(screen.getByRole("button", { name: surface.triggers[kind] })).toBeTruthy();
    }
  );

  it.each(["end", "discard"] as const)(
    "a confirmation cannot be sent twice while the action runs (%s)",
    async (kind) => {
      const action = kind === "end" ? ACTIVE_MATCH.forceCloseActiveMatch : ACTIVE_MATCH.discardActiveMatch;
      const running = deferred();
      action.mockReturnValue(running.promise);
      await surface.render();

      const sheet = await openSheet(kind);
      const confirm = sheet.getByRole("button", { name: copy[kind].confirm });
      fireEvent.click(confirm);
      await waitFor(() => expect(confirm.getAttribute("aria-disabled")).toBe("true"));
      fireEvent.click(confirm);
      fireEvent.keyDown(confirm, { key: "Enter" });
      fireEvent.click(confirm);

      // The triggers behind the sheet are disabled too, so it cannot be reopened.
      expect(
        (screen.getByRole("button", { name: surface.triggers[kind], hidden: true }) as HTMLButtonElement).disabled
      ).toBe(true);
      expect(action).toHaveBeenCalledTimes(1);

      running.resolve();
      await sheetClosed();
      expect(action).toHaveBeenCalledTimes(1);
      expect(ACTIVE_MATCH.forceCloseActiveMatch.mock.calls.length + ACTIVE_MATCH.discardActiveMatch.mock.calls.length).toBe(1);
    }
  );
});
