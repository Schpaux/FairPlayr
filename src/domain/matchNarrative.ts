/**
 * FEAT-SHARE-02: how a match developed, from its goals alone.
 *
 * The match summaries (internal report, public text and their fallbacks)
 * describe the course of a match: who scored first, equalisers, a match that
 * was turned, the decisive goal. That story is only told when the recorded
 * goals add up to the authoritative final score and every goal has a minute.
 * Otherwise the timeline is incomplete, and the final score alone is the
 * truth: no order, lead or comeback is derived from it.
 */

export type GoalSide = "own" | "opponent";

export interface NarrativeGoalInput {
  side: GoalSide;
  minute: number | null;
}

/**
 * What a goal did to the score, seen from the scoring side:
 * `opening` 1–0 from 0–0, `go_ahead` from level to ahead (not at 0–0),
 * `equaliser` from one behind to level, `reduce` still behind afterwards,
 * `extend` already ahead.
 */
export type GoalKind = "opening" | "go_ahead" | "equaliser" | "reduce" | "extend";

export interface NarrativeGoal {
  /** Position of this goal in the input list. */
  inputIndex: number;
  side: GoalSide;
  minute: number;
  kind: GoalKind;
  /** Score after the goal, own team first. */
  own: number;
  opponent: number;
  /** The winner's goal after which the loser never drew level again. */
  decisive: boolean;
}

export interface MatchNarrative {
  /** True when the goals match the final score and all have a minute. */
  complete: boolean;
  recordedOwn: number;
  recordedOpponent: number;
  /** Chronological goals; empty when the timeline is incomplete. */
  goals: NarrativeGoal[];
  /** The winner was behind at some point (only when complete). */
  comeback: boolean;
  /** Number of times the score was levelled after 0–0 (only when complete). */
  equalisers: number;
}

function kindFor(scoring: number, conceding: number): GoalKind {
  if (scoring === conceding) return scoring === 0 ? "opening" : "go_ahead";
  if (scoring > conceding) return "extend";
  return scoring + 1 === conceding ? "equaliser" : "reduce";
}

export function analyzeMatchNarrative(
  goals: readonly NarrativeGoalInput[],
  finalScore: { own: number; opponent: number }
): MatchNarrative {
  const recordedOwn = goals.filter((goal) => goal.side === "own").length;
  const recordedOpponent = goals.length - recordedOwn;
  const complete =
    recordedOwn === finalScore.own &&
    recordedOpponent === finalScore.opponent &&
    goals.every((goal) => typeof goal.minute === "number" && Number.isFinite(goal.minute));

  if (!complete) {
    return { complete, recordedOwn, recordedOpponent, goals: [], comeback: false, equalisers: 0 };
  }

  // Stable by minute: goals in the same minute keep the order they were recorded in.
  const ordered = goals
    .map((goal, index) => ({ goal, index }))
    .sort((a, b) => (a.goal.minute as number) - (b.goal.minute as number) || a.index - b.index);

  const winner: GoalSide | null =
    finalScore.own > finalScore.opponent ? "own" : finalScore.own < finalScore.opponent ? "opponent" : null;
  const loserFinal = Math.min(finalScore.own, finalScore.opponent);

  let own = 0;
  let opponent = 0;
  let comeback = false;
  let equalisers = 0;
  const narrated: NarrativeGoal[] = ordered.map(({ goal, index }) => {
    const scoringBefore = goal.side === "own" ? own : opponent;
    const concedingBefore = goal.side === "own" ? opponent : own;
    const kind = kindFor(scoringBefore, concedingBefore);
    if (goal.side === "own") own += 1;
    else opponent += 1;
    if (kind === "equaliser") equalisers += 1;
    if (winner && (winner === "own" ? own < opponent : opponent < own)) comeback = true;
    return {
      inputIndex: index,
      side: goal.side,
      minute: goal.minute as number,
      kind,
      own,
      opponent,
      decisive: winner !== null && goal.side === winner && scoringBefore === loserFinal,
    };
  });

  return { complete, recordedOwn, recordedOpponent, goals: narrated, comeback, equalisers };
}

/**
 * How long a summary should be, from the number of facts it can tell: a
 * goalless match with nothing else recorded stays short, a match with many
 * goals and changes gets room for the course of the match.
 */
export interface SummaryLengthGuide {
  minWords: number;
  maxWords: number;
  minParagraphs: number;
  maxParagraphs: number;
}

export function summaryLengthGuide(factCount: number): SummaryLengthGuide {
  if (factCount >= 6) return { minWords: 150, maxWords: 250, minParagraphs: 2, maxParagraphs: 4 };
  if (factCount >= 3) return { minWords: 90, maxWords: 160, minParagraphs: 2, maxParagraphs: 3 };
  if (factCount >= 2) return { minWords: 40, maxWords: 90, minParagraphs: 1, maxParagraphs: 2 };
  // AI-QA-01: almost nothing to tell (a result, perhaps one more fact) gives a short text.
  return { minWords: 20, maxWords: 50, minParagraphs: 1, maxParagraphs: 1 };
}
