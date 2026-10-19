import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LineupField } from "@/components/lineup/LineupField";
import { LivePitchView } from "@/components/match/LivePitchView";
import { getLineupSlots } from "@/domain/lineupLayouts";
import { INITIAL_SUB_STATE } from "@/domain/liveSubInteraction";
import { getFormationSlots } from "@/domain/match";

// FP-PITCH-01: the legacy half-pitch (flag-off live view and the team lineup)
// draws its goal at the bottom, where the keeper slot (y ≈ 85 %) stands. The
// markings are authored goal-at-top in a 100 × 80 viewBox and mirrored.

const MIRROR = "matrix(1 0 0 -1 0 80)";
const markings = () => document.querySelector("svg[viewBox='0 0 100 80'] > g");

afterEach(cleanup);

describe("legacy half-pitch orientation", () => {
  it("live view (flag off) mirrors the markings so our goal is at the bottom", () => {
    const slots = getFormationSlots("7v7", "7v7-2-3-1");
    render(
      <LivePitchView
        slots={slots}
        liveSlotAssignments={{}}
        onFieldPlayerIds={[]}
        interactionState={INITIAL_SUB_STATE}
        fatigueMap={{}}
        getShortName={(id) => id}
        onSlotTap={() => {}}
        onBackgroundTap={() => {}}
        onSlotPointerDown={() => {}}
      />
    );

    expect(markings()?.getAttribute("transform")).toBe(MIRROR);
    expect(slots[0].y).toBeGreaterThan(50); // keeper in the bottom half
  });

  it("team lineup mirrors the markings so our goal is at the bottom", () => {
    const slots = getLineupSlots("7v7");
    render(
      <LineupField
        slots={slots}
        slotAssignments={{}}
        playersById={new Map()}
        activeSlotId={null}
        slotEmptyLabel="Plass"
        onSelectSlot={() => {}}
      />
    );

    expect(markings()?.getAttribute("transform")).toBe(MIRROR);
    expect(slots[0].y).toBeGreaterThan(50);
  });
});
