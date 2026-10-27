// FEAT-SHARE-01: before kick-off the public page counts down only to a real
// kick-off. Without one it waits for the coach, and never counts from the
// time the link was made. From the first ▶ it is live with a running clock.
// A Realtime hint (no data) makes it read the filtered answer at once; a
// calm poll stays as the fallback.
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicMatchView } from "@/components/share/PublicMatchView";
import type { PublicMatchShare } from "@/domain/matchShare";
import no from "../../../messages/no.json";

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

type SignalHandlers = { onSignal: () => void; onConnected: () => void; onDisconnected: () => void };
const signal = vi.hoisted(() => ({ handlers: null as SignalHandlers | null, topic: null as string | null, closed: 0 }));
vi.mock("@/lib/share/shareSignal", () => ({
  subscribeToShareSignal: (topic: string, handlers: SignalHandlers) => {
    signal.topic = topic;
    signal.handlers = handlers;
    return () => {
      signal.closed += 1;
    };
  },
}));

const FETCHED_AT = "2026-10-26T16:00:00.000Z";
const NOW = Date.parse(FETCHED_AT);
const MIN = 60_000;

function upcoming(startsAt: string | null): PublicMatchShare {
  return {
    phase: "upcoming",
    teamName: "Lyn G10",
    opponentName: "Strindheim",
    startsAt,
    shareLive: true,
    shareSummary: false,
    detailLevel: "status",
    live: null,
    score: null,
    goals: null,
    summary: null,
    lineup: null,
  };
}

function liveShare(overrides: Partial<NonNullable<PublicMatchShare["live"]>> = {}, score = { for: 0, against: 0 }): PublicMatchShare {
  return {
    ...upcoming("2026-10-26T15:45:00.000Z"),
    phase: "live",
    detailLevel: "result",
    score,
    goals: [],
    live: {
      updatedAt: "2026-10-26T15:58:00.000Z",
      phase: "first_half",
      status: "running",
      halves: 2,
      regularSecondsPerHalf: 25 * 60,
      phaseStartedAtElapsedMs: 0,
      clock: { startedAtMs: NOW - 10 * MIN, pausedAtMs: null, accumulatedPausedMs: 0, isRunning: true },
      ...overrides,
    },
  };
}

function renderView(share: PublicMatchShare | null, signalTopic: string | null = null) {
  return render(
    <NextIntlClientProvider locale="no" messages={no}>
      <PublicMatchView
        token={"a".repeat(43)}
        locale="no"
        initialShare={share}
        initialFetchedAt={FETCHED_AT}
        signalTopic={signalTopic}
      />
    </NextIntlClientProvider>
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("PublicMatchView before kick-off", () => {
  afterEach(cleanup);

  it("without a kick-off time: «Venter på avspark», no countdown and no kick-off line", () => {
    renderView(upcoming(null));

    expect(screen.getByTestId("public-match-waiting").textContent).toContain(no.publicMatch.waitingForKickoff);
    expect(screen.queryByTestId("public-match-countdown")).toBeNull();
    expect(screen.queryByText(/Avspark /)).toBeNull();
  });

  it("with a kick-off time ahead: a countdown to it, not LIVE", () => {
    renderView(upcoming("2026-10-26T17:30:00.000Z"));

    expect(screen.getByTestId("public-match-countdown").textContent).toContain("1 t 30 min");
    expect(screen.queryByTestId("public-match-waiting")).toBeNull();
    expect(screen.getByTestId("public-match-status").textContent).toBe(no.publicMatch.status.upcoming);
    expect(screen.queryByTestId("public-match-clock")).toBeNull();
  });
});

describe("PublicMatchView after the first ▶", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    signal.handlers = null;
  });

  it("is LIVE with the score between the teams, a running clock and when the data last changed", async () => {
    renderView(liveShare({}, { for: 2, against: 1 }));

    expect(screen.getByTestId("public-match-status").textContent).toBe("LIVE");
    expect(screen.getByTestId("public-match-score").textContent).toBe("2–1");
    expect(screen.getByTestId("public-match-phase").textContent).toContain("1. omgang");
    expect(screen.getByTestId("public-match-clock").textContent).toBe("10:00");
    expect(screen.getByTestId("public-match-updated").textContent).toBe("Oppdatert kl. 16:58");

    await advance(5_000);
    expect(screen.getByTestId("public-match-clock").textContent).toBe("10:05");
  });

  it("a paused clock stands still and says so, never «not started»", async () => {
    renderView(
      liveShare({
        status: "paused",
        clock: { startedAtMs: NOW - 10 * MIN, pausedAtMs: NOW - 2 * MIN, accumulatedPausedMs: 0, isRunning: false },
      })
    );

    expect(screen.getByTestId("public-match-status").textContent).toBe("LIVE");
    expect(screen.getByTestId("public-match-phase").textContent).toContain(no.publicMatch.clockStopped);
    expect(screen.getByTestId("public-match-clock").textContent).toBe("08:00");
    await advance(5_000);
    expect(screen.getByTestId("public-match-clock").textContent).toBe("08:00");
  });

  it("a signal reads the filtered answer at once; a burst of signals is one read", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      jsonResponse(200, {
        fetchedAt: FETCHED_AT,
        share: {
          ...liveShare({ updatedAt: "2026-10-26T16:00:00.000Z" }, { for: 1, against: 0 }),
          playingTime: { p1: 25 },
          reportText: "Intern rapport",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    renderView(liveShare(), "match-share:abc");
    await advance(0);

    expect(signal.topic).toBe("match-share:abc");
    act(() => {
      signal.handlers?.onSignal();
      signal.handlers?.onSignal();
      signal.handlers?.onSignal();
    });
    await advance(300);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/public/matches/${"a".repeat(43)}`);
    expect(screen.getByTestId("public-match-score").textContent).toBe("1–0");
    expect(screen.getByTestId("public-match-updated").textContent).toBe("Oppdatert kl. 17:00");
    expect(document.body.textContent).not.toContain("Intern rapport");
  });

  it("a signal after the link was turned off shows that it is no longer active, and stops listening", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(404, { share: null })));
    renderView(liveShare(), "match-share:abc");
    await advance(0);
    const closedBefore = signal.closed;

    act(() => signal.handlers?.onSignal());
    await advance(300);

    expect(screen.getByTestId("public-match-unavailable")).toBeTruthy();
    expect(signal.closed).toBe(closedBefore + 1);
  });

  it("without Realtime it still polls, and a failed read says so in one short line", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("offline");
    });
    vi.stubGlobal("fetch", fetchMock);
    renderView(liveShare());

    // The live poll (15 s), then the read after the short merge window.
    await advance(15_300);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("public-match-no-contact").textContent).toBe("Ingen kontakt. Viser data fra kl. 16:58");
    expect(screen.queryByTestId("public-match-updated")).toBeNull();
  });

  it("reads fresh data when the channel (re)connects, and polls calmly while connected", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { fetchedAt: FETCHED_AT, share: liveShare() }));
    vi.stubGlobal("fetch", fetchMock);
    renderView(liveShare(), "match-share:abc");
    await advance(0);

    act(() => signal.handlers?.onConnected());
    await advance(300);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// FEAT-SHARE-04: the lineup and bench, named only at the detailed level, as
// empty markers otherwise, calm when missing, and gone at once when the coach
// turns it off or lowers the level (the next filtered answer replaces it).
describe("PublicMatchView lineup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    signal.handlers = null;
  });

  const named: NonNullable<PublicMatchShare["lineup"]> = {
    kind: "current",
    available: true,
    format: "5v5",
    formationId: "5v5-2-2",
    field: [
      { slot: "5v5-1", name: "Frida Berg" },
      { slot: "5v5-2", name: "Ida" },
      { slot: "5v5-3", name: "Emma Hau" },
    ],
    bench: [{ name: "Nora" }, { name: "Emma Lie" }],
  };
  const anonymous: NonNullable<PublicMatchShare["lineup"]> = {
    ...named,
    field: named.field.map(({ slot }) => ({ slot })),
    bench: [{}, {}],
  };

  it("named: the players on the pitch and the bench, no minutes or numbers", () => {
    renderView({ ...liveShare(), detailLevel: "detailed", lineup: named });

    const section = screen.getByTestId("public-match-lineup");
    expect(section.textContent).toContain(no.publicMatch.lineup.currentTitle);
    expect(screen.getAllByTestId("public-lineup-token")).toHaveLength(3);
    // Clashing first names are told apart as on the coach's pitch.
    expect(section.textContent).toContain("Emma H");
    expect(screen.getAllByTestId("public-bench-player").map((tile) => tile.textContent)).toEqual(["Nora", "Emma L"]);
    expect(section.querySelector("button, [draggable]")).toBeNull();
    expect(section.textContent).not.toMatch(/′|\d+ min/);
  });

  it("anonymous: one marker per position and bench place, no names", () => {
    renderView({ ...liveShare(), lineup: anonymous });

    const section = screen.getByTestId("public-match-lineup");
    expect(screen.getAllByTestId("public-lineup-token")).toHaveLength(3);
    expect(screen.getAllByTestId("public-bench-marker")).toHaveLength(2);
    expect(section.textContent).not.toMatch(/Frida|Ida|Emma|Nora/);
    expect(section.textContent).toContain("2 spillere på benken");
  });

  it("after the match: the starting lineup, clearly marked; an older match says it is missing", () => {
    renderView({ ...liveShare(), phase: "completed", live: null, lineup: { ...named, kind: "start" } });
    expect(screen.getByTestId("public-match-lineup").textContent).toContain(no.publicMatch.lineup.startTitle);
    expect(screen.getByTestId("public-match-lineup-start-note").textContent).toBe(no.publicMatch.lineup.startNote);
    cleanup();

    renderView({ ...liveShare(), phase: "completed", live: null, lineup: { kind: "start", available: false } });
    expect(screen.getByTestId("public-match-lineup-unavailable").textContent).toBe(no.publicMatch.lineup.startUnavailable);
    expect(screen.getByTestId("public-match-hero")).toBeTruthy();
  });

  it("an open page drops the names, then the lineup, as the coach lowers the level and turns it off", async () => {
    const answers = [
      { ...liveShare(), lineup: anonymous },
      { ...liveShare(), lineup: null },
    ];
    const fetchMock = vi.fn(async () => jsonResponse(200, { fetchedAt: FETCHED_AT, share: answers.shift() }));
    vi.stubGlobal("fetch", fetchMock);
    renderView({ ...liveShare(), detailLevel: "detailed", lineup: named }, "match-share:abc");
    await advance(0);
    expect(screen.getByTestId("public-match-lineup").textContent).toContain("Frida");

    act(() => signal.handlers?.onSignal());
    await advance(300);
    expect(screen.getByTestId("public-match-lineup").textContent).not.toContain("Frida");
    expect(screen.getAllByTestId("public-bench-marker")).toHaveLength(2);

    await advance(2_000);
    act(() => signal.handlers?.onSignal());
    await advance(300);
    expect(screen.queryByTestId("public-match-lineup")).toBeNull();
  });
});
