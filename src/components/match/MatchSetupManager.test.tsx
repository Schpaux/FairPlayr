import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchSetupManager } from "@/components/match/MatchSetupManager";
import type { MatchSetup } from "@/domain/match";
import type { Player } from "@/domain/team";
import { getStoredMatchSetup, saveMatchSetupDraft } from "@/lib/storage/matchStorage";
import en from "../../../messages/en.json";

const routerPush = vi.fn();
const ROUTER = { push: routerPush };
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ROUTER,
}));

const PLAYERS: Player[] = ["p1", "p2", "p3", "p4", "p5", "p6"].map((id, index) => ({
  id,
  name: `Player ${index + 1}`,
  source: "manual",
  externalProvider: null,
  externalId: null,
  isManaged: false,
  createdAt: "2026-04-15T10:00:00.000Z",
  updatedAt: "2026-04-15T10:00:00.000Z",
}));

const TEAM = { id: "team-1", name: "Local team", players: PLAYERS };
const WORKSPACE = { isLoading: false, error: null, activeTeamId: "team-1", activeTeam: TEAM, teams: [TEAM] };

vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({
  useTeamWorkspace: () => WORKSPACE,
}));

const ACTIVE_MATCH = {
  activeMatch: null,
  activeMatchHref: "/match/live?recovery=1",
  hasActiveConflict: () => false,
  forceCloseActiveMatch: vi.fn(),
  discardActiveMatch: vi.fn(),
};

vi.mock("@/components/providers/ActiveMatchProvider", () => ({
  useActiveMatch: () => ACTIVE_MATCH,
}));

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

function renderManager() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MatchSetupManager />
    </NextIntlClientProvider>
  );
}

describe("MatchSetupManager start match", () => {
  beforeEach(() => {
    window.localStorage.clear();
    saveMatchSetupDraft(SETUP);
    routerPush.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("stores no server match id for a guest/local-only match started through Kamper", async () => {
    searchParams = new URLSearchParams();
    renderManager();

    fireEvent.click(await screen.findByRole("button", { name: en.matchSetup.startMatch }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/live"));
    expect(getStoredMatchSetup()).toMatchObject({ status: "active", serverMatchId: null });
  });

  it("stores the server match id with the local setup for a server-backed match", async () => {
    searchParams = new URLSearchParams("matchId=match-1");
    renderManager();

    fireEvent.click(await screen.findByRole("button", { name: en.matchSetup.startMatch }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/match/live?matchId=match-1"));
    expect(getStoredMatchSetup()).toMatchObject({ status: "active", serverMatchId: "match-1" });
  });
});
