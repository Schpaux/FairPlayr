/**
 * Decides where Match Setup starts from when it opens (FP-MS2.1-A3).
 *
 * Team defaults own format, formation and duration for every new match. A
 * stored setup only takes over when it is an unfinished draft for the same
 * team, and the caller must show that a draft is being resumed. Opening setup
 * never decides anything about the team defaults themselves.
 *
 * Squad preselection (U9, DESIGN.md §7): a new setup may start with the whole
 * team in the squad, so the coach only removes who is absent. It is a squad
 * suggestion, not confirmed attendance, and it never places anyone on the
 * pitch: the match cannot start until the coach fills the lineup explicitly.
 */

import {
  createMatchSetupWithPrefs,
  reconcileWithTeam,
  setSelectedSquad,
  type MatchConfig,
  type MatchSetupPrefs,
} from "@/domain/match";

export interface StoredSetupSnapshot {
  config: MatchConfig;
  status: "draft" | "active" | "ended";
}

export type InitialSetup =
  /** A started match owns the stored setup; setup must not open an editor. */
  | { kind: "active" }
  /** An unfinished draft for this team, reconciled with the current roster. */
  | { kind: "resume"; setup: MatchConfig }
  /** A new match built from the team's current defaults. */
  | { kind: "fresh"; setup: MatchConfig };

export interface InitialSetupOptions {
  /**
   * Start a *new* setup with every team player in the squad (U9). A resumed
   * draft keeps its own selection and an active match is never touched.
   * Default `false`: the squad starts empty.
   */
  preselectSquad?: boolean;
}

/**
 * Puts every team player in the squad of a new setup. It never adds anyone
 * to the pitch: a fresh setup keeps no starters and only open slots, so
 * `canStartMatch` stays false until the coach fills the lineup.
 */
export function preselectSquad(setup: MatchConfig, teamPlayerIds: string[]): MatchConfig {
  return setSelectedSquad(setup, teamPlayerIds);
}

export function chooseInitialSetup(
  stored: StoredSetupSnapshot | null,
  prefs: MatchSetupPrefs,
  teamId: string,
  teamPlayerIds: string[],
  options: InitialSetupOptions = {}
): InitialSetup {
  if (stored?.status === "active") {
    return { kind: "active" };
  }

  // An ended match, a draft for another team or no stored setup at all: the
  // previous configuration is history, so the team defaults win.
  if (stored?.status === "draft" && stored.config.teamId === teamId) {
    return { kind: "resume", setup: reconcileWithTeam(stored.config, teamPlayerIds) };
  }

  const fresh = createMatchSetupWithPrefs(teamId, prefs);
  return {
    kind: "fresh",
    setup: options.preselectSquad ? preselectSquad(fresh, teamPlayerIds) : fresh,
  };
}
