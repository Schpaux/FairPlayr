import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import no from "../../../messages/no.json";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";

let signOut: ReturnType<typeof vi.fn>;
let activeMatch = false;
vi.mock("@/lib/storage/matchStorage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/matchStorage")>()),
  hasActiveStoredMatch: () => activeMatch,
}));

vi.mock("@/components/providers/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: { email: "trener@lyn.no", user_metadata: {} }, signOut }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const { AuthStatusCard } = await import("./AuthStatusCard");
const { AuthActionButton } = await import("./AuthActionButton");

beforeEach(() => {
  signOut = vi.fn(() => Promise.resolve());
  activeMatch = false;
});

afterEach(cleanup);

describe.each([
  ["AuthStatusCard", AuthStatusCard],
  ["AuthActionButton", AuthActionButton],
])("%s sign-out (B4)", (_name, Component) => {
  it("opens the confirmation first; only confirm calls signOut", async () => {
    renderWithIntl(<Component />);

    fireEvent.click(screen.getByRole("button", { name: no.auth.actions.signOut }));
    const confirm = await screen.findByRole("dialog", { name: no.auth.signOutConfirm.title });
    expect(signOut).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(within(confirm).getByRole("button", { name: no.auth.signOutConfirm.confirm }));
    });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("is blocked while a match is active on this device: explains why and never calls signOut", async () => {
    activeMatch = true;
    renderWithIntl(<Component />);

    fireEvent.click(screen.getByRole("button", { name: no.auth.actions.signOut }));
    const blocked = await screen.findByRole("dialog", { name: no.auth.signOutConfirm.blockedTitle });
    expect(within(blocked).getByText(no.auth.signOutConfirm.blockedDescription)).toBeTruthy();
    expect(within(blocked).getByRole("link", { name: no.auth.signOutConfirm.blockedGoToMatch }).getAttribute("href")).toBe("/match/live");
    expect(within(blocked).queryByRole("button", { name: no.auth.signOutConfirm.confirm })).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("re-checks at confirm: a match started while the sheet was open blocks the sign-out", async () => {
    renderWithIntl(<Component />);

    fireEvent.click(screen.getByRole("button", { name: no.auth.actions.signOut }));
    const confirm = await screen.findByRole("dialog", { name: no.auth.signOutConfirm.title });
    activeMatch = true;
    await act(async () => {
      fireEvent.click(within(confirm).getByRole("button", { name: no.auth.signOutConfirm.confirm }));
    });
    const blocked = await screen.findByRole("dialog", { name: no.auth.signOutConfirm.blockedTitle });
    // Same dialog, new content: focus stays inside it, never falls to the page.
    await waitFor(() => expect(blocked.contains(document.activeElement)).toBe(true));
    expect(signOut).not.toHaveBeenCalled();
  });
});
