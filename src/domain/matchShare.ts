/**
 * FEAT-SHARE-01: public match sharing. One link per match goes from a
 * countdown to a live view and then a summary.
 *
 * - The coach chooses «Del live» and «Del oppsummering» (both off by default)
 *   and one detail level for both: `status` (teams, time, running/finished),
 *   `result` (score and goal minutes, no players) or `detailed` (scorers and
 *   assists by name).
 * - Guidance follows the age group, never the match format. Children (12 and
 *   under) and an unknown age default to `status`, and in v1 names are never
 *   public for them: `detailed` needs the youth group (13 and over). A warning
 *   or a confirmation is not proof of a right to publish, so it is not offered
 *   as a way past this.
 * - The database filters every public answer (get_public_match_share).
 *   `sanitizePublicMatchShare` reads that answer again on our server and keeps
 *   only the known keys under the same rules, so a change on one side alone
 *   can never widen what a visitor gets.
 */

import { getElapsedMsFromClock, type MatchClockBasis } from "@/domain/liveMatch";

export type ShareDetailLevel = "status" | "result" | "detailed";
export type ShareAgeGroup = "child" | "youth" | "unknown";

export const SHARE_DETAIL_LEVELS: readonly ShareDetailLevel[] = ["status", "result", "detailed"];
export const SHARE_AGE_GROUPS: readonly ShareAgeGroup[] = ["child", "youth", "unknown"];

export interface MatchShareSettings {
  live: boolean;
  summary: boolean;
  detailLevel: ShareDetailLevel;
  ageGroup: ShareAgeGroup;
}

export const DEFAULT_SHARE_SETTINGS: MatchShareSettings = {
  live: false,
  summary: false,
  detailLevel: "status",
  ageGroup: "unknown",
};

export function isShareDetailLevel(value: unknown): value is ShareDetailLevel {
  return typeof value === "string" && (SHARE_DETAIL_LEVELS as readonly string[]).includes(value);
}

export function isShareAgeGroup(value: unknown): value is ShareAgeGroup {
  return typeof value === "string" && (SHARE_AGE_GROUPS as readonly string[]).includes(value);
}

export function isShareEnabled(settings: Pick<MatchShareSettings, "live" | "summary">): boolean {
  return settings.live || settings.summary;
}

/** Names may be public only for the youth group (13 and over) in v1. */
export function allowsPublicNames(ageGroup: ShareAgeGroup): boolean {
  return ageGroup === "youth";
}

export function allowedDetailLevels(ageGroup: ShareAgeGroup): ShareDetailLevel[] {
  return allowsPublicNames(ageGroup) ? [...SHARE_DETAIL_LEVELS] : ["status", "result"];
}

/** The suggested level for an age group: match status for children and unknown age. */
export function defaultDetailLevel(ageGroup: ShareAgeGroup): ShareDetailLevel {
  return ageGroup === "youth" ? "result" : "status";
}

/**
 * Settings that obey the rules whatever came in: unknown values fall back to
 * the defaults, and names are dropped to `result` when the age group does
 * not allow them.
 */
export function normalizeShareSettings(input: Partial<Record<keyof MatchShareSettings, unknown>>): MatchShareSettings {
  const ageGroup = isShareAgeGroup(input.ageGroup) ? input.ageGroup : DEFAULT_SHARE_SETTINGS.ageGroup;
  const requested = isShareDetailLevel(input.detailLevel) ? input.detailLevel : defaultDetailLevel(ageGroup);
  const detailLevel = requested === "detailed" && !allowsPublicNames(ageGroup) ? "result" : requested;

  return {
    live: input.live === true,
    summary: input.summary === true,
    detailLevel,
    ageGroup,
  };
}

/** Changing the age group moves the level to that group's default when the old one is not allowed. */
export function withAgeGroup(settings: MatchShareSettings, ageGroup: ShareAgeGroup): MatchShareSettings {
  const detailLevel = allowedDetailLevels(ageGroup).includes(settings.detailLevel)
    ? settings.detailLevel
    : defaultDetailLevel(ageGroup);
  return { ...settings, ageGroup, detailLevel };
}

// ─── Token ────────────────────────────────────────────────────────────────────

/** 32 random bytes in base64url: 43 characters, 256 bits. */
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isShareToken(value: unknown): value is string {
  return typeof value === "string" && SHARE_TOKEN_PATTERN.test(value);
}

/** A new unguessable share token, or null where no secure random source exists. */
export function generateShareToken(): string | null {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    return null;
  }

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ─── Kick-off ─────────────────────────────────────────────────────────────────

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * The kick-off a coach picks as a time of day ("HH:MM", the device's own
 * time) for a new match: today at that time, or tomorrow when today's is more
 * than 12 hours ago (set up the evening before). Null for an empty or
 * malformed value: then there is no kick-off time.
 */
export function kickoffFromTimeOfDay(time: string, now: Date): string | null {
  const match = TIME_OF_DAY_PATTERN.exec(time);
  if (!match) return null;
  const at = new Date(now);
  at.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (now.getTime() - at.getTime() > 12 * 60 * 60_000) at.setDate(at.getDate() + 1);
  return at.toISOString();
}

/** The time of day ("HH:MM", the device's own time) of a kick-off, or "" without one. */
export function timeOfDayOf(iso: string | null): string {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return "";
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** A kick-off as sent to the server: a valid time, or null for none. */
export function normalizeKickoffAt(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}

/** The path of the public page, without the locale prefix. */
export function sharePath(token: string): string {
  return `/s/${token}`;
}

// ─── Public answer ────────────────────────────────────────────────────────────

export type PublicMatchPhase = "upcoming" | "live" | "completed";

export interface PublicGoal {
  minute: number | null;
  side: "own" | "opponent";
  /** Only at the detailed level (youth), own goals only. */
  scorer?: string | null;
  assist?: string | null;
}

export interface PublicLiveState {
  /** When the coach's device last wrote the match (ISO). */
  updatedAt: string | null;
  phase: "first_half" | "half_time" | "second_half" | "full_time" | null;
  status: "not_started" | "running" | "paused" | "ended" | null;
  halves: 1 | 2 | null;
  regularSecondsPerHalf: number | null;
  phaseStartedAtElapsedMs: number | null;
  clock: MatchClockBasis | null;
}

export interface PublicMatchShare {
  phase: PublicMatchPhase;
  teamName: string;
  opponentName: string | null;
  /** The kick-off, or null when the coach has not given one (no countdown then). */
  startsAt: string | null;
  shareLive: boolean;
  shareSummary: boolean;
  detailLevel: ShareDetailLevel;
  live: PublicLiveState | null;
  score: { for: number; against: number } | null;
  goals: PublicGoal[] | null;
  summary: { status: "ready" | "pending"; text: string | null; generatedAt: string | null } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function wholeOrNull(value: unknown): number | null {
  const n = num(value);
  return n === null ? null : Math.max(0, Math.floor(n));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function sanitizeClock(value: unknown): MatchClockBasis | null {
  if (!isRecord(value)) return null;
  const startedAtMs = num(value.startedAtMs);
  return {
    startedAtMs,
    pausedAtMs: num(value.pausedAtMs),
    accumulatedPausedMs: Math.max(0, num(value.accumulatedPausedMs) ?? 0),
    isRunning: value.isRunning === true && startedAtMs !== null,
  };
}

/**
 * The public answer, rebuilt from known keys only and under the share's own
 * rules (see the module comment). Null when the answer is not a share.
 */
export function sanitizePublicMatchShare(raw: unknown): PublicMatchShare | null {
  if (!isRecord(raw)) return null;

  const phase = oneOf(raw.phase, ["upcoming", "live", "completed"] as const);
  const detailLevel = isShareDetailLevel(raw.detailLevel) ? raw.detailLevel : null;
  const startsAt = str(raw.startsAt);
  if (!phase || !detailLevel) return null;

  const shareLive = raw.shareLive === true;
  const shareSummary = raw.shareSummary === true;
  if (!shareLive && !shareSummary) return null;

  const liveVisible = phase === "live" && shareLive;
  const showScore = detailLevel !== "status" && (liveVisible || phase === "completed");
  const showNames = showScore && detailLevel === "detailed";

  let live: PublicLiveState | null = null;
  if (liveVisible && isRecord(raw.live)) {
    const halves = raw.live.halves === 1 || raw.live.halves === 2 ? raw.live.halves : null;
    live = {
      updatedAt: str(raw.live.updatedAt),
      phase: oneOf(raw.live.phase, ["first_half", "half_time", "second_half", "full_time"] as const),
      status: oneOf(raw.live.status, ["not_started", "running", "paused", "ended"] as const),
      halves,
      regularSecondsPerHalf: wholeOrNull(raw.live.regularSecondsPerHalf),
      phaseStartedAtElapsedMs: wholeOrNull(raw.live.phaseStartedAtElapsedMs),
      clock: sanitizeClock(raw.live.clock),
    };
  }

  let goals: PublicGoal[] | null = null;
  let score: PublicMatchShare["score"] = null;
  if (showScore) {
    goals = (Array.isArray(raw.goals) ? raw.goals : []).filter(isRecord).flatMap((goal): PublicGoal[] => {
      const side = oneOf(goal.side, ["own", "opponent"] as const);
      if (!side) return [];
      const base: PublicGoal = { minute: wholeOrNull(goal.minute), side };
      return [showNames && side === "own" ? { ...base, scorer: str(goal.scorer), assist: str(goal.assist) } : base];
    });
    // The result is the match's own score; the goal list is the timeline and
    // may hold fewer goals (older matches). Counted goals only without one.
    const scoreFor = isRecord(raw.score) ? wholeOrNull(raw.score.for) : null;
    const scoreAgainst = isRecord(raw.score) ? wholeOrNull(raw.score.against) : null;
    score = {
      for: scoreFor ?? goals.filter((goal) => goal.side === "own").length,
      against: scoreAgainst ?? goals.filter((goal) => goal.side === "opponent").length,
    };
  }

  let summary: PublicMatchShare["summary"] = null;
  if (phase === "completed" && shareSummary && isRecord(raw.summary)) {
    const text = str(raw.summary.text);
    // A text written from other data (goals or result corrected since) is
    // never shown; the page waits for the one written from the current data.
    const basis = publicSummaryBasis({
      teamName: str(raw.teamName) ?? "",
      opponentName: str(raw.opponentName),
      startsAt,
      detailLevel,
      score,
      goals,
    });
    const ready = raw.summary.status === "ready" && text !== null && str(raw.summary.basis) === basis;
    summary = {
      status: ready ? "ready" : "pending",
      text: ready ? text : null,
      generatedAt: ready ? str(raw.summary.generatedAt) : null,
    };
  } else if (phase === "completed" && shareSummary) {
    summary = { status: "pending", text: null, generatedAt: null };
  }

  return {
    phase,
    teamName: str(raw.teamName) ?? "",
    opponentName: str(raw.opponentName),
    startsAt,
    shareLive,
    shareSummary,
    detailLevel,
    live,
    score,
    goals,
    summary,
  };
}

/**
 * A fingerprint of the public data a summary is written from: the level, the
 * teams, the kick-off, the result and the goal list. A stored summary is shown
 * only while it still matches, so a correction hides the old text at once,
 * and a generation that started from older data cannot pass as current.
 *
 * The database applies the same rule before it returns a text
 * (`match_share_summary_basis` in migration 20261026150000); keep the two
 * identical. Parts joined with "|": a string is "'" plus the text with "\\"
 * and "|" escaped by "\\", an empty opponent/scorer/assist is null, null is
 * "~", a number its decimal value; then 32-bit FNV-1a over the UTF-8 bytes.
 */
export function publicSummaryBasis(
  share: Pick<PublicMatchShare, "teamName" | "opponentName" | "startsAt" | "detailLevel" | "score" | "goals">
): string {
  const quote = (value: string) => `'${value.replace(/[\\|]/g, (ch) => `\\${ch}`)}`;
  const text = (value: string | null | undefined) => (value ? quote(value) : "~");
  const whole = (value: number | null) => (value === null ? "~" : String(value));
  const goals = share.goals ?? [];
  const parts = [
    text(share.detailLevel),
    quote(share.teamName),
    text(share.opponentName),
    text(share.startsAt),
    ...(share.score ? [whole(share.score.for), whole(share.score.against)] : ["~"]),
    String(goals.length),
    ...goals.flatMap((goal) => [whole(goal.minute), text(goal.side), text(goal.scorer), text(goal.assist)]),
  ];
  // FNV-1a (32 bit): a short, stable hash (not a secret, only a change detector).
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(parts.join("|"))) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return `v2:${hash.toString(16).padStart(8, "0")}`;
}

// ─── Presentation helpers ─────────────────────────────────────────────────────

/**
 * The match minute a visitor sees: "23" in ordinary time, "30+2" in
 * stoppage (the half's ordinary end plus the started stoppage minute), or
 * null when the clock cannot say (not started, half-time, full time).
 */
export function publicMatchMinute(live: PublicLiveState | null, nowMs: number): string | null {
  if (!live?.clock || live.clock.startedAtMs === null) return null;
  if (live.phase !== "first_half" && live.phase !== "second_half") return null;

  const regular = live.regularSecondsPerHalf;
  const phaseStart = live.phaseStartedAtElapsedMs ?? 0;
  const phaseSeconds = Math.floor(Math.max(0, getElapsedMsFromClock(live.clock, nowMs) - phaseStart) / 1000);
  const offsetSeconds = live.phase === "second_half" && regular !== null ? regular : 0;

  if (regular !== null && regular > 0 && phaseSeconds >= regular) {
    const halfEndMinute = Math.round((offsetSeconds + regular) / 60);
    const stoppageMinute = Math.floor((phaseSeconds - regular) / 60) + 1;
    return `${halfEndMinute}+${stoppageMinute}`;
  }

  return String(Math.floor((offsetSeconds + phaseSeconds) / 60) + 1);
}

/** How old the coach's last write is, in whole minutes (never negative). */
export function minutesSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((nowMs - at) / 60_000));
}

/** After this many minutes without a write from the coach, live data is shown as possibly out of date. */
export const LIVE_STALE_AFTER_MINUTES = 5;

/**
 * How long a visitor's page waits between refreshes, or null when there is
 * nothing to show any more (turned off). A finished match keeps a calm
 * refresh, so an open page still learns of a revoked link, a lower level or
 * corrected goals (the page also checks when it becomes visible again).
 */
export function publicRefreshIntervalMs(share: PublicMatchShare | null): number | null {
  if (!share) return null;
  if (share.phase === "live") return share.shareLive ? 15_000 : 60_000;
  if (share.phase === "upcoming") return 30_000;
  if (share.summary?.status === "pending") return 20_000;
  return 120_000;
}

export type FactualSummaryLocale = "no" | "en";

/**
 * A short, factual text from the public answer alone: used when the AI text
 * is missing, at the status level (where there is nothing to narrate), and on
 * the English page. Never more than the level shows.
 */
export function buildFactualSummary(share: PublicMatchShare, locale: FactualSummaryLocale): string {
  const team = share.teamName.trim() || (locale === "no" ? "Laget" : "The team");
  const opponent = share.opponentName?.trim() || (locale === "no" ? "motstanderen" : "the opponent");

  if (!share.score) {
    return locale === "no"
      ? `Kampen mellom ${team} og ${opponent} er ferdigspilt.`
      : `The match between ${team} and ${opponent} has been played.`;
  }

  const { for: scored, against } = share.score;
  const result = `${scored}–${against}`;
  const first =
    locale === "no"
      ? scored > against
        ? `${team} vant ${result} mot ${opponent}.`
        : scored === against
          ? `${team} og ${opponent} spilte ${result}.`
          : `${team} tapte ${result} mot ${opponent}.`
      : scored > against
        ? `${team} beat ${opponent} ${result}.`
        : scored === against
          ? `${team} and ${opponent} drew ${result}.`
          : `${team} lost ${result} to ${opponent}.`;

  const scorers = (share.goals ?? [])
    .filter((goal) => goal.side === "own" && goal.scorer)
    .map((goal) => goal.scorer as string);
  const unique = [...new Set(scorers)];
  if (unique.length === 0) return first;

  const list = unique.length === 1 ? unique[0] : `${unique.slice(0, -1).join(", ")} ${locale === "no" ? "og" : "and"} ${unique[unique.length - 1]}`;
  return locale === "no" ? `${first} Målscorere: ${list}.` : `${first} Scorers: ${list}.`;
}
