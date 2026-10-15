/**
 * Persists per-team match setup preferences in localStorage.
 *
 * These are the "team defaults" that pre-fill a new match: format, formation,
 * and duration preset. Only the team settings (Kampstandard) write them:
 * changing a value in Match Setup changes that match, never the defaults.
 *
 * Works for both guest-local and cloud users (no server state required).
 */

import type { MatchFormat, MatchDurationPresetId } from "@/domain/match";

export interface TeamMatchPrefs {
  format?: MatchFormat;
  formationId?: string;
  durationPresetId?: MatchDurationPresetId;
}

const STORAGE_KEY = "fairplayr.teamPrefs.v1";

function readAll(): Record<string, TeamMatchPrefs> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, TeamMatchPrefs>;
    }
  } catch {
    // Ignore corrupt data
  }
  return {};
}

function writeAll(data: Record<string, TeamMatchPrefs>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota errors
  }
}

/** Read stored preferences for a specific team. Returns empty object if none. */
export function getTeamMatchPrefs(teamId: string): TeamMatchPrefs {
  return readAll()[teamId] ?? {};
}

/** Merge and persist updated preferences for a team. */
export function saveTeamMatchPrefs(teamId: string, prefs: Partial<TeamMatchPrefs>): void {
  const all = readAll();
  all[teamId] = { ...all[teamId], ...prefs };
  writeAll(all);
}

/** Remove stored preferences for a team (e.g. on team deletion). */
export function clearTeamMatchPrefs(teamId: string): void {
  const all = readAll();
  delete all[teamId];
  writeAll(all);
}
