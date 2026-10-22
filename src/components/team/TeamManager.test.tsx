// UI-A11Y-02: deleting a team or a player is confirmed in a sheet that says
// what is lost (no window.confirm).
// UI-TEAM-01: players are full-name rows that open an edit sheet; delete sits
// at the bottom of that sheet, reordering is its own mode, Spond players stay
// read-only.
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";
import { TeamManager } from "@/components/team/TeamManager";
import type { Player, Team } from "@/domain/team";
import no from "../../../messages/no.json";

const T0 = "2026-10-01T10:00:00.000Z";
const player = (id: string, name: string, extra: Partial<Player> = {}): Player => ({
  id,
  name,
  source: "manual",
  externalProvider: null,
  externalId: null,
  isManaged: false,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});

const team: Team = {
  id: "team-1",
  name: "Lyn G12",
  players: [player("p1", "Emma"), player("p2", "Selma")],
  createdAt: T0,
  updatedAt: T0,
};

const workspace = {
  mode: "guest-local" as "guest-local" | "cloud",
  isLoading: false,
  error: null,
  teams: [team],
  activeTeamId: team.id,
  activeTeam: team,
  deleteTeam: vi.fn(() => Promise.resolve()),
  deletePlayer: vi.fn(() => Promise.resolve(team)),
  addPlayer: vi.fn(() => Promise.resolve(team)),
  renamePlayer: vi.fn((): Promise<Team> => Promise.resolve(team)),
  reorderPlayer: vi.fn(() => Promise.resolve(team)),
};

const setPlayers = (players: Player[]) => {
  team.players = players;
};

vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({ useTeamWorkspace: () => workspace }));
vi.mock("@/components/team/useSpondStatus", () => ({ useSpondStatus: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

beforeEach(() => {
  window.localStorage.clear();
  workspace.mode = "guest-local";
  setPlayers([player("p1", "Emma"), player("p2", "Selma")]);
  workspace.deleteTeam.mockClear();
  workspace.deletePlayer.mockClear();
  workspace.renamePlayer.mockReset();
  workspace.renamePlayer.mockImplementation(() => Promise.resolve(team));
  workspace.addPlayer.mockClear();
  workspace.reorderPlayer.mockClear();
});

afterEach(cleanup);

const playerList = () => within(screen.getByRole("list", { name: no.team.players.listLabel }));

async function openDeleteFor(name: string) {
  fireEvent.click(playerList().getByRole("button", { name: new RegExp(`^${name}`) }));
  const edit = within(await screen.findByRole("dialog", { name: no.team.editPlayer.title }));
  fireEvent.click(edit.getByRole("button", { name: no.team.editPlayer.deleteLabel }));
}

describe("TeamManager deletions", () => {
  it("deletes a player only after the confirmation, which names the player", async () => {
    renderWithIntl(<TeamManager />);

    await openDeleteFor("Emma");
    const sheet = within(await screen.findByRole("dialog", { name: "Slette Emma?" }));
    sheet.getByText("Emma fjernes fra spillerlisten til laget. Dette kan ikke angres.");
    expect(workspace.deletePlayer).not.toHaveBeenCalled();

    fireEvent.click(sheet.getByRole("button", { name: no.team.deletePlayerConfirm.confirm }));
    await waitFor(() => expect(workspace.deletePlayer).toHaveBeenCalledWith("team-1", "p1"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status").textContent).toBe("Emma er slettet.");
  });

  it("keeps the player when the coach cancels", async () => {
    renderWithIntl(<TeamManager />);

    await openDeleteFor("Selma");
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

describe("TeamManager player list (UI-TEAM-01)", () => {
  it("shows full names and numbers, and no delete or move control in the list", () => {
    setPlayers([
      player("p1", "Emma Haugen", { number: 7 }),
      player("p2", "Emma Hansen", { number: 12 }),
      player("p3", "Kristoffer Alexander Bergersen-Solheim"),
    ]);
    renderWithIntl(<TeamManager />);

    const list = playerList();
    list.getByRole("button", { name: "Emma Haugen, nummer 7" });
    list.getByRole("button", { name: "Emma Hansen, nummer 12" });
    list.getByRole("button", { name: "Kristoffer Alexander Bergersen-Solheim" });
    expect(list.queryByRole("button", { name: no.common.delete })).toBeNull();
    expect(screen.queryByRole("button", { name: /Flytt/ })).toBeNull();
  });

  it("renames a player in the edit sheet", async () => {
    renderWithIntl(<TeamManager />);

    fireEvent.click(playerList().getByRole("button", { name: "Emma" }));
    const sheet = within(await screen.findByRole("dialog", { name: no.team.editPlayer.title }));
    const input = sheet.getByLabelText(no.team.forms.playerNameLabel);
    expect((input as HTMLInputElement).value).toBe("Emma");
    fireEvent.change(input, { target: { value: "  Emma Berg " } });
    fireEvent.click(sheet.getByRole("button", { name: no.common.save }));

    await waitFor(() => expect(workspace.renamePlayer).toHaveBeenCalledWith("team-1", "p1", "Emma Berg"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the sheet open with an error for an empty or taken name", async () => {
    renderWithIntl(<TeamManager />);

    fireEvent.click(playerList().getByRole("button", { name: "Emma" }));
    const sheet = within(await screen.findByRole("dialog", { name: no.team.editPlayer.title }));
    const input = sheet.getByLabelText(no.team.forms.playerNameLabel);

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(sheet.getByRole("button", { name: no.common.save }));
    expect((await sheet.findByRole("alert")).textContent).toBe(no.team.validation.playerNameRequired);
    expect(input.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(input, { target: { value: "selma" } });
    fireEvent.click(sheet.getByRole("button", { name: no.common.save }));
    await waitFor(() => expect(sheet.getByRole("alert").textContent).toBe(no.team.validation.playerNameDuplicate));
    expect(workspace.renamePlayer).not.toHaveBeenCalled();
    screen.getByRole("dialog", { name: no.team.editPlayer.title });
  });

  it("saves once on a double submit, and reports a failed save in the sheet, not as a taken name", async () => {
    let fail: (error: Error) => void = () => {};
    workspace.renamePlayer.mockImplementationOnce(() => new Promise<Team>((_, reject) => (fail = reject)));
    renderWithIntl(<TeamManager />);

    fireEvent.click(playerList().getByRole("button", { name: "Emma" }));
    const sheet = within(await screen.findByRole("dialog", { name: no.team.editPlayer.title }));
    const input = sheet.getByLabelText(no.team.forms.playerNameLabel);
    fireEvent.change(input, { target: { value: "Emma Berg" } });
    const save = sheet.getByRole("button", { name: no.common.save });
    fireEvent.click(save);
    fireEvent.click(save);
    fireEvent.submit(input.closest("form")!);
    expect(workspace.renamePlayer).toHaveBeenCalledTimes(1);

    fail(new Error("storage full"));
    await waitFor(() => expect(sheet.getByRole("alert").textContent).toBe(no.team.errors.generic));
    expect(document.activeElement).toBe(input);
    screen.getByRole("dialog", { name: no.team.editPlayer.title });
  });

  it("announces an added player", async () => {
    renderWithIntl(<TeamManager />);
    fireEvent.change(screen.getByLabelText(no.team.forms.playerNameLabel), { target: { value: "Nora" } });
    fireEvent.click(screen.getByRole("button", { name: no.team.actions.addPlayer }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Nora er lagt til."));
    expect(workspace.addPlayer).toHaveBeenCalledWith("team-1", "Nora");
  });

  it("opens a Spond player read-only: no name field and no delete", async () => {
    workspace.mode = "cloud";
    setPlayers([
      player("p1", "Emma", { source: "spond", isManaged: true, externalProvider: "spond", externalId: "s1" }),
      player("p2", "Selma"),
    ]);
    renderWithIntl(<TeamManager />);

    fireEvent.click(playerList().getByRole("button", { name: new RegExp(`^Emma,\\s?${no.team.players.spondRow}$`) }));
    const sheet = within(await screen.findByRole("dialog", { name: "Emma" }));
    expect(sheet.queryByRole("textbox")).toBeNull();
    expect(sheet.queryByRole("button", { name: no.team.editPlayer.deleteLabel })).toBeNull();
    // Cloud teams have no reorder mode.
    expect(screen.queryByRole("button", { name: no.team.players.reorder })).toBeNull();
  });

  it("moves players only in the reorder mode, and announces the new position", async () => {
    renderWithIntl(<TeamManager />);

    fireEvent.click(screen.getByRole("button", { name: no.team.players.reorder }));
    // The add field gives way to the mode's hint, and rows no longer open the sheet.
    expect(screen.queryByLabelText(no.team.forms.playerNameLabel)).toBeNull();
    screen.getByText(no.team.players.reorderHint);

    fireEvent.click(screen.getByRole("button", { name: "Flytt Emma ned" }));
    await waitFor(() => expect(workspace.reorderPlayer).toHaveBeenCalledWith("team-1", "p1", "down"));
    await screen.findByText("Emma er nå nummer 2 av 2.");

    // The first row cannot move up: nothing is saved, and the coach is told why.
    const up = screen.getByRole("button", { name: "Flytt Emma opp" });
    expect(up.getAttribute("aria-disabled")).toBe("true");
    workspace.reorderPlayer.mockClear();
    fireEvent.click(up);
    await screen.findByText("Emma står allerede først.");
    expect(workspace.reorderPlayer).not.toHaveBeenCalled();

    // A failed move announces nothing.
    workspace.reorderPlayer.mockImplementationOnce(() => Promise.reject(new Error("nope")));
    fireEvent.click(screen.getByRole("button", { name: "Flytt Selma opp" }));
    await screen.findByRole("alert");
    expect(screen.queryByText(/Selma er nå nummer/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: no.team.players.reorderDone }));
    screen.getByLabelText(no.team.forms.playerNameLabel);
    expect(screen.queryByRole("button", { name: "Flytt Emma ned" })).toBeNull();
  });

  it("shows a neutral empty state with no reorder button for a team without players", () => {
    setPlayers([]);
    renderWithIntl(<TeamManager />);

    screen.getByRole("heading", { name: no.team.players.emptyTitle });
    screen.getByText(no.team.players.emptyDescription);
    expect(screen.queryByRole("button", { name: no.team.players.reorder })).toBeNull();
    screen.getByLabelText(no.team.forms.playerNameLabel);
  });

  it("gives every form field a unique id, also with both team-name forms open", async () => {
    renderWithIntl(<TeamManager />);
    fireEvent.click(screen.getByRole("button", { name: no.team.teamSettings }));
    fireEvent.click(await screen.findByRole("button", { name: no.common.edit }));

    const ids = [...document.querySelectorAll("input")].map((input) => input.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getAllByLabelText(no.team.forms.teamNameLabel)).toHaveLength(2);
  });
});
