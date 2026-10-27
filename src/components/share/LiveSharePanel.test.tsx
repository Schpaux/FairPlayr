// FEAT-SHARE-01: «Del kampen» from the live menu shows the same link and
// choices as setup, also before the first ▶, and opening it never makes a
// new link.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSharePanel } from "@/components/share/LiveSharePanel";
import { MATCH_SHARE_KEY, getStoredMatchShare, saveStoredMatchShare } from "@/lib/storage/matchShareStorage";
import no from "../../../messages/no.json";

vi.mock("@/i18n/navigation", () => ({ getPathname: ({ href }: { href: string }) => `/no${href}` }));

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const TEAM_ID = "team-1";
const USER_ID = "user-1";
const TOKEN = "b".repeat(43);

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="no" messages={no}>
      <LiveSharePanel matchId={MATCH_ID} teamId={TEAM_ID} ownerUserId={USER_ID} />
    </NextIntlClientProvider>
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("LiveSharePanel", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the link made in setup at once, without asking the server or making a new one", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    saveStoredMatchShare({
      matchId: MATCH_ID,
      teamId: TEAM_ID,
      ownerUserId: USER_ID,
      token: TOKEN,
      settings: { live: true, summary: false, lineup: false, detailLevel: "status", ageGroup: "unknown" },
      revision: 1,
      syncedRevision: 1,
      matchCreated: true,
      started: true,
      plannedMatch: false,
      kickoffAt: null,
    });

    renderPanel();

    expect(screen.getByTestId("match-share-link").textContent).toContain(`/no/s/${TOKEN}`);
    expect(screen.getByRole("button", { name: new RegExp(no.matchShare.copy) })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getStoredMatchShare()?.token).toBe(TOKEN);
  });

  it("opening without a share only reads; turning it on makes one link and sends it once", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? jsonResponse(200, { share: { token: JSON.parse(String(init.body)).token } })
        : jsonResponse(200, { share: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();
    await screen.findByTestId("live-share-panel");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method ?? "GET").toBe("GET");
    expect(window.localStorage.getItem(MATCH_SHARE_KEY)).toBeNull();
    expect(screen.queryByTestId("match-share-link")).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: no.matchShare.liveToggle }));

    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1));
    const stored = getStoredMatchShare();
    expect(stored?.matchId).toBe(MATCH_ID);
    expect(stored?.started).toBe(true);
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(put[0]).toBe(`/api/matches/${MATCH_ID}/share`);
    expect(JSON.parse(String(put[1]?.body))).toMatchObject({ live: true, token: stored?.token });
    expect(screen.getByTestId("match-share-link").textContent).toContain(`/s/${stored?.token}`);
  });
});
