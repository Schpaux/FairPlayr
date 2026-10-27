// FEAT-SHARE-04: with «Vis lagoppstilling og benk» on, the setup's planned
// start goes with the share before «Start kampen». A later setup change is a
// new revision on the device first, then sent by the same sync; offline it
// waits, and the setup is never held up.
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupSharePanel } from "@/components/share/SetupSharePanel";
import { syncStoredMatchShare } from "@/lib/match/matchShareSync";
import type { LiveLineupSnapshot } from "@/domain/liveMatch";
import { getStoredMatchShare, saveStoredMatchShare, type StoredMatchShare } from "@/lib/storage/matchShareStorage";
import no from "../../../messages/no.json";

vi.mock("@/i18n/navigation", () => ({ getPathname: ({ href }: { href: string }) => `/no${href}` }));

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const TEAM_ID = "team-1";
const USER_ID = "user-1";
const TOKEN = "b".repeat(43);

const FIRST: LiveLineupSnapshot = {
  format: "5v5",
  formationId: "5v5-2-2",
  slotAssignments: { "5v5-1": "p1", "5v5-2": "p2" },
  benchPlayerIds: ["p3"],
};
const SWAPPED: LiveLineupSnapshot = { ...FIRST, slotAssignments: { "5v5-1": "p3", "5v5-2": "p2" }, benchPlayerIds: ["p1"] };

function stored(overrides: Partial<StoredMatchShare> = {}): StoredMatchShare {
  return {
    matchId: MATCH_ID,
    teamId: TEAM_ID,
    ownerUserId: USER_ID,
    token: TOKEN,
    settings: { live: true, summary: false, lineup: true, detailLevel: "status", ageGroup: "unknown" },
    revision: 1,
    syncedRevision: 1,
    matchCreated: true,
    started: false,
    plannedMatch: false,
    kickoffAt: null,
    plannedLineup: FIRST,
    ...overrides,
  };
}

function panel(plannedLineup: LiveLineupSnapshot) {
  return (
    <NextIntlClientProvider locale="no" messages={no}>
      <SetupSharePanel teamId={TEAM_ID} ownerUserId={USER_ID} plannedMatchId={null} plannedLineup={plannedLineup} />
    </NextIntlClientProvider>
  );
}

describe("SetupSharePanel planned lineup", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a setup change is saved on the device first and sent once; the same lineup again sends nothing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ share: { token: TOKEN } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    saveStoredMatchShare(stored());

    const view = render(panel(FIRST));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    view.rerender(panel(SWAPPED));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(getStoredMatchShare()).toMatchObject({ revision: 2, syncedRevision: 2, plannedLineup: SWAPPED });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ lineup: true, plannedLineup: SWAPPED });

    // A new object with the same lineup (every setup render) is no change.
    view.rerender(panel({ ...SWAPPED }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("offline the change is kept for later; without the option nothing is stored", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    saveStoredMatchShare(stored());

    const view = render(panel(FIRST));
    view.rerender(panel(SWAPPED));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(getStoredMatchShare()).toMatchObject({ revision: 2, syncedRevision: 1, plannedLineup: SWAPPED });

    cleanup();
    window.localStorage.clear();
    saveStoredMatchShare(stored({ settings: { ...stored().settings, lineup: false }, plannedLineup: null }));
    const off = render(panel(FIRST));
    off.rerender(panel(SWAPPED));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(getStoredMatchShare()).toMatchObject({ revision: 1, plannedLineup: null });
  });

  it("leaving the setup before the send keeps the last lineup pending, and a later sync sends it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ share: { token: TOKEN } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    saveStoredMatchShare(stored());

    const view = render(panel(FIRST));
    view.rerender(panel(SWAPPED));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getStoredMatchShare()).toMatchObject({ revision: 2, syncedRevision: 1, plannedLineup: SWAPPED });

    await syncStoredMatchShare(USER_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ lineup: true, plannedLineup: SWAPPED });
    expect(getStoredMatchShare()).toMatchObject({ revision: 2, syncedRevision: 2 });
  });
});
