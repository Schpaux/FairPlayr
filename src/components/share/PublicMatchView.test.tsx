// FEAT-SHARE-01: before kick-off the public page counts down only to a real
// kick-off. Without one it waits for the coach, and never counts from the
// time the link was made.
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicMatchView } from "@/components/share/PublicMatchView";
import type { PublicMatchShare } from "@/domain/matchShare";
import no from "../../../messages/no.json";

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

const FETCHED_AT = "2026-10-26T16:00:00.000Z";

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
  };
}

function renderView(share: PublicMatchShare) {
  return render(
    <NextIntlClientProvider locale="no" messages={no}>
      <PublicMatchView token={"a".repeat(43)} locale="no" initialShare={share} initialFetchedAt={FETCHED_AT} />
    </NextIntlClientProvider>
  );
}

describe("PublicMatchView before kick-off", () => {
  afterEach(cleanup);

  it("without a kick-off time: «Venter på avspark», no countdown and no kick-off line", () => {
    renderView(upcoming(null));

    expect(screen.getByTestId("public-match-waiting").textContent).toContain(no.publicMatch.waitingForKickoff);
    expect(screen.queryByTestId("public-match-countdown")).toBeNull();
    expect(screen.queryByText(/Avspark /)).toBeNull();
  });

  it("with a kick-off time ahead: a countdown to it", () => {
    renderView(upcoming("2026-10-26T17:30:00.000Z"));

    expect(screen.getByTestId("public-match-countdown").textContent).toContain("1 t 30 min");
    expect(screen.queryByTestId("public-match-waiting")).toBeNull();
  });
});
