// UI-A11Y-02: deleting a team or a player is confirmed in a sheet that says
// what is lost (no window.confirm).
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";
import { TeamManager } from "@/components/team/TeamManager";
import type { Team } from "@/domain/team";
import no from "../../../messages/no.json";

const team: Team = {
  id: "team-1",
  name: "Lyn G12",
  players: [
    { id: "p1", name: "Emma", createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z" },
    { id: "p2", name: "Selma", createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z" },
  ],
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
} as Team;

const workspace = {
  mode: "guest-local" as "guest-local" | "cloud",
  isLoading: false,
  error: null,
  teams: [team],
  activeTeamId: team.id,
  activeTeam: team,
  deleteTeam: vi.fn(() => Promise.resolve()),
  deletePlayer: vi.fn(() => Promise.resolve(team)),
};

vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({ useTeamWorkspace: () => workspace }));
vi.mock("@/components/team/useSpondStatus", () => ({ useSpondStatus: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

beforeEach(() => {
  window.localStorage.clear();
  workspace.mode = "guest-local";
  workspace.deleteTeam.mockClear();
  workspace.deletePlayer.mockClear();
});

afterEach(cleanup);

describe("TeamManager deletions", () => {
  it("deletes a player only after the confirmation, which names the player", async () => {
    renderWithIntl(<TeamManager />);

    fireEvent.click(screen.getAllByRole("button", { name: no.common.delete })[0]);
    const sheet = within(await screen.findByRole("dialog", { name: "Slette Emma?" }));
    sheet.getByText("Emma fjernes fra spillerlisten til laget. Dette kan ikke angres.");
    expect(workspace.deletePlayer).not.toHaveBeenCalled();

    fireEvent.click(sheet.getByRole("button", { name: no.team.deletePlayerConfirm.confirm }));
    await waitFor(() => expect(workspace.deletePlayer).toHaveBeenCalledWith("team-1", "p1"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the player when the coach cancels", async () => {
    renderWithIntl(<TeamManager />);

    fireEvent.click(screen.getAllByRole("button", { name: no.common.delete })[1]);
    const sheet = within(await screen.findByRole("dialog", { name: "Slette Selma?" }));
    fireEvent.click(sheet.getByRole("button", { name: no.ui.confirm.cancel }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(workspace.deletePlayer).not.toHaveBeenCalled();
  });

  it("states what a team deletion removes on this device, with the player count", async () => {
    renderWithIntl(<TeamManager />);

    fireEvent.click(screen.getByRole("button", { name: no.team.teamSettings }));
    fireEvent.click(await screen.findByRole("button", { name: no.team.actions.deleteTeam }));
    const sheet = within(await screen.findByRole("dialog", { name: "Slette Lyn G12?" }));
    sheet.getByText("Laget og alle 2 spillerne slettes fra denne enheten. Dette kan ikke angres.");
    expect(workspace.deleteTeam).not.toHaveBeenCalled();

    fireEvent.click(sheet.getByRole("button", { name: no.team.deleteTeamConfirm.confirm }));
    await waitFor(() => expect(workspace.deleteTeam).toHaveBeenCalledWith("team-1"));
  });

  it("says that a cloud team's matches and history go too", async () => {
    workspace.mode = "cloud";
    renderWithIntl(<TeamManager />);

    fireEvent.click(screen.getByRole("button", { name: no.team.teamSettings }));
    fireEvent.click(await screen.findByRole("button", { name: no.team.actions.deleteTeam }));
    const sheet = within(await screen.findByRole("dialog", { name: "Slette Lyn G12?" }));
    sheet.getByText(
      "Laget, alle 2 spillerne og alle kampene til laget slettes, også kamphistorikken og Spond-koblingen. Dette kan ikke angres."
    );
  });
});
