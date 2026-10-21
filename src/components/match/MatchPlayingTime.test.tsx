import { cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchPlayingTime } from "@/components/match/MatchPlayingTime";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";
import type { MatchPlayingTimeSummary, PlayerPlayingTime } from "@/domain/matchPlayingTime";
import no from "../../../messages/no.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

function player(playerId: string, minutes: number, gapMinutes: number): PlayerPlayingTime {
  return { playerId, seconds: minutes * 60, minutes, role: "starter", gapMinutes };
}

// Fair share 20′: 16′ is exactly 4′ below, 17′ is 3′ below.
const SUMMARY: MatchPlayingTimeSummary = {
  players: [player("a", 16, -4), player("b", 17, -3), player("c", 27, 7)],
  fairShare: { fieldSlots: 5, squadSize: 6, playedSeconds: 1440, playedMinutes: 24, seconds: 1200, minutes: 20 },
  gaps: [],
};
const NAMES = new Map([["a", "Alma"], ["b", "Bea"], ["c", "Cora"]]);

describe("MatchPlayingTime", () => {
  afterEach(cleanup);

  it("calls out a gap from exactly 4′ below fair share, not 3′", () => {
    renderWithIntl(<MatchPlayingTime summary={SUMMARY} names={NAMES} />);

    expect(screen.getByTestId("playing-time-a").textContent).toContain("4′ under rettferdig andel");
    expect(screen.getByTestId("playing-time-b").textContent).not.toContain("under rettferdig andel");
    expect(screen.getByTestId("playing-time-c").textContent).not.toContain("under rettferdig andel");
  });

  it("marks only the least played, and nobody when everyone played the same", () => {
    renderWithIntl(<MatchPlayingTime summary={SUMMARY} names={NAMES} />);
    expect(screen.getAllByText(no.matchPlanner.playingTime.leastPlayed)).toHaveLength(1);
    expect(screen.getByTestId("playing-time-a").textContent).toContain(no.matchPlanner.playingTime.leastPlayed);
    cleanup();

    const even = { ...SUMMARY, players: [player("a", 20, 0), player("b", 20, 0)] };
    renderWithIntl(<MatchPlayingTime summary={even} names={NAMES} />);
    expect(screen.queryByText(no.matchPlanner.playingTime.leastPlayed)).toBeNull();
  });

  it("qualifies a live match's minutes before the list and names the notes", () => {
    renderWithIntl(
      <MatchPlayingTime summary={{ ...SUMMARY, gaps: ["clockNotStopped"] }} names={NAMES} isLive />
    );

    const section = screen.getByTestId("match-playing-time");
    const live = screen.getByText(no.matchPlanner.playingTime.live);
    const list = screen.getByRole("list", { name: no.matchPlanner.playingTime.listLabel });
    expect(live.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.contains(screen.getByRole("list", { name: no.matchPlanner.playingTime.notesLabel }))).toBe(true);
    expect(screen.getByText(no.matchPlanner.playingTime.gaps.clockNotStopped)).toBeTruthy();
  });
});
