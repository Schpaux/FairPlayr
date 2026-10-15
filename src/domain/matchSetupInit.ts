/**
 * Decides where Match Setup starts from when it opens (FP-MS2.1-A3).
 *
 * Team defaults own format, formation and duration for every new match. A
 * stored setup only takes over when it is an unfinished draft for the same
 * team, and the caller must show that a draft is being resumed. Opening setup
 * never decides anything about the team defaults themselves.
 */

import {
  createMatchSetupWithPrefs,
  reconcileWithTeam,
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

export function chooseInitialSetup(
  stored: StoredSetupSnapshot | null,
  prefs: MatchSetupPrefs,
  teamId: string,
  teamPlayerIds: string[]
): InitialSetup {
  if (stored?.status === "active") {
    return { kind: "active" };
  }

  // An ended match, a draft for another team or no stored setup at all: the
  // previous configuration is history, so the team defaults win.
  if (stored?.status === "draft" && stored.config.teamId === teamId) {
    return { kind: "resume", setup: reconcileWithTeam(stored.config, teamPlayerIds) };
  }

  return { kind: "fresh", setup: createMatchSetupWithPrefs(teamId, prefs) };
}
