import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import no from "../../../messages/no.json";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";
import type { SpondConnectionState } from "@/components/team/useSpondStatus";

let authStatus: "loading" | "guest" | "authenticated";
let user: { email?: string; user_metadata: Record<string, unknown> } | null;
let signOut: ReturnType<typeof vi.fn>;
let activeMatch = false;
vi.mock("@/lib/storage/matchStorage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/matchStorage")>()),
  hasActiveStoredMatch: () => activeMatch,
}));
let workspace: { mode: "guest-local" | "cloud"; activeTeamId: string | null; error: string | null };
let spondState: SpondConnectionState;
let pathname: string;

vi.mock("@/components/providers/AuthProvider", () => ({
  useAuth: () => ({ status: authStatus, user, signOut }),
}));
vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({
  useTeamWorkspace: () => workspace,
}));
vi.mock("@/components/team/useSpondStatus", () => ({
  useSpondConnection: () => spondState,
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathname,
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

const { ProfileMenu } = await import("./ProfileMenu");

const pm = no.profileMenu;

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: pm.open }));
  return screen.findByRole("dialog", { name: pm.title });
}

beforeEach(() => {
  authStatus = "authenticated";
  user = { email: "trener@lyn.no", user_metadata: { full_name: "Kari Trener" } };
  signOut = vi.fn(() => Promise.resolve());
  activeMatch = false;
  workspace = { mode: "cloud", activeTeamId: "team-1", error: null };
  spondState = "connected";
  pathname = "/";
});

afterEach(cleanup);

describe("ProfileMenu (C5)", () => {
  it("has no theme or language pickers (they live in Settings, B2)", async () => {
    renderWithIntl(<ProfileMenu />);
    const sheet = await openMenu();

    expect(within(sheet).queryAllByRole("radio")).toHaveLength(0);
    expect(within(sheet).queryByText(no.settings.theme)).toBeNull();
    expect(within(sheet).queryByText(no.settings.language)).toBeNull();
    expect(within(sheet).queryByRole("button", { name: no.settings.darkMode })).toBeNull();
    expect(within(sheet).queryByText("English")).toBeNull();
  });

  it("shows the account, the shared sync row and a link to Settings", async () => {
    renderWithIntl(<ProfileMenu />);
    const sheet = await openMenu();

    expect(within(sheet).getByText("Kari Trener")).toBeTruthy();
    expect(within(sheet).getByText("trener@lyn.no")).toBeTruthy();
    const sync = within(sheet).getByTestId("sync-status-row-value");
    expect(sync.textContent).toBe(pm.sync.cloud);
    expect(within(sheet).getByRole("link", { name: no.settings.title }).getAttribute("href")).toBe("/settings");
  });

  it.each([
    ["checking", pm.spond.checking],
    ["connected", pm.spond.connected],
    ["disconnected", pm.spond.disconnected],
    ["unavailable", pm.spond.unavailable],
  ] as const)("shows the Spond state %s in words", async (state, text) => {
    spondState = state;
    renderWithIntl(<ProfileMenu />);
    const sheet = await openMenu();

    const row = within(sheet).getByTestId("spond-status-row");
    expect(row.textContent).toContain(pm.spond.title);
    expect(within(row).getByTestId("spond-status-value").textContent).toBe(text);
  });

  it("shows no Spond row for a guest, and Logg inn as the action", async () => {
    authStatus = "guest";
    user = null;
    workspace = { mode: "guest-local", activeTeamId: null, error: null };
    spondState = "guest";
    renderWithIntl(<ProfileMenu />);
    const sheet = await openMenu();

    expect(within(sheet).queryByTestId("spond-status-row")).toBeNull();
    expect(within(sheet).getByText(pm.guestName)).toBeTruthy();
    expect(within(sheet).getByTestId("sync-status-row-value").textContent).toBe(pm.sync.local);
    expect(within(sheet).getByRole("link", { name: no.auth.actions.signIn })).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: no.auth.actions.signOut })).toBeNull();
  });

  it("closes on navigation and stays closed when the coach comes back to the page", async () => {
    pathname = "/team";
    const { rerender } = renderWithIntl(<ProfileMenu />);
    await openMenu();

    pathname = "/settings";
    rerender(<ProfileMenu />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: pm.title })).toBeNull());

    pathname = "/team";
    rerender(<ProfileMenu />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog", { name: pm.title })).toBeNull();
  });

  it("hides the Settings link on Settings itself", async () => {
    pathname = "/settings";
    renderWithIntl(<ProfileMenu />);
    const sheet = await openMenu();
    expect(within(sheet).queryByRole("link", { name: no.settings.title })).toBeNull();
  });

  it("asks before signing out; only the confirmation signs out", async () => {
    renderWithIntl(<ProfileMenu />);
    const sheet = await openMenu();

    fireEvent.click(within(sheet).getByRole("button", { name: no.auth.actions.signOut }));
    const confirm = await screen.findByRole("dialog", { name: no.auth.signOutConfirm.title });
    expect(confirm.getAttribute("aria-describedby")).toBeTruthy();
    expect(within(confirm).getByText(no.auth.signOutConfirm.description)).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();

    // Cancel keeps the coach signed in.
    fireEvent.click(within(confirm).getByRole("button", { name: no.auth.signOutConfirm.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: no.auth.signOutConfirm.title })).toBeNull());
    expect(signOut).not.toHaveBeenCalled();

    // Confirm signs out exactly once.
    const again = await openMenu();
    fireEvent.click(within(again).getByRole("button", { name: no.auth.actions.signOut }));
    const confirm2 = await screen.findByRole("dialog", { name: no.auth.signOutConfirm.title });
    await act(async () => {
      fireEvent.click(within(confirm2).getByRole("button", { name: no.auth.signOutConfirm.confirm }));
    });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("blocks sign-out while a match is active on this device; signOut is never called", async () => {
    activeMatch = true;
    renderWithIntl(<ProfileMenu />);
    const sheet = await openMenu();

    fireEvent.click(within(sheet).getByRole("button", { name: no.auth.actions.signOut }));
    const blocked = await screen.findByRole("dialog", { name: no.auth.signOutConfirm.blockedTitle });
    expect(within(blocked).getByText(no.auth.signOutConfirm.blockedDescription)).toBeTruthy();
    expect(within(blocked).queryByRole("button", { name: no.auth.signOutConfirm.confirm })).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });
});
