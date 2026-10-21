import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UPDATE_ATTEMPTS_KEY, clientBuildFingerprint } from "@/lib/pwa/updateRequiredGuard";
import { UpdateRequiredSheet } from "@/components/match/UpdateRequiredSheet";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";
import { getStoredLiveMatch, LIVE_MATCH_STORAGE_KEY } from "@/lib/storage/liveMatchStorage";
import { reportNewerStoredVersion, resetStorageSignalsForTests } from "@/lib/storage/storageEnvelope";
import no from "../../../messages/no.json";

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
const sw = vi.hoisted(() => ({ updateForNewerData: vi.fn(async () => undefined) }));
vi.mock("@/components/pwa/useServiceWorkerUpdate", () => sw);

describe("UpdateRequiredSheet (D4)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetStorageSignalsForTests();
    sw.updateForNewerData.mockClear();
  });

  it("renders nothing while all stored data is from this build", () => {
    renderWithIntl(<UpdateRequiredSheet />);
    expect(screen.queryByTestId("update-required-sheet")).toBeNull();
  });

  it("appears when a newer build's data is found and offers one action: reload", () => {
    const onReload = vi.fn();
    renderWithIntl(<UpdateRequiredSheet onUpdate={onReload} />);

    act(() => {
      reportNewerStoredVersion("fairplayr.liveMatch.v1");
    });

    const sheet = screen.getByTestId("update-required-sheet");
    expect(sheet.textContent).toContain(no.restore.updateRequired.title);
    expect(sheet.textContent).toContain(no.restore.updateRequired.body);
    const buttons = sheet.querySelectorAll("button");
    expect(buttons).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: no.restore.updateRequired.reload }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("is raised by simply reading a live match stored by a newer build", () => {
    window.localStorage.setItem(
      LIVE_MATCH_STORAGE_KEY,
      JSON.stringify({
        version: 99,
        liveMatch: {
          id: "lm-1",
          setupId: "setup-1",
          teamId: "team-1",
          durationSeconds: 1800,
          teamScore: 0,
          opponentScore: 0,
          status: "paused",
          createdAt: "2026-10-20T10:00:00.000Z",
          updatedAt: "2026-10-20T10:00:00.000Z",
          playerAccumulatedMs: {},
          onFieldStartedAtElapsedMs: {},
        },
      })
    );
    renderWithIntl(<UpdateRequiredSheet onUpdate={vi.fn()} />);

    act(() => {
      getStoredLiveMatch();
    });

    expect(screen.getByTestId("update-required-sheet")).toBeTruthy();
  });

  it("by default loads the newer build through the service worker, once per tap", () => {
    renderWithIntl(<UpdateRequiredSheet />);
    act(() => {
      reportNewerStoredVersion("fairplayr.liveMatch.v1");
    });
    const button = screen.getByRole("button", { name: no.restore.updateRequired.reload });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: no.pwa.updateRequired.updating }));
    expect(sw.updateForNewerData).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.sessionStorage.getItem(UPDATE_ATTEMPTS_KEY)!)).toEqual({ [clientBuildFingerprint()]: 1 });
  });

  it("does not loop: after one attempt on this build it explains and can be closed, a cue stays", () => {
    window.sessionStorage.setItem(UPDATE_ATTEMPTS_KEY, JSON.stringify({ [clientBuildFingerprint()]: 1 }));
    renderWithIntl(<UpdateRequiredSheet />);
    act(() => {
      reportNewerStoredVersion("fairplayr.liveMatch.v1");
    });

    const sheet = screen.getByTestId("update-required-sheet");
    expect(sheet.textContent).toContain(no.pwa.updateRequired.stuckBody);
    expect(screen.queryByRole("button", { name: no.restore.updateRequired.reload })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: no.pwa.updateRequired.close }));
    expect(sw.updateForNewerData).not.toHaveBeenCalled();
    const cue = screen.getByTestId("update-required-cue");
    expect(cue.getAttribute("aria-label")).toBe(no.pwa.updateRequired.reopen);

    fireEvent.click(cue);
    expect(screen.getByTestId("update-required-sheet").textContent).toContain(no.pwa.updateRequired.stuckBody);
  });

  it("another build gets its own attempt", () => {
    window.sessionStorage.setItem(UPDATE_ATTEMPTS_KEY, JSON.stringify({ "some-older-build": 1 }));
    renderWithIntl(<UpdateRequiredSheet />);
    act(() => {
      reportNewerStoredVersion("fairplayr.liveMatch.v1");
    });
    expect(screen.getByRole("button", { name: no.restore.updateRequired.reload })).toBeTruthy();
  });
});
