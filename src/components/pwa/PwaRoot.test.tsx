import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";
import no from "../../../messages/no.json";

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

const hook = vi.hoisted(() => ({
  state: { updateReady: false, updating: false },
  applyUpdate: vi.fn(),
  postMatchActive: vi.fn(async () => undefined),
}));
const match = vi.hoisted(() => ({ activeMatch: null as null | { id: string }, local: null as null | { id: string } }));

vi.mock("./useServiceWorkerUpdate", () => ({
  useServiceWorkerUpdate: () => ({ ...hook.state, applyUpdate: hook.applyUpdate }),
  postLocale: vi.fn(),
  postMatchActive: hook.postMatchActive,
}));
vi.mock("@/components/match/UpdateRequiredSheet", () => ({
  UpdateRequiredSheet: () => <div data-testid="update-required-mount" />,
}));
vi.mock("@/components/providers/ActiveMatchProvider", () => ({
  useActiveMatch: () => ({ activeMatch: match.activeMatch }),
}));
vi.mock("@/lib/match/activeMatchRecovery", () => ({
  resolveLocalActiveMatch: () => match.local,
}));

import { PwaRoot } from "./PwaRoot";

describe("PwaRoot update prompt", () => {
  beforeEach(() => {
    hook.state = { updateReady: false, updating: false };
    hook.applyUpdate.mockReset();
    hook.postMatchActive.mockClear();
    match.activeMatch = null;
    match.local = null;
  });
  afterEach(cleanup);

  it("shows nothing without a waiting update", () => {
    renderWithIntl(<PwaRoot />);
    expect(screen.queryByTestId("update-prompt")).toBeNull();
  });

  it("never shows while a match is active", () => {
    hook.state = { updateReady: true, updating: false };
    match.activeMatch = { id: "m1" };
    renderWithIntl(<PwaRoot />);
    expect(screen.queryByTestId("update-prompt")).toBeNull();
  });

  it("offers the update without a match; consent applies it once", () => {
    hook.state = { updateReady: true, updating: false };
    renderWithIntl(<PwaRoot />);
    const prompt = screen.getByTestId("update-prompt");
    expect(prompt.textContent).toContain(no.pwa.update.title);
    expect(prompt.getAttribute("role")).toBe("status");
    fireEvent.click(screen.getByRole("button", { name: no.pwa.update.action }));
    expect(hook.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not apply when a match started meanwhile (another tab)", () => {
    hook.state = { updateReady: true, updating: false };
    renderWithIntl(<PwaRoot />);
    match.local = { id: "m2" };
    fireEvent.click(screen.getByRole("button", { name: no.pwa.update.action }));
    expect(hook.applyUpdate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("update-prompt")).toBeNull();
  });

  it("mounts the D4 sheet once", () => {
    renderWithIntl(<PwaRoot />);
    expect(screen.getAllByTestId("update-required-mount")).toHaveLength(1);
  });

  it("tells the worker's update gate about this device's match, from storage, on load and on change", () => {
    match.local = { id: "m1" };
    const view = renderWithIntl(<PwaRoot />);
    expect(hook.postMatchActive).toHaveBeenLastCalledWith(true);

    // The match ends: the provider's match changes and storage holds none.
    match.local = null;
    match.activeMatch = null;
    view.rerender(<PwaRoot />);
    expect(hook.postMatchActive).toHaveBeenCalledTimes(1);
    match.activeMatch = { id: "m1" };
    view.rerender(<PwaRoot />);
    match.activeMatch = null;
    view.rerender(<PwaRoot />);
    expect(hook.postMatchActive).toHaveBeenLastCalledWith(false);

    // Another tab started one.
    match.local = { id: "m2" };
    window.dispatchEvent(new StorageEvent("storage", { key: "fairplayr.matchSetup.v1" }));
    expect(hook.postMatchActive).toHaveBeenLastCalledWith(true);
  });

  it("«Senere» hides it", () => {
    hook.state = { updateReady: true, updating: false };
    renderWithIntl(<PwaRoot />);
    fireEvent.click(screen.getByRole("button", { name: no.pwa.update.later }));
    expect(screen.queryByTestId("update-prompt")).toBeNull();
  });
});
