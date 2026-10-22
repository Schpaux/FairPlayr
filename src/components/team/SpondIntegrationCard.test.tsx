// UI-SPOND-01: Spond presentation. The requests (endpoints, methods, bodies
// and their order) are the same as before the redesign; these tests pin them.
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";
import { SpondIntegrationCard } from "@/components/team/SpondIntegrationCard";
import no from "../../../messages/no.json";

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

const s = no.team.spond;

type Route = (init?: RequestInit) => unknown | Promise<unknown>;

const ok = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) }) as Response;

const linkedStatus = {
  connected: true,
  accountLabel: "trener@example.no",
  teamLink: {
    externalTeamId: "g1",
    externalTeamName: "Lyn G12 Spond",
    membersLastSyncedAt: null,
    eventsLastSyncedAt: null,
  },
};

const candidates = [
  {
    externalId: "a",
    name: "Emma Haugen",
    email: null,
    alreadyImported: false,
    existingPlayerId: null,
    existingPlayerName: null,
    status: "new",
    importClassification: "likely_player",
    recommendedSelected: true,
    selectable: true,
  },
  {
    externalId: "b",
    name: "Trener Tom",
    email: null,
    alreadyImported: false,
    existingPlayerId: null,
    existingPlayerName: null,
    status: "new",
    importClassification: "likely_staff",
    recommendedSelected: false,
    selectable: true,
  },
  {
    externalId: "c",
    name: "Selma Berg",
    email: null,
    alreadyImported: true,
    existingPlayerId: "p3",
    existingPlayerName: "Selma Berg",
    status: "already-imported",
    importClassification: "likely_player",
    recommendedSelected: false,
    selectable: false,
  },
];

let routes: Record<string, Route>;
const calls: { key: string; body: unknown }[] = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const key = `${init?.method ?? "GET"} ${url.split("?")[0]}`;
  calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  const route = routes[key];
  if (!route) throw new Error(`unexpected request ${key}`);
  const result = await route(init);
  return result instanceof Error ? Promise.reject(result) : (result as Response);
});

const onImported = vi.fn(() => Promise.resolve());

beforeEach(() => {
  calls.length = 0;
  onImported.mockClear();
  onImported.mockImplementation(() => {
    calls.push({ key: "onImported", body: undefined });
    return Promise.resolve();
  });
  routes = {
    "GET /api/integrations/spond/status": () => ok(linkedStatus),
    "GET /api/integrations/spond/groups": () => ok({ groups: [{ id: "g1", name: "Lyn G12 Spond", memberCount: 14 }] }),
    "GET /api/integrations/spond/import-members/preview": () => ok({ candidates }),
    "POST /api/integrations/spond/import-members": () =>
      ok({ created: 2, reused: 0, updated: 0, reactivated: 0, skipped: 0, totalSelected: 2, syncedAt: "2026-10-22T10:00:00.000Z" }),
    "POST /api/integrations/spond/reset": () =>
      ok({ action: "delete-imported-data", playersInactivated: 6, spondMatchesDeleted: 1, rsvpSnapshotsDeleted: 0, eventLinksDeleted: 1, disconnected: false }),
  };
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderCard = (spondPlayerCount?: number) =>
  renderWithIntl(<SpondIntegrationCard teamId="team-1" mode="cloud" onImported={onImported} spondPlayerCount={spondPlayerCount} />);

describe("SpondIntegrationCard status", () => {
  it("says it is checking until the status answers, then shows account, group and sync times", async () => {
    let answer: (response: Response) => void = () => {};
    routes["GET /api/integrations/spond/status"] = () => new Promise<Response>((r) => (answer = r));
    renderCard(6);

    const status = screen.getByRole("group", { name: s.statusGroupLabel });
    expect(status.textContent).toContain(s.statusChecking);
    // No sign-in form while it is still checking.
    expect(screen.queryByLabelText(s.emailLabel)).toBeNull();

    answer(ok(linkedStatus));
    await waitFor(() => expect(status.textContent).toContain(s.statusConnected));
    expect(status.textContent).toContain("Konto: trener@example.no");
    expect(status.textContent).toContain("Koblet gruppe: Lyn G12 Spond");
    expect(status.textContent).toContain("Spillere sist importert: Ikke oppdatert ennå");
  });

  it("says it could not check, not 'not connected', when the status request fails", async () => {
    routes["GET /api/integrations/spond/status"] = () => new TypeError("offline");
    renderCard();

    const status = screen.getByRole("group", { name: s.statusGroupLabel });
    await waitFor(() => expect(status.textContent).toContain(s.statusUnavailable));
    expect(status.textContent).not.toContain(s.statusDisconnected);
    expect(screen.queryByLabelText(s.emailLabel)).toBeNull();
    await screen.findByRole("alert");
  });

  it("shows a sign-in form with visible labels and one primary action when not connected", async () => {
    routes["GET /api/integrations/spond/status"] = () => ok({ connected: false, accountLabel: null, teamLink: null });
    renderCard();

    const email = await screen.findByLabelText(s.emailLabel);
    expect(screen.getByText(s.emailLabel).tagName).toBe("LABEL");
    screen.getByLabelText(s.passwordLabel);
    expect(screen.getByRole("group", { name: s.statusGroupLabel }).textContent).toContain(s.statusDisconnected);

    routes["POST /api/integrations/spond/connect"] = () => ok({ accountLabel: "trener@example.no" });
    fireEvent.change(email, { target: { value: "trener@example.no" } });
    fireEvent.change(screen.getByLabelText(s.passwordLabel), { target: { value: "hemmelig" } });
    fireEvent.click(screen.getByRole("button", { name: s.connectCta }));

    await waitFor(() =>
      expect(calls.find((call) => call.key === "POST /api/integrations/spond/connect")?.body).toEqual({
        email: "trener@example.no",
        password: "hemmelig",
      })
    );
  });
});

describe("SpondIntegrationCard «Fra Spond» summary", () => {
  it("states how many players came from Spond and that they are read-only, with no match count", async () => {
    renderCard(6);
    const summary = await screen.findByTestId("spond-summary");
    expect(summary.textContent).toBe("6 spillere er importert fra Spond.");
    screen.getByText(s.summaryReadOnly);
    expect(summary.parentElement?.textContent).not.toMatch(/kamp/i);
  });

  it("uses singular, zero and no-number forms", async () => {
    const { unmount } = renderCard(1);
    expect((await screen.findByTestId("spond-summary")).textContent).toBe("1 spiller er importert fra Spond.");
    unmount();

    const zero = renderCard(0);
    expect((await screen.findByTestId("spond-summary")).textContent).toBe("Ingen spillere er importert fra Spond ennå.");
    zero.unmount();

    renderCard();
    expect((await screen.findByTestId("spond-summary")).textContent).toBe(s.summaryNoCount);
  });
});

describe("SpondIntegrationCard import sheet", () => {
  it("selects all, clears, counts in the import button, and posts the same body as before", async () => {
    renderCard(6);

    fireEvent.click(await screen.findByRole("button", { name: s.syncMembersCta }));
    const sheet = within(await screen.findByRole("dialog", { name: s.preview.title }));
    await sheet.findByRole("checkbox", { name: /Emma Haugen/ });

    // The recommendation is preselected; an already imported person cannot be picked.
    expect((sheet.getByRole("checkbox", { name: /Emma Haugen/ }) as HTMLInputElement).checked).toBe(true);
    expect((sheet.getByRole("checkbox", { name: /Trener Tom/ }) as HTMLInputElement).checked).toBe(false);
    expect((sheet.getByRole("checkbox", { name: /Selma Berg/ }) as HTMLInputElement).disabled).toBe(true);
    sheet.getByRole("button", { name: "Importer 1 spiller" });

    fireEvent.click(sheet.getByRole("button", { name: s.preview.selectAll }));
    sheet.getByRole("button", { name: "Importer 2 spillere" });

    fireEvent.click(sheet.getByRole("button", { name: s.preview.clearAll }));
    expect((sheet.getByRole("button", { name: "Importer" }) as HTMLButtonElement).disabled).toBe(true);

    // The whole row is the label: tapping the name toggles the checkbox.
    fireEvent.click(sheet.getByText("Trener Tom"));
    expect((sheet.getByRole("checkbox", { name: /Trener Tom/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(sheet.getByText("Emma Haugen"));
    sheet.getByRole("button", { name: "Importer 2 spillere" });
    expect(calls.some((call) => call.key === "POST /api/integrations/spond/import-members")).toBe(false);

    fireEvent.click(sheet.getByRole("button", { name: "Importer 2 spillere" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const post = calls.find((call) => call.key === "POST /api/integrations/spond/import-members");
    expect(post?.body).toEqual({ teamId: "team-1", selectedExternalIds: ["b", "a"] });
    expect(calls.map((call) => call.key).slice(-1)).toEqual(["onImported"]);
    expect(onImported).toHaveBeenCalledTimes(1);
    expect((await screen.findByTestId("spond-notice")).textContent).toContain("Spillere importert: 2 nye");
    // Many role queries in one open dialog are slow in jsdom.
  }, 20_000);

  it("keeps the sheet open with the error next to the import button when the import fails", async () => {
    routes["POST /api/integrations/spond/import-members"] = () =>
      ({ ok: false, json: () => Promise.resolve({ errorCode: "NO_SELECTED_MEMBERS" }) }) as Response;
    renderCard(6);

    fireEvent.click(await screen.findByRole("button", { name: s.syncMembersCta }));
    const sheet = within(await screen.findByRole("dialog", { name: s.preview.title }));
    fireEvent.click(await sheet.findByRole("button", { name: "Importer 1 spiller" }));

    expect((await sheet.findByRole("alert")).textContent).toContain(s.errors.noSelectedMembers);
    expect(onImported).not.toHaveBeenCalled();
  });

  it("falls back to the localised unknown error for a body without a message", async () => {
    routes["GET /api/integrations/spond/import-members/preview"] = () =>
      ({ ok: false, json: () => Promise.resolve(null) }) as Response;
    renderCard(6);

    fireEvent.click(await screen.findByRole("button", { name: s.syncMembersCta }));
    const sheet = within(await screen.findByRole("dialog", { name: s.preview.title }));
    expect((await sheet.findByRole("alert")).textContent).toContain(s.errors.unknown);
  });
});

describe("SpondIntegrationCard danger zone", () => {
  it("states the player count in the confirmation and resets only after confirming, with the same body and order", async () => {
    renderCard(6);

    const zone = within(await screen.findByTestId("spond-danger-zone"));
    fireEvent.click(zone.getByRole("button", { name: new RegExp(s.cleanup.deleteImportedCta) }));
    const sheet = within(await screen.findByRole("dialog", { name: s.cleanup.deleteImportedConfirmTitle }));
    sheet.getByText(
      "6 spillere fra Spond fjernes fra laget, og alle kamper som er importert fra Spond slettes, med kamphistorikk, rapport og påmeldinger. Spond-koblingen beholdes. Spillere kan importeres igjen, men slettet kamphistorikk kan ikke gjenopprettes."
    );
    expect(calls.some((call) => call.key === "POST /api/integrations/spond/reset")).toBe(false);

    const before = calls.length;
    fireEvent.click(sheet.getByRole("button", { name: s.cleanup.deleteImportedConfirmCta }));

    await waitFor(() => expect(screen.getByTestId("spond-notice").textContent).toContain(s.cleanup.deleteImportedSuccess));
    const after = calls.slice(before).map((call) => call.key);
    expect(after.slice(0, 3)).toEqual([
      "POST /api/integrations/spond/reset",
      "onImported",
      "GET /api/integrations/spond/status",
    ]);
    expect(calls[before].body).toEqual({ teamId: "team-1", action: "delete-imported-data" });
  });

  it("does nothing when the coach cancels", async () => {
    renderCard(6);
    const zone = within(await screen.findByTestId("spond-danger-zone"));
    fireEvent.click(zone.getByRole("button", { name: new RegExp(s.cleanup.disconnectCta) }));
    const sheet = within(await screen.findByRole("dialog", { name: s.cleanup.disconnectConfirmTitle }));
    fireEvent.click(sheet.getByRole("button", { name: no.ui.confirm.cancel }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.some((call) => call.key === "POST /api/integrations/spond/reset")).toBe(false);
  });

  it("says the account is disconnected too, with singular, zero and no-number copy", async () => {
    const one = renderCard(1);
    let zone = within(await screen.findByTestId("spond-danger-zone"));
    fireEvent.click(zone.getByRole("button", { name: new RegExp(s.cleanup.disconnectCta) }));
    let sheet = within(await screen.findByRole("dialog", { name: s.cleanup.disconnectConfirmTitle }));
    sheet.getByText(
      "1 spiller fra Spond fjernes fra laget, og alle kamper som er importert fra Spond slettes, med kamphistorikk, rapport og påmeldinger. Laget kobles fra Spond-gruppen, og Spond-kontoen din kobles fra FairPlayr, også for andre lag. Slettet kamphistorikk kan ikke gjenopprettes."
    );
    one.unmount();

    const zero = renderCard(0);
    zone = within(await screen.findByTestId("spond-danger-zone"));
    fireEvent.click(zone.getByRole("button", { name: new RegExp(s.cleanup.deleteImportedCta) }));
    sheet = within(await screen.findByRole("dialog", { name: s.cleanup.deleteImportedConfirmTitle }));
    sheet.getByText(/^Ingen spillere fra Spond er på laget nå\. Alle kamper som er importert fra Spond slettes/);
    zero.unmount();

    renderCard();
    zone = within(await screen.findByTestId("spond-danger-zone"));
    fireEvent.click(zone.getByRole("button", { name: new RegExp(s.cleanup.deleteImportedCta) }));
    sheet = within(await screen.findByRole("dialog", { name: s.cleanup.deleteImportedConfirmTitle }));
    sheet.getByText(s.cleanup.deleteImportedConfirmTextNoCount);
  });
});
