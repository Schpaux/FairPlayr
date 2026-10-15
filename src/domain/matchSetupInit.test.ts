import { describe, expect, it } from "vitest";
import {
  createMatchSetupWithPrefs,
  getFormationSlots,
  selectAllSquad,
  setMatchFormation,
  type MatchConfig,
  type MatchSetupPrefs,
} from "@/domain/match";
import { createLiveMatchFromSetup } from "@/domain/liveMatch";
import { chooseInitialSetup } from "@/domain/matchSetupInit";

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
