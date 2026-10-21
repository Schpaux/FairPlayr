/**
 * Match playing time — the per-player summary of a recorded match
 * (UI-DETAIL-01). Pure reader over a stored live match state (the server's
 * `runtime_state`); it changes nothing and invents nothing.
 *
 * - The squad is exactly the players the match state tracks: the keys of
 *   `playerAccumulatedMs` (seeded with 0 for every selected player when the
 *   match is created), plus anyone on the field or bench. Players outside it
 *   never appear, and a squad player who never came on is listed with 0.
 * - A player's total is `playerAccumulatedMs` plus the open spell of anyone
 *   still on the field (`onFieldStartedAtElapsedMs`), measured on the match
 *   clock. The engine only folds a spell into the accumulated total when the
 *   player goes off, so the starters still on at the final whistle are short
 *   by their last spell in the raw value.
 * - Fair share is field slots × match time played ÷ squad size (DESIGN.md
 *   §6.2), capped at the match time. Every squad player counts, played or not.
 * - What the stored state cannot support is reported in `gaps`, not filled in.
 */

import { getElapsedMsFromClock, type MatchClockBasis } from "@/domain/liveMatch";
import { ALL_FORMATS, FORMAT_FIELD_COUNT, type MatchFormat } from "@/domain/match";

export type PlayingTimeRole = "starter" | "substitute" | "unused" | "unknown";

/** Something the stored match does not record, so the summary leaves it out. */
export type PlayingTimeGap =
  /** No starting lineup: who started and who came on is unknown. */
  | "startersMissing"
  /** No usable match clock: the last spell of players on the field is missing. */
  | "openSpellsMissing"
  /** Completed with the clock still running: counted up to the state's last save. */
  | "clockNotStopped"
  /** Stored by an early build (whole seconds, no spell data). */
  | "legacyFormat";

export interface PlayerPlayingTime {
  playerId: string;
  seconds: number;
  /** Whole minutes, as the live screen shows them. */
  minutes: number;
  role: PlayingTimeRole;
  /** Displayed minutes minus the displayed fair share; null without one. */
  gapMinutes: number | null;
  /**
   * Set when the player was on the field with no usable match clock: their
   * last spell is missing, so `seconds` is only a lower bound.
   */
  incomplete?: true;
}

export interface FairShare {
  fieldSlots: number;
  squadSize: number;
  playedSeconds: number;
  playedMinutes: number;
  seconds: number;
  minutes: number;
}

export interface MatchPlayingTimeSummary {
  /** Least played first; equal minutes keep squad order. */
  players: PlayerPlayingTime[];
  fairShare: FairShare | null;
  gaps: PlayingTimeGap[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
}

function readNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function readFormat(value: unknown): MatchFormat | null {
  return ALL_FORMATS.find((format) => format === value) ?? null;
}

function readClock(value: unknown): MatchClockBasis | null {
  if (!isRecord(value)) return null;

  const startedAtMs = value.startedAtMs;
  const pausedAtMs = value.pausedAtMs;

  if (startedAtMs !== null && (typeof startedAtMs !== "number" || !Number.isFinite(startedAtMs))) return null;
  if (pausedAtMs !== null && pausedAtMs !== undefined && (typeof pausedAtMs !== "number" || !Number.isFinite(pausedAtMs))) {
    return null;
  }

  return {
    startedAtMs,
    pausedAtMs: pausedAtMs ?? null,
    accumulatedPausedMs: readNonNegative(value.accumulatedPausedMs) ?? 0,
    isRunning: value.isRunning === true,
  };
}

function uniqueInOrder(ids: string[]): string[] {
  return [...new Set(ids)];
}

interface RecordedTime {
  squad: string[];
  seconds: Map<string, number>;
  /** Players whose open spell could not be measured. */
  incomplete: Set<string>;
  playedSeconds: number | null;
  gaps: PlayingTimeGap[];
}

/**
 * When the match is over, a clock still marked running (a stale snapshot) is
 * read at the state's last save, never at "now". Null when that is unknown.
 */
function readAtMs(state: Record<string, unknown>, clock: MatchClockBasis, nowMs: number, completed: boolean): number | null {
  // A stopped clock without its stop time would keep growing with "now".
  if (completed && !clock.isRunning && clock.startedAtMs !== null && clock.pausedAtMs === null) return null;
  if (!completed || !clock.isRunning) return nowMs;

  const savedAtMs = typeof state.updatedAt === "string" ? Date.parse(state.updatedAt) : Number.NaN;
  return Number.isFinite(savedAtMs) ? Math.min(nowMs, savedAtMs) : null;
}

function readModern(
  state: Record<string, unknown>,
  accumulated: Record<string, unknown>,
  nowMs: number,
  completed: boolean
): RecordedTime {
  const gaps: PlayingTimeGap[] = [];
  const squad = uniqueInOrder([
    ...Object.keys(accumulated),
    ...readIds(state.onFieldPlayerIds),
    ...readIds(state.benchPlayerIds),
  ]);
  const clock = readClock(state.clock);
  const atMs = clock ? readAtMs(state, clock, nowMs, completed) : null;
  if (clock && completed && clock.isRunning && atMs !== null) gaps.push("clockNotStopped");
  const elapsedMs = clock && atMs !== null ? getElapsedMsFromClock(clock, atMs) : null;
  const openSince = isRecord(state.onFieldStartedAtElapsedMs) ? state.onFieldStartedAtElapsedMs : {};
  const seconds = new Map<string, number>();
  const incomplete = new Set<string>();

  for (const playerId of squad) {
    let ms = readNonNegative(accumulated[playerId]) ?? 0;
    const since = readNonNegative(openSince[playerId]);

    if (since !== null) {
      if (elapsedMs === null) {
        incomplete.add(playerId);
        if (!gaps.includes("openSpellsMissing")) gaps.push("openSpellsMissing");
      } else {
        ms += Math.max(0, elapsedMs - since);
      }
    }

    seconds.set(playerId, Math.floor(ms / 1000));
  }

  return {
    squad,
    seconds,
    incomplete,
    playedSeconds: elapsedMs === null ? null : Math.floor(elapsedMs / 1000),
    gaps,
  };
}

function readLegacy(state: Record<string, unknown>, accumulated: Record<string, unknown>): RecordedTime {
  const squad = uniqueInOrder([
    ...readIds(state.onFieldPlayerIds),
    ...readIds(state.benchPlayerIds),
    ...Object.keys(accumulated),
  ]);
  const seconds = new Map<string, number>();

  for (const playerId of squad) {
    seconds.set(playerId, Math.floor(readNonNegative(accumulated[playerId]) ?? 0));
  }

  const elapsed = readNonNegative(state.elapsedSeconds);

  return {
    squad,
    seconds,
    incomplete: new Set(),
    playedSeconds: elapsed === null ? null : Math.floor(elapsed),
    gaps: ["legacyFormat"],
  };
}

/**
 * Summarises a stored match state. Returns null when it records no squad
 * (no state, an unrelated shape, or an empty squad).
 *
 * `format` is the match's own format, used when the state does not carry one.
 * `nowMs` only matters for a match whose clock is still running. `completed`
 * says the match is over (the server's status), so a running clock is stale.
 */
export function summarizeMatchPlayingTime(
  runtimeState: unknown,
  options: { format?: MatchFormat | null; nowMs: number; completed?: boolean }
): MatchPlayingTimeSummary | null {
  if (!isRecord(runtimeState)) return null;

  const recorded = isRecord(runtimeState.playerAccumulatedMs)
    ? readModern(
        runtimeState,
        runtimeState.playerAccumulatedMs,
        options.nowMs,
        options.completed === true || runtimeState.status === "ended"
      )
    : isRecord(runtimeState.playerAccumulatedSeconds)
      ? readLegacy(runtimeState, runtimeState.playerAccumulatedSeconds)
      : null;

  if (!recorded || recorded.squad.length === 0) return null;

  const gaps = [...recorded.gaps];
  const starters = new Set(readIds(runtimeState.initialOnFieldPlayerIds));
  if (starters.size === 0) gaps.push("startersMissing");

  const format = readFormat(runtimeState.format) ?? options.format ?? null;
  const squadSize = recorded.squad.length;
  let fairShare: FairShare | null = null;

  if (format && recorded.playedSeconds !== null && recorded.playedSeconds > 0) {
    const fieldSlots = FORMAT_FIELD_COUNT[format];
    const shareSeconds = Math.min(recorded.playedSeconds, (fieldSlots * recorded.playedSeconds) / squadSize);
    fairShare = {
      fieldSlots,
      squadSize,
      playedSeconds: recorded.playedSeconds,
      playedMinutes: Math.floor(recorded.playedSeconds / 60),
      seconds: Math.round(shareSeconds),
      minutes: Math.round(shareSeconds / 60),
    };
  }

  const players = recorded.squad.map((playerId, squadIndex) => {
    const seconds = recorded.seconds.get(playerId) ?? 0;
    const minutes = Math.floor(seconds / 60);
    const role: PlayingTimeRole =
      starters.size === 0
        ? "unknown"
        : starters.has(playerId)
          ? "starter"
          : seconds > 0
            ? "substitute"
            : "unused";

    return {
      squadIndex,
      entry: {
        playerId,
        seconds,
        minutes,
        role,
        gapMinutes: fairShare ? minutes - fairShare.minutes : null,
        ...(recorded.incomplete.has(playerId) ? { incomplete: true as const } : {}),
      },
    };
  });

  players.sort((a, b) => a.entry.minutes - b.entry.minutes || a.squadIndex - b.squadIndex);

  return {
    players: players.map(({ entry }) => entry),
    fairShare,
    gaps,
  };
}

export interface SeasonPlayingTime {
  /** Player id → total seconds over the counted matches; 0 for squad players who never came on. */
  seconds: Map<string, number>;
  countedMatches: number;
  /**
   * Completed matches left out of the totals because their stored state
   * cannot support them: no squad recorded, the early whole-seconds format,
   * or players on the field whose last spell cannot be measured.
   */
  skippedMatches: number;
}

/**
 * Season totals over completed matches (STATS-01), one stored state per
 * match. Each match adds each of its squad players once, with the same
 * per-match total as the match details page. A match is either counted for
 * everyone in it or left out, so no player is short-changed by a partial one.
 */
export function sumSeasonPlayingTime(runtimeStates: readonly unknown[], options: { nowMs: number }): SeasonPlayingTime {
  const seconds = new Map<string, number>();
  let countedMatches = 0;
  let skippedMatches = 0;

  for (const state of runtimeStates) {
    const summary = summarizeMatchPlayingTime(state, { nowMs: options.nowMs, completed: true });

    if (!summary || summary.gaps.includes("openSpellsMissing") || summary.gaps.includes("legacyFormat")) {
      skippedMatches += 1;
      continue;
    }

    countedMatches += 1;
    for (const player of summary.players) {
      seconds.set(player.playerId, (seconds.get(player.playerId) ?? 0) + player.seconds);
    }
  }

  return { seconds, countedMatches, skippedMatches };
}
