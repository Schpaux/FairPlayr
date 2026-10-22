import { describe, expect, it } from "vitest";
import {
  autoFillLineup,
  canStartMatch,
  createMatchSetupWithPrefs,
  getBenchPlayerIds,
  getFormationSlots,
  selectAllSquad,
  setMatchFormation,
  toggleSquadPlayer,
  type MatchConfig,
  type MatchSetupPrefs,
} from "@/domain/match";
import { createLiveMatchFromSetup } from "@/domain/liveMatch";
import { chooseInitialSetup, preselectSquad } from "@/domain/matchSetupInit";

const TEAM_ID = "team-1";
const PLAYER_IDS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
const PREFS_2_3_1: MatchSetupPrefs = { format: "7v7", formationId: "7v7-2-3-1", durationPresetId: "2x25" };

function previousMatch(formationId = "7v7-3-2-1", teamId = TEAM_ID): MatchConfig {
  const base = createMatchSetupWithPrefs(teamId, { format: "7v7", formationId });
  return selectAllSquad(base, PLAYER_IDS);
}

/** Outfield line sizes from back to front, grouping slots by depth (y). */
function lineCounts(formationId: string): number[] {
  const ys = getFormationSlots("7v7", formationId)
    .slice(1) // keeper
    .map((slot) => slot.y)
    .sort((a, b) => b - a);
  const lines: number[][] = [];
  for (const y of ys) {
    const line = lines.at(-1);
    if (line && line[0] - y <= 8) line.push(y);
    else lines.push([y]);
  }
  return lines.map((line) => line.length);
}

describe("chooseInitialSetup (FP-MS2.1-A3)", () => {
  it("starts a new match from the team defaults when nothing is stored", () => {
    const initial = chooseInitialSetup(null, PREFS_2_3_1, TEAM_ID, PLAYER_IDS);

    expect(initial.kind).toBe("fresh");
    if (initial.kind === "active") return;
    expect(initial.setup).toMatchObject({
      teamId: TEAM_ID,
      format: "7v7",
      formationId: "7v7-2-3-1",
      duration: { presetId: "2x25", totalMinutes: 50 },
      selectedPlayerIds: [],
    });
  });

  it("starts from the team defaults, not the last match, once that match has ended", () => {
    const ended = { config: previousMatch("7v7-3-2-1"), status: "ended" as const };

    const initial = chooseInitialSetup(ended, PREFS_2_3_1, TEAM_ID, PLAYER_IDS);

    expect(initial.kind).toBe("fresh");
    if (initial.kind === "active") return;
    expect(initial.setup.formationId).toBe("7v7-2-3-1");
    expect(initial.setup.id).not.toBe(ended.config.id);
  });

  it("resumes an unfinished draft for the same team, keeping its own formation", () => {
    const draft = { config: previousMatch("7v7-3-2-1"), status: "draft" as const };

    const initial = chooseInitialSetup(draft, PREFS_2_3_1, TEAM_ID, PLAYER_IDS);

    expect(initial).toMatchObject({
      kind: "resume",
      setup: { id: draft.config.id, formationId: "7v7-3-2-1", selectedPlayerIds: PLAYER_IDS },
    });
  });

  it("drops players who left the team from a resumed draft", () => {
    const draft = { config: previousMatch("7v7-3-2-1"), status: "draft" as const };

    const initial = chooseInitialSetup(draft, PREFS_2_3_1, TEAM_ID, PLAYER_IDS.slice(1));

    expect(initial.kind).toBe("resume");
    if (initial.kind === "active") return;
    expect(initial.setup.selectedPlayerIds).toEqual(PLAYER_IDS.slice(1));
  });

  it("ignores another team's draft", () => {
    const draft = { config: previousMatch("7v7-3-2-1", "team-2"), status: "draft" as const };

    const initial = chooseInitialSetup(draft, PREFS_2_3_1, TEAM_ID, PLAYER_IDS);

    expect(initial.kind).toBe("fresh");
    if (initial.kind === "active") return;
    expect(initial.setup).toMatchObject({ teamId: TEAM_ID, formationId: "7v7-2-3-1" });
  });

  it("never opens an editor over an active match", () => {
    const active = { config: previousMatch("7v7-3-2-1"), status: "active" as const };

    expect(chooseInitialSetup(active, PREFS_2_3_1, TEAM_ID, PLAYER_IDS)).toEqual({ kind: "active" });
  });

  it("falls back to the format's first formation only for an unknown default", () => {
    const initial = chooseInitialSetup(null, { format: "7v7", formationId: "7v7-2-2-1" }, TEAM_ID, PLAYER_IDS);

    if (initial.kind === "active") throw new Error("unexpected");
    expect(initial.setup.formationId).toBe("7v7-2-3-1");
  });
});

// U9 (DESIGN.md §7): a new setup starts with the whole squad, but nobody on
// the pitch, and a resumed draft or a running match is never changed.
describe("squad preselection (U9)", () => {
  const PRESELECT = { preselectSquad: true };
  const emptyPitch = (setup: MatchConfig) => Object.values(setup.slotAssignments).every((id) => id === null);

  it("preselectSquad selects every team player and places nobody on the pitch", () => {
    const fresh = createMatchSetupWithPrefs(TEAM_ID, PREFS_2_3_1);

    const preselected = preselectSquad(fresh, PLAYER_IDS);

    expect(preselected.selectedPlayerIds).toEqual(PLAYER_IDS);
    expect(preselected.startingPlayerIds).toEqual([]);
    expect(Object.keys(preselected.slotAssignments)).toEqual(Object.keys(fresh.slotAssignments));
    expect(emptyPitch(preselected)).toBe(true);
    expect(getBenchPlayerIds(preselected)).toEqual(PLAYER_IDS);
    expect(canStartMatch(preselected)).toBe(false);
    // Pure: the input is not changed.
    expect(fresh.selectedPlayerIds).toEqual([]);
  });

  it("preselectSquad ignores duplicate ids and keeps an empty team empty", () => {
    const fresh = createMatchSetupWithPrefs(TEAM_ID, PREFS_2_3_1);

    expect(preselectSquad(fresh, ["p1", "p2", "p1"]).selectedPlayerIds).toEqual(["p1", "p2"]);
    expect(preselectSquad(fresh, []).selectedPlayerIds).toEqual([]);
  });

  it("is off by default: a fresh setup starts with an empty squad, as before", () => {
    const initial = chooseInitialSetup(null, PREFS_2_3_1, TEAM_ID, PLAYER_IDS);
    if (initial.kind !== "fresh") throw new Error("unexpected");
    expect(initial.setup.selectedPlayerIds).toEqual([]);

    const explicit = chooseInitialSetup(null, PREFS_2_3_1, TEAM_ID, PLAYER_IDS, { preselectSquad: false });
    if (explicit.kind !== "fresh") throw new Error("unexpected");
    expect(explicit.setup.selectedPlayerIds).toEqual([]);
  });

  it("a fresh setup starts with the whole squad, an empty pitch and Start not allowed", () => {
    const initial = chooseInitialSetup(null, PREFS_2_3_1, TEAM_ID, PLAYER_IDS, PRESELECT);

    if (initial.kind !== "fresh") throw new Error("unexpected");
    expect(initial.setup).toMatchObject({ formationId: "7v7-2-3-1", selectedPlayerIds: PLAYER_IDS, startingPlayerIds: [] });
    expect(emptyPitch(initial.setup)).toBe(true);
    expect(canStartMatch(initial.setup)).toBe(false);
    // Only an explicit fill makes it startable.
    expect(canStartMatch(autoFillLineup(initial.setup))).toBe(true);
  });

  it("also preselects after an ended match and for another team's draft (both are fresh)", () => {
    const ended = { config: previousMatch("7v7-3-2-1"), status: "ended" as const };
    const otherTeam = { config: previousMatch("7v7-3-2-1", "team-2"), status: "draft" as const };

    for (const stored of [ended, otherTeam]) {
      const initial = chooseInitialSetup(stored, PREFS_2_3_1, TEAM_ID, PLAYER_IDS.slice(0, 5), PRESELECT);
      if (initial.kind !== "fresh") throw new Error("unexpected");
      expect(initial.setup.selectedPlayerIds).toEqual(PLAYER_IDS.slice(0, 5));
      expect(initial.setup.startingPlayerIds).toEqual([]);
      expect(emptyPitch(initial.setup)).toBe(true);
    }
  });

  it("a removed player leaves the squad, and a removed starter also leaves the pitch", () => {
    const initial = chooseInitialSetup(null, PREFS_2_3_1, TEAM_ID, PLAYER_IDS, PRESELECT);
    if (initial.kind !== "fresh") throw new Error("unexpected");

    const absent = toggleSquadPlayer(initial.setup, "p8");
    expect(absent.selectedPlayerIds).not.toContain("p8");

    const filled = autoFillLineup(initial.setup);
    const starter = filled.startingPlayerIds[0];
    const withoutStarter = toggleSquadPlayer(filled, starter);
    expect(withoutStarter.selectedPlayerIds).not.toContain(starter);
    expect(withoutStarter.startingPlayerIds).not.toContain(starter);
    expect(Object.values(withoutStarter.slotAssignments)).not.toContain(starter);
    expect(canStartMatch(withoutStarter)).toBe(false);
  });

  it("resume keeps the draft's explicit selection exactly", () => {
    const base = createMatchSetupWithPrefs(TEAM_ID, PREFS_2_3_1);
    const draft = { config: selectAllSquad(base, ["p1", "p3"]), status: "draft" as const };

    const initial = chooseInitialSetup(draft, PREFS_2_3_1, TEAM_ID, PLAYER_IDS, PRESELECT);

    expect(initial).toMatchObject({ kind: "resume", setup: { id: draft.config.id, selectedPlayerIds: ["p1", "p3"] } });
  });

  it("resume does not auto-add new team players", () => {
    const base = createMatchSetupWithPrefs(TEAM_ID, PREFS_2_3_1);
    const draft = { config: autoFillLineup(selectAllSquad(base, PLAYER_IDS)), status: "draft" as const };
    const grownTeam = [...PLAYER_IDS, "p9", "p10"];

    const initial = chooseInitialSetup(draft, PREFS_2_3_1, TEAM_ID, grownTeam, PRESELECT);

    if (initial.kind !== "resume") throw new Error("unexpected");
    expect(initial.setup.selectedPlayerIds).toEqual(PLAYER_IDS);
    expect(initial.setup.startingPlayerIds).toEqual(draft.config.startingPlayerIds);
    expect(initial.setup.slotAssignments).toEqual(draft.config.slotAssignments);
  });

  it("resume keeps an empty squad empty", () => {
    const draft = { config: createMatchSetupWithPrefs(TEAM_ID, PREFS_2_3_1), status: "draft" as const };

    const initial = chooseInitialSetup(draft, PREFS_2_3_1, TEAM_ID, PLAYER_IDS, PRESELECT);

    if (initial.kind !== "resume") throw new Error("unexpected");
    expect(initial.setup.selectedPlayerIds).toEqual([]);
  });

  it("never touches an active match", () => {
    const active = { config: previousMatch("7v7-3-2-1"), status: "active" as const };
    const snapshot = structuredClone(active);

    expect(chooseInitialSetup(active, PREFS_2_3_1, TEAM_ID, [...PLAYER_IDS, "p9"], PRESELECT)).toEqual({
      kind: "active",
    });
    expect(active).toEqual(snapshot);
  });
});

describe("7v7 formations", () => {
  const SHAPES = [
    ["7v7-2-3-1", [2, 3, 1]],
    ["7v7-3-2-1", [3, 2, 1]],
    ["7v7-2-2-2", [2, 2, 2]],
  ] as const;

  it.each(SHAPES)("%s places its outfield players in lines of %j", (formationId, lines) => {
    expect(lineCounts(formationId)).toEqual(lines);
  });

  it.each(SHAPES)("%s keeps its identity from team default through setup to live", (formationId) => {
    const initial = chooseInitialSetup(null, { format: "7v7", formationId }, TEAM_ID, PLAYER_IDS);
    if (initial.kind === "active") throw new Error("unexpected");

    const live = createLiveMatchFromSetup(selectAllSquad(initial.setup, PLAYER_IDS));

    expect(initial.setup.formationId).toBe(formationId);
    expect(live.formationId).toBe(formationId);
  });

  it("changing one match's formation does not change the defaults it came from", () => {
    const prefs = { ...PREFS_2_3_1 };
    const initial = chooseInitialSetup(null, prefs, TEAM_ID, PLAYER_IDS);
    if (initial.kind === "active") throw new Error("unexpected");

    const changed = setMatchFormation(initial.setup, "7v7-3-2-1");

    expect(changed.formationId).toBe("7v7-3-2-1");
    expect(prefs).toEqual(PREFS_2_3_1);
  });
});
