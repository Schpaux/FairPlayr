import { describe, expect, it } from "vitest";
import {
  createLiveMatchFromSetup,
  endLiveMatch,
  startLiveMatch,
  substitutePlayers,
  type LiveMatchState,
} from "@/domain/liveMatch";
import { ALL_FORMATS, FORMAT_FIELD_COUNT, getFormationPresets, type MatchFormat } from "@/domain/match";
import { swapLivePositions } from "@/domain/positionSwap";
import {
  DEFAULT_SUGGESTION_MIN_GAP_SECONDS,
  getLiveKeeperPlayerIds,
  getSubstitutionSuggestion,
} from "@/domain/substitutionSuggestion";

const T0 = 1_000_000;
const SEC = 1_000;
const MIN = 60_000;

/** A match in `format` just kicked off at T0, `bench` players on the bench. p1 starts in the first slot. */
function kickedOff(format: MatchFormat = "7v7", bench = 2): LiveMatchState {
  const formation = getFormationPresets(format)[0];
  const field = FORMAT_FIELD_COUNT[format];
  const ids = Array.from({ length: field + bench }, (_, index) => `p${index + 1}`);
  const starters = ids.slice(0, field);
  const state = createLiveMatchFromSetup({
    id: `setup-${format}`,
    teamId: "team-1",
    format,
    reportEnabled: false,
    formationId: formation.id,
    duration: { mode: "preset", presetId: "2x20", halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
    selectedPlayerIds: ids,
    startingPlayerIds: starters,
    slotAssignments: Object.fromEntries(formation.slots.map((slot, index) => [slot.id, starters[index]])),
    createdAt: "2026-10-15T10:00:00.000Z",
    updatedAt: "2026-10-15T10:00:00.000Z",
  });
  return startLiveMatch(state, T0);
}

function slotIds(state: LiveMatchState): string[] {
  return getFormationPresets(state.format).find((preset) => preset.id === state.formationId)!.slots.map((slot) => slot.id);
}

const productOptions = (state: LiveMatchState) => ({
  excludePlayerIds: getLiveKeeperPlayerIds(state),
  minGapSeconds: DEFAULT_SUGGESTION_MIN_GAP_SECONDS,
});

describe("getSubstitutionSuggestion without options (unchanged behaviour)", () => {
  it("still pairs the first most-played field player with the least-played bench player at 0′ vs 0′", () => {
    const state = kickedOff();
    const suggestion = getSubstitutionSuggestion(state, T0 + SEC);

    expect(suggestion?.outgoingPlayerId).toBe("p1");
    expect(suggestion?.incomingPlayerId).toBe("p8");
    expect(suggestion?.outgoingSeconds).toBe(1);
    expect(suggestion?.incomingSeconds).toBe(0);
  });

  it("an empty options object gives the same result as no options", () => {
    const state = kickedOff();
    const now = T0 + 3 * MIN;

    expect(getSubstitutionSuggestion(state, now, {})).toEqual(getSubstitutionSuggestion(state, now));
  });

  it("still suggests when the bench player has played more (no threshold by default)", () => {
    const state = kickedOff("7v7", 1);
    const benchAhead: LiveMatchState = {
      ...state,
      playerAccumulatedMs: { ...state.playerAccumulatedMs, p8: 30 * MIN },
    };
    const suggestion = getSubstitutionSuggestion(benchAhead, T0 + MIN);

    expect(suggestion?.incomingPlayerId).toBe("p8");
    expect(suggestion!.outgoingSeconds - suggestion!.incomingSeconds).toBeLessThan(0);
  });

  it("returns null for an ended match or an empty bench", () => {
    const state = kickedOff();
    expect(getSubstitutionSuggestion(endLiveMatch(state, T0 + 5 * MIN), T0 + 6 * MIN)).toBeNull();
    expect(getSubstitutionSuggestion(kickedOff("7v7", 0), T0 + 30 * MIN)).toBeNull();
  });
});

describe("getLiveKeeperPlayerIds", () => {
  it("is the player in the first formation slot", () => {
    expect(getLiveKeeperPlayerIds(kickedOff("7v7"))).toEqual(["p1"]);
    expect(getLiveKeeperPlayerIds(kickedOff("11v11"))).toEqual(["p1"]);
  });

  it("is empty in 3v3, which has no keeper", () => {
    expect(getLiveKeeperPlayerIds(kickedOff("3v3"))).toEqual([]);
  });

  it("follows a position swap into the keeper slot", () => {
    const state = kickedOff("7v7");
    const [keeperSlot, otherSlot] = slotIds(state);
    const swapped = swapLivePositions(state, keeperSlot, otherSlot);

    expect(getLiveKeeperPlayerIds(swapped)).toEqual(["p2"]);
  });

  it("follows a substitution of the keeper", () => {
    const state = substitutePlayers(kickedOff("7v7"), "p1", "p8", T0 + 5 * MIN);
    expect(getLiveKeeperPlayerIds(state)).toEqual(["p8"]);
  });

  it("is empty when the keeper slot is empty", () => {
    const state = kickedOff("7v7");
    const [keeperSlot] = slotIds(state);
    const emptied: LiveMatchState = {
      ...state,
      liveSlotAssignments: { ...state.liveSlotAssignments, [keeperSlot]: null },
    };

    expect(getLiveKeeperPlayerIds(emptied)).toEqual([]);
  });
});

describe("getSubstitutionSuggestion with the product rules (MATCH-09)", () => {
  it("never suggests anything right after kick-off (0′ vs 0′)", () => {
    const state = kickedOff();

    expect(getSubstitutionSuggestion(state, T0, productOptions(state))).toBeNull();
    expect(getSubstitutionSuggestion(state, T0 + SEC, productOptions(state))).toBeNull();
  });

  it("stays silent below the 4-minute gap and appears exactly at it", () => {
    const state = kickedOff();

    expect(getSubstitutionSuggestion(state, T0 + 4 * MIN - SEC, productOptions(state))).toBeNull();

    const suggestion = getSubstitutionSuggestion(state, T0 + 4 * MIN, productOptions(state));
    expect(suggestion).not.toBeNull();
    expect(suggestion!.outgoingSeconds - suggestion!.incomingSeconds).toBe(240);
  });

  it("never suggests the keeper, even when the keeper has played the most", () => {
    const state = kickedOff();
    const suggestion = getSubstitutionSuggestion(state, T0 + 10 * MIN, productOptions(state));

    expect(suggestion?.outgoingPlayerId).toBe("p2");
    expect(suggestion?.incomingPlayerId).toBe("p8");
    expect(suggestion?.topFieldPlayerIds).not.toContain("p1");
  });

  it("excludes whoever is in the keeper slot now, not the starting keeper", () => {
    const state = kickedOff();
    const [keeperSlot, otherSlot] = slotIds(state);
    const swapped = swapLivePositions(state, keeperSlot, otherSlot);
    const suggestion = getSubstitutionSuggestion(swapped, T0 + 10 * MIN, productOptions(swapped));

    expect(suggestion?.outgoingPlayerId).toBe("p1");
    expect(suggestion?.topFieldPlayerIds).not.toContain("p2");
  });

  it("pairs the most-played outfield player with the least-played bench player", () => {
    let state = kickedOff("7v7", 2);
    state = substitutePlayers(state, "p3", "p8", T0 + 6 * MIN);
    const now = T0 + 12 * MIN;
    const suggestion = getSubstitutionSuggestion(state, now, productOptions(state));

    // p2, p4–p7 have 12′, p8 has 6′; bench: p3 6′, p9 0′.
    expect(suggestion?.outgoingPlayerId).toBe("p2");
    expect(suggestion?.incomingPlayerId).toBe("p9");
  });

  it("the gap is between the two players in the pair", () => {
    let state = kickedOff("5v5", 1);
    // p2 off at 8′, p6 on. At 10′: outfield max 10′ (p3–p5), bench p2 8′: gap 2′.
    state = substitutePlayers(state, "p2", "p6", T0 + 8 * MIN);

    expect(getSubstitutionSuggestion(state, T0 + 10 * MIN, productOptions(state))).toBeNull();
    // Only field clocks advance: at 12′ it is 12′ vs 8′, a 4′ gap.
    expect(getSubstitutionSuggestion(state, T0 + 12 * MIN, productOptions(state))?.incomingPlayerId).toBe("p2");
  });

  it("returns null when the keeper is the only player on the field who could go off", () => {
    const state = kickedOff("7v7", 2);
    const keeperOnly: LiveMatchState = { ...state, onFieldPlayerIds: ["p1"] };

    expect(getSubstitutionSuggestion(keeperOnly, T0 + 20 * MIN, productOptions(keeperOnly))).toBeNull();
  });

  it("uses a configured threshold", () => {
    const state = kickedOff();
    const options = { excludePlayerIds: getLiveKeeperPlayerIds(state), minGapSeconds: 120 };

    expect(getSubstitutionSuggestion(state, T0 + 2 * MIN - SEC, options)).toBeNull();
    expect(getSubstitutionSuggestion(state, T0 + 2 * MIN, options)).not.toBeNull();
  });

  it("3v3 has no keeper: any field player can be suggested after the gap", () => {
    const state = kickedOff("3v3", 2);

    expect(getSubstitutionSuggestion(state, T0 + SEC, productOptions(state))).toBeNull();
    expect(getSubstitutionSuggestion(state, T0 + 4 * MIN, productOptions(state))?.outgoingPlayerId).toBe("p1");
  });

  it.each(ALL_FORMATS)("%s: silent at kick-off, then a non-keeper suggestion after 4′", (format) => {
    const state = kickedOff(format, 2);
    const keeper = getLiveKeeperPlayerIds(state);

    expect(keeper).toEqual(format === "3v3" ? [] : ["p1"]);
    expect(getSubstitutionSuggestion(state, T0 + SEC, productOptions(state))).toBeNull();

    const suggestion = getSubstitutionSuggestion(state, T0 + 5 * MIN, productOptions(state));
    expect(suggestion).not.toBeNull();
    expect(keeper).not.toContain(suggestion!.outgoingPlayerId);
    expect(state.benchPlayerIds).toContain(suggestion!.incomingPlayerId);
  });
});
