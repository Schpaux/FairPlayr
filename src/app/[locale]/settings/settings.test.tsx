import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import no from "../../../../messages/no.json";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";

let authStatus: "loading" | "guest" | "authenticated";
let user: { email?: string; user_metadata: Record<string, unknown> } | null;
let signOut: ReturnType<typeof vi.fn>;
let activeMatch = false;
vi.mock("@/lib/storage/matchStorage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/matchStorage")>()),
  hasActiveStoredMatch: () => activeMatch,
}));
let workspace: {
  mode: "guest-local" | "cloud";
  activeTeamId: string | null;
  activeTeam: { id: string; name: string; players: Array<{ source: "manual" | "spond" }> } | null;
  error: string | null;
  refresh: () => Promise<void>;
};
let theme: string | undefined;
const setTheme = vi.fn();
const replace = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme, setTheme }),
}));
vi.mock("@/components/providers/AuthProvider", () => ({
  useAuth: () => ({ status: authStatus, user, signOut }),
}));
vi.mock("@/components/providers/TeamWorkspaceProvider", () => ({
  useTeamWorkspace: () => workspace,
}));
vi.mock("@/components/team/SpondIntegrationCard", () => ({
  SpondIntegrationCard: ({ teamId, spondPlayerCount }: { teamId: string; spondPlayerCount?: number }) => (
    <div data-testid="spond-card" data-spond-player-count={spondPlayerCount}>
      {teamId}
    </div>
  ),
}));
vi.mock("@/components/team/useSpondStatus", () => ({ useSpondStatus: () => null }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ replace }),
  Link: ({ href, children, ...props }: { href: string | { pathname: string; hash?: string }; children: ReactNode }) => (
    <a href={typeof href === "string" ? href : `${href.pathname}${href.hash ? `#${href.hash}` : ""}`} {...props}>
      {children}
    </a>
  ),
}));

const { default: SettingsPage } = await import("./page");

const s = no.settings;

function signedIn() {
  authStatus = "authenticated";
  user = { email: "trener@lyn.no", user_metadata: { full_name: "Kari Trener" } };
  workspace = {
    mode: "cloud",
    activeTeamId: "team-1",
    activeTeam: { id: "team-1", name: "Lyn G12", players: [{ source: "manual" }, { source: "spond" }, { source: "spond" }] },
    error: null,
    refresh: () => Promise.resolve(),
  };
}

beforeEach(() => {
  authStatus = "guest";
  user = null;
  signOut = vi.fn(() => Promise.resolve());
  activeMatch = false;
  workspace = {
    mode: "guest-local",
    activeTeamId: "local-1",
    activeTeam: { id: "local-1", name: "Lyn G12", players: [] },
    error: null,
    refresh: () => Promise.resolve(),
  };
  theme = "dark";
  setTheme.mockClear();
  replace.mockClear();
});

afterEach(cleanup);

describe("Settings (C5)", () => {
  it("has a title and no subtitle", () => {
    renderWithIntl(<SettingsPage />);
    const heading = screen.getByRole("heading", { level: 1, name: s.title });
    expect(heading.nextElementSibling?.tagName).not.toBe("P");
  });

  it("guest: one account row, Logg inn as the only primary action, no sign-out or integrations", () => {
    renderWithIntl(<SettingsPage />);

    const account = screen.getByTestId("settings-account");
    expect(within(account).getByRole("heading", { name: s.account })).toBeTruthy();
    expect(within(account).getAllByRole("listitem")).toHaveLength(1);
    expect(within(account).getByText(s.guestRow)).toBeTruthy();

    const signIn = screen.getByRole("link", { name: no.auth.actions.signIn });
    expect(signIn.getAttribute("href")).toBe("/auth/sign-in");
    expect(screen.queryByTestId("settings-sign-out")).toBeNull();
    expect(screen.queryByRole("heading", { name: s.integrations })).toBeNull();
    expect(screen.queryByTestId("spond-card")).toBeNull();
  });

  it("signed in: name, e-mail and sync status; Logg ut in its own group last; Spond inline", () => {
    signedIn();
    renderWithIntl(<SettingsPage />);

    const account = screen.getByTestId("settings-account");
    expect(within(account).getByText("Kari Trener")).toBeTruthy();
    expect(within(account).getByText("trener@lyn.no")).toBeTruthy();
    expect(within(account).getByTestId("settings-sync-value").textContent).toBe(no.profileMenu.sync.cloud);
    expect(within(account).queryByText(no.auth.actions.signOut)).toBeNull();
    expect(screen.queryByRole("link", { name: no.auth.actions.signIn })).toBeNull();

    const signOutGroup = screen.getByTestId("settings-sign-out-group");
    expect(within(signOutGroup).getByRole("button", { name: no.auth.actions.signOut })).toBeTruthy();
    // The sign-out group is the last group on the page.
    const sections = Array.from(document.querySelectorAll("section"));
    expect(sections.at(-1)).toBe(signOutGroup);

    expect(screen.getByRole("heading", { name: s.integrations })).toBeTruthy();
    expect(screen.getByTestId("spond-card").textContent).toBe("team-1");
    // B3: the delete confirmation counts the active Spond players the reset deactivates.
    expect(screen.getByTestId("spond-card").getAttribute("data-spond-player-count")).toBe("2");
  });

  it("signed in with a sync error: the status speaks in warn tone", () => {
    signedIn();
    workspace.error = "boom";
    renderWithIntl(<SettingsPage />);
    const value = screen.getByTestId("settings-sync-value");
    expect(value.textContent).toBe(no.profileMenu.sync.attention);
    expect(value.className).toContain("text-fp-warn-text");
  });

  it("signed in without a team keeps the integrations fallback", () => {
    signedIn();
    workspace.activeTeam = null;
    workspace.activeTeamId = null;
    renderWithIntl(<SettingsPage />);
    expect(screen.getByText(s.noTeamForIntegrations)).toBeTruthy();
    expect(screen.queryByTestId("spond-card")).toBeNull();
    expect(screen.getByTestId("settings-no-team").getAttribute("href")).toBe("/team");
  });

  it("Lag: the active team and a Lagstandarder link to the team defaults on Spillere", () => {
    renderWithIntl(<SettingsPage />);
    const team = screen.getByTestId("settings-team");
    expect(within(team).getByText("Lyn G12")).toBeTruthy();
    expect(within(team).getByRole("link", { name: new RegExp(s.teamDefaults) }).getAttribute("href")).toBe(
      "/team#team-defaults"
    );
  });

  it("theme is a segmented choice and language a pair of pressed buttons; changing them calls next-themes and the router", () => {
    renderWithIntl(<SettingsPage />);
    const themeGroup = screen.getByRole("group", { name: s.theme });
    expect((within(themeGroup).getByRole("radio", { name: s.darkMode }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(within(themeGroup).getByRole("radio", { name: s.lightMode }));
    expect(setTheme).toHaveBeenCalledWith("light");

    const languageGroup = screen.getByRole("group", { name: s.language });
    expect(within(languageGroup).queryAllByRole("radio")).toHaveLength(0);
    expect(within(languageGroup).getByRole("button", { name: /Norsk/ }).getAttribute("aria-pressed")).toBe("true");
    // The current language does nothing; the other one switches the page.
    fireEvent.click(within(languageGroup).getByRole("button", { name: /Norsk/ }));
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(within(languageGroup).getByRole("button", { name: "English" }));
    expect(replace).toHaveBeenCalledWith("/settings", { locale: "en" });
  });

  it("arrow keys on the language buttons do not switch the language (WCAG 3.2.2)", () => {
    renderWithIntl(<SettingsPage />);
    const norsk = within(screen.getByRole("group", { name: s.language })).getByRole("button", { name: /Norsk/ });
    norsk.focus();
    fireEvent.keyDown(norsk, { key: "ArrowLeft" });
    fireEvent.keyDown(norsk, { key: "ArrowRight" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("mounted guard: no theme is selected in the server render (FP-004 N-5)", () => {
    const html = renderToString(
      <NextIntlClientProvider locale="no" messages={no}>
        <SettingsPage />
      </NextIntlClientProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    const themeRadios = Array.from(
      container.querySelectorAll<HTMLInputElement>('[data-testid="settings-theme"] input[type="radio"]')
    );
    expect(themeRadios).toHaveLength(3);
    expect(themeRadios.some((radio) => radio.hasAttribute("checked"))).toBe(false);
    // The language is known on the server, so it is selected there too.
    const languagePressed = container.querySelectorAll('[data-testid="settings-language"] button[aria-pressed="true"]');
    expect(languagePressed).toHaveLength(1);
  });

  it("Logg ut opens a confirmation; only its confirm button signs out", async () => {
    signedIn();
    renderWithIntl(<SettingsPage />);

    fireEvent.click(screen.getByTestId("settings-sign-out"));
    const confirm = await screen.findByRole("dialog", { name: no.auth.signOutConfirm.title });
    expect(within(confirm).getByText(no.auth.signOutConfirm.description)).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole("button", { name: no.auth.signOutConfirm.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(signOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("settings-sign-out"));
    const confirm2 = await screen.findByRole("dialog", { name: no.auth.signOutConfirm.title });
    await act(async () => {
      fireEvent.click(within(confirm2).getByRole("button", { name: no.auth.signOutConfirm.confirm }));
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Logg ut is blocked while a match is active on this device; signOut is never called", async () => {
    signedIn();
    activeMatch = true;
    renderWithIntl(<SettingsPage />);

    fireEvent.click(screen.getByTestId("settings-sign-out"));
    const blocked = await screen.findByRole("dialog", { name: no.auth.signOutConfirm.blockedTitle });
    expect(within(blocked).getByText(no.auth.signOutConfirm.blockedDescription)).toBeTruthy();
    expect(within(blocked).queryByRole("button", { name: no.auth.signOutConfirm.confirm })).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });
});
