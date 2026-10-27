// FEAT-SHARE-04: the public lineup. The kick-off lineup is captured once at
// the first ▶ (changes before it included, substitutions after it never), and
// the public answer carries a lineup only under the share's rules: only with
// «Del live», the kind that belongs to the phase, names only at the detailed
// level, and never more than a name per position or bench place.
import { describe, expect, it } from "vitest";
import {
  createLiveMatchFromSetup,
  pauseLiveMatch,
  repositionLivePlayers,
  startLiveMatch,
  substitutePlayers,
  type LiveMatchState,
} from "@/domain/liveMatch";
import type { MatchSetup } from "@/domain/match";
import { createSubstitutionEvent } from "@/domain/matchEvent";
import { applySubstitution, undoSubstitution } from "@/domain/substitutionUndo";
import { normalizeLiveMatchState } from "@/lib/storage/liveMatchStorage";
import {
  normalizeShareSettings,
  plannedShareLineup,
  samePlannedLineup,
  sanitizePlannedLineup,
  sanitizePublicLineup,
  sanitizePublicMatchShare,
  type PublicMatchShare,
} from "@/domain/matchShare";

const MIN = 60_000;
const KICKOFF = 1_000_000;

function setup(): MatchSetup {
  return {
    id: "setup-1",
    teamId: "team-1",
    format: "5v5",
    reportEnabled: false,
    formationId: "5v5-2-2",
    duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
    selectedPlayerIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7"],
    startingPlayerIds: ["p1", "p2", "p3", "p4", "p5"],
    slotAssignments: { "5v5-1": "p1", "5v5-2": "p2", "5v5-3": "p3", "5v5-4": "p4", "5v5-5": "p5" },
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
  } as MatchSetup;
}

function ready(): LiveMatchState {
  return createLiveMatchFromSetup(setup());
}

describe("kick-off lineup", () => {
  it("is missing before the first ▶ and set once at it", () => {
    const state = ready();
    expect(state.kickoffLineup).toBeUndefined();

    const started = startLiveMatch(state, KICKOFF);
    expect(started.kickoffLineup).toEqual({
      format: "5v5",
      formationId: "5v5-2-2",
      slotAssignments: { "5v5-1": "p1", "5v5-2": "p2", "5v5-3": "p3", "5v5-4": "p4", "5v5-5": "p5" },
      benchPlayerIds: ["p6", "p7"],
    });
  });

  it("includes changes made before the first ▶", () => {
    let state = ready();
    state = substitutePlayers(state, "p5", "p6", KICKOFF - MIN);
    state = repositionLivePlayers(state, "5v5-2", "5v5-3");
    const started = startLiveMatch(state, KICKOFF);

    expect(started.kickoffLineup?.slotAssignments).toMatchObject({ "5v5-2": "p3", "5v5-3": "p2", "5v5-5": "p6" });
    expect(started.kickoffLineup?.benchPlayerIds).toEqual(["p5", "p7"]);
  });

  it("is never overwritten by substitutions, undo, swaps, pause or the second half", () => {
    const started = startLiveMatch(ready(), KICKOFF);
    const snapshot = started.kickoffLineup;

    const event = createSubstitutionEvent({ minute: 5, timestampMs: 5 * MIN, inPlayerId: "p6", outPlayerId: "p2" });
    const applied = applySubstitution(started, "p2", "p6", KICKOFF + 5 * MIN, event)!;
    expect(applied.state.liveSlotAssignments["5v5-2"]).toBe("p6");
    expect(applied.state.kickoffLineup).toEqual(snapshot);

    const undone = undoSubstitution(applied.state, applied.record);
    expect(undone.liveSlotAssignments["5v5-2"]).toBe("p2");
    expect(undone.benchPlayerIds).toContain("p6");
    expect(undone.kickoffLineup).toEqual(snapshot);

    const swapped = repositionLivePlayers(undone, "5v5-4", "5v5-5");
    const resumed = startLiveMatch(pauseLiveMatch(swapped, KICKOFF + 6 * MIN), KICKOFF + 7 * MIN);
    expect(resumed.liveSlotAssignments["5v5-4"]).toBe("p5");
    expect(resumed.kickoffLineup).toEqual(snapshot);
  });

  it("survives storage, and an older match without one is never given a guessed one", () => {
    const started = startLiveMatch(ready(), KICKOFF);
    expect(normalizeLiveMatchState(JSON.parse(JSON.stringify(started)))?.kickoffLineup).toEqual(started.kickoffLineup);

    const older: Record<string, unknown> = JSON.parse(JSON.stringify(started));
    delete older.kickoffLineup;
    expect(normalizeLiveMatchState(older)?.kickoffLineup).toBeUndefined();

    const broken = { ...older, kickoffLineup: { format: "5v5", slotAssignments: "x" } };
    expect(normalizeLiveMatchState(broken)?.kickoffLineup).toBeUndefined();
  });
});

describe("lineup setting", () => {
  it("is off by default and only on under «Del live»", () => {
    expect(normalizeShareSettings({ live: true }).lineup).toBe(false);
    expect(normalizeShareSettings({ live: true, lineup: true }).lineup).toBe(true);
    expect(normalizeShareSettings({ live: false, summary: true, lineup: true }).lineup).toBe(false);
    expect(normalizeShareSettings({ live: true, lineup: "true" }).lineup).toBe(false);
  });
});

/** A careless lineup: ids, numbers, initials and minutes that must never reach the page. */
function rawLineup(kind: string, overrides: Record<string, unknown> = {}) {
  return {
    kind,
    available: true,
    format: "5v5",
    formationId: "5v5-2-2",
    field: [
      { slot: "5v5-1", name: "Frida Berg", playerId: "p1", number: 1, initials: "FB", minutes: 25 },
      { slot: "5v5-2", name: " Ida ", id: "p2" },
      { slot: "5v5-2", name: "Duplicate" },
      { slot: "bad slot!", name: "X" },
    ],
    bench: [{ name: "Emma", playerId: "p6", number: 6 }, { minutes: 3 }],
    ...overrides,
  };
}

function rawAnswer(overrides: Record<string, unknown>) {
  return {
    phase: "live",
    teamName: "Lyn G14",
    opponentName: "Strindheim",
    startsAt: "2026-10-27T10:00:00.000Z",
    shareLive: true,
    shareSummary: true,
    detailLevel: "detailed",
    live: { clock: { startedAtMs: 1, pausedAtMs: null, accumulatedPausedMs: 0, isRunning: true } },
    ...overrides,
  };
}

describe("public lineup", () => {
  it("named (detailed level): a name per place and nothing else", () => {
    const lineup = sanitizePublicMatchShare(rawAnswer({ lineup: rawLineup("current") }))!.lineup;
    expect(lineup).toEqual({
      kind: "current",
      available: true,
      format: "5v5",
      formationId: "5v5-2-2",
      field: [
        { slot: "5v5-1", name: "Frida Berg" },
        { slot: "5v5-2", name: "Ida" },
      ],
      bench: [{ name: "Emma" }, {}],
    });
    expect(JSON.stringify(lineup)).not.toMatch(/p1|p2|p6|"number"|initials|minutes|Duplicate/);
  });

  it("below the detailed level every place is an empty marker", () => {
    for (const detailLevel of ["status", "result"]) {
      const lineup = sanitizePublicMatchShare(rawAnswer({ detailLevel, lineup: rawLineup("current") }))!.lineup;
      expect(lineup).toMatchObject({ available: true, field: [{ slot: "5v5-1" }, { slot: "5v5-2" }], bench: [{}, {}] });
      expect(JSON.stringify(lineup)).not.toMatch(/Frida|Ida|Emma/);
    }
  });

  it("follows the phase: planned before kick-off, current while live, start after the match", () => {
    const share = (phase: string, kind: string, extra: Record<string, unknown> = {}) =>
      sanitizePublicMatchShare(rawAnswer({ phase, lineup: rawLineup(kind), ...extra }))!.lineup;

    expect(share("upcoming", "planned")?.kind).toBe("planned");
    expect(share("live", "current")?.kind).toBe("current");
    expect(share("completed", "start")?.kind).toBe("start");
    // A live row whose clock never started is still before kick-off.
    expect(share("live", "current", { live: { clock: { startedAtMs: null } } })?.kind).toBe("planned");
    // The live lineup is never shown as the starting lineup, or the other way round.
    expect(share("completed", "current")).toBeNull();
    expect(share("live", "start")).toBeNull();
  });

  it("is hidden without «Del live», and after the match without «Del oppsummering»", () => {
    expect(sanitizePublicMatchShare(rawAnswer({ shareLive: false, lineup: rawLineup("current") }))!.lineup).toBeNull();
    expect(
      sanitizePublicMatchShare(rawAnswer({ phase: "completed", shareSummary: false, lineup: rawLineup("start") }))!.lineup
    ).toBeNull();
    expect(sanitizePublicMatchShare(rawAnswer({}))!.lineup).toBeNull();
  });

  it("a missing or malformed lineup is a calm «not available», never a guess", () => {
    const share: Pick<PublicMatchShare, "phase" | "shareLive" | "shareSummary" | "detailLevel"> = {
      phase: "completed",
      shareLive: true,
      shareSummary: true,
      detailLevel: "detailed",
    };
    expect(sanitizePublicLineup({ kind: "start", available: false }, share)).toEqual({ kind: "start", available: false });
    expect(sanitizePublicLineup(rawLineup("start", { format: "8v8" }), share)).toEqual({ kind: "start", available: false });
    expect(sanitizePublicLineup(rawLineup("start", { formationId: "<script>" }), share)).toEqual({
      kind: "start",
      available: false,
    });
  });
});

describe("the setup's planned start (FEAT-SHARE-04, before «Start kampen»)", () => {
  it("has the starters on their positions and the rest of the squad on the bench, as the live match begins", () => {
    const config = setup();
    const planned = plannedShareLineup(config);
    const live = createLiveMatchFromSetup(config);
    expect(planned.format).toBe(live.format);
    expect(planned.formationId).toBe(live.formationId);
    expect(planned.benchPlayerIds).toEqual(live.benchPlayerIds);
    expect(Object.values(planned.slotAssignments).filter(Boolean).sort()).toEqual([...live.onFieldPlayerIds].sort());
  });

  it("a player only selected, not starting, is never on a position", () => {
    const config = setup();
    const [first, ...rest] = config.startingPlayerIds;
    const planned = plannedShareLineup({ ...config, startingPlayerIds: rest });
    expect(Object.values(planned.slotAssignments)).not.toContain(first);
    expect(planned.benchPlayerIds).toContain(first);
  });

  it("is read back only as a lineup, and compares by what the page would show", () => {
    const planned = plannedShareLineup(setup());
    expect(sanitizePlannedLineup(JSON.parse(JSON.stringify(planned)))).toEqual(planned);
    expect(sanitizePlannedLineup({ ...planned, format: "99v99" })).toBeNull();
    expect(sanitizePlannedLineup({ ...planned, benchPlayerIds: "p1" })).toBeNull();
    expect(sanitizePlannedLineup(null)).toBeNull();

    expect(samePlannedLineup(planned, { ...planned, slotAssignments: { ...planned.slotAssignments, empty: null } })).toBe(true);
    expect(samePlannedLineup(planned, { ...planned, benchPlayerIds: [...planned.benchPlayerIds].reverse().concat("x") })).toBe(false);
    expect(samePlannedLineup(planned, { ...planned, formationId: "other" })).toBe(false);
    expect(samePlannedLineup(null, null)).toBe(true);
    expect(samePlannedLineup(planned, null)).toBe(false);
  });
});
