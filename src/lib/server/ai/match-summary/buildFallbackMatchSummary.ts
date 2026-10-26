import "server-only";
import type { NarrativeGoal } from "@/domain/matchNarrative";
import {
  goalTimelineOf,
  narrativeOf,
  playingTimeSpread,
} from "@/lib/server/ai/match-summary/buildMatchSummaryPrompt";
import type { MatchSummaryInput } from "@/lib/server/ai/match-summary/types";

/** «etter 12 minutter», the app's elapsed-minute convention (minute 0 is the first minute). */
export function minutePhrase(minute: number): string {
  if (minute <= 0) return "i første minutt";
  return minute === 1 ? "etter ett minutt" : `etter ${minute} minutter`;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}`;
}

function countedNames(names: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return joinNames([...counts].map(([name, count]) => (count > 1 ? `${name} (${count})` : name)));
}

/**
 * Last-resort internal report when the AI text is unavailable or rejected:
 * a heading and short paragraphs from the facts alone. The course of the
 * match is only told when the recorded goals add up to the final score;
 * nothing is padded.
 */
export function buildFallbackMatchSummary(input: MatchSummaryInput): string {
  const team = input.teamName.trim() || "Laget";
  const opponent = input.opponentName.trim() || "motstanderen";
  const score = `${input.scoreFor}–${input.scoreAgainst}`;
  const nameOf = (side: NarrativeGoal["side"]) => (side === "own" ? team : opponent);

  const heading =
    input.scoreFor > input.scoreAgainst
      ? `Seier ${score} mot ${opponent}`
      : input.scoreFor === input.scoreAgainst
        ? `Uavgjort ${score} mot ${opponent}`
        : `Tap ${score} mot ${opponent}`;

  const result =
    input.scoreFor > input.scoreAgainst
      ? `${team} vant ${score} mot ${opponent}.`
      : input.scoreFor === input.scoreAgainst
        ? `${team} og ${opponent} spilte ${score}.`
        : `${team} tapte ${score} mot ${opponent}.`;

  const narrative = narrativeOf(input);
  const timeline = goalTimelineOf(input);
  const course: string[] = [];
  if (narrative.complete && narrative.goals.length === 1) {
    const [goal] = narrative.goals;
    course.push(`Kampens eneste mål kom ${minutePhrase(goal.minute)}.`);
  } else if (narrative.complete && narrative.goals.length > 1) {
    const [first] = narrative.goals;
    course.push(`${nameOf(first.side)} scoret først, ${minutePhrase(first.minute)}.`);
    const winner = input.scoreFor > input.scoreAgainst ? "own" : input.scoreFor < input.scoreAgainst ? "opponent" : null;
    if (winner && narrative.comeback) {
      course.push(`${nameOf(winner)} lå under, men snudde kampen.`);
    }
    const decisive = narrative.goals.find((goal) => goal.decisive);
    if (decisive && decisive !== first) {
      course.push(`Det avgjørende målet til ${decisive.own}–${decisive.opponent} kom ${minutePhrase(decisive.minute)}.`);
    }
    const lastEqualiser = [...narrative.goals].reverse().find((goal) => goal.kind === "equaliser");
    if (!winner && lastEqualiser) {
      course.push(`${nameOf(lastEqualiser.side)} utlignet til ${lastEqualiser.own}–${lastEqualiser.opponent} ${minutePhrase(lastEqualiser.minute)}.`);
    }
  } else if (!narrative.complete && timeline.length > 0) {
    course.push(`Hendelsesloggen har ${timeline.length} av ${input.scoreFor + input.scoreAgainst} mål.`);
  }

  const details: string[] = [];
  const scorers = timeline
    .filter((goal) => goal.side === "own" && goal.scorerName)
    .map((goal) => goal.scorerName as string);
  // AI-QA-01: with goals missing from the log, the recorded scorers are not all of them.
  if (scorers.length > 0) {
    details.push(
      scorers.length < input.scoreFor
        ? `Blant de registrerte målscorerne: ${countedNames(scorers)}.`
        : `Målscorere: ${countedNames(scorers)}.`
    );
  }
  const assists = timeline
    .filter((goal) => goal.side === "own" && goal.assistName)
    .map((goal) => goal.assistName as string);
  if (assists.length > 0) details.push(`Assist: ${countedNames(assists)}.`);

  if (input.playersUsed > 1) {
    const subs = input.substitutions.length;
    details.push(
      subs > 0
        ? `${team} brukte ${input.playersUsed} spillere og gjorde ${subs} ${subs === 1 ? "bytte" : "bytter"}.`
        : `${team} brukte ${input.playersUsed} spillere.`
    );
    const spread = playingTimeSpread(input);
    if (spread && spread.max > 0) {
      details.push(
        spread.min === spread.max
          ? `Alle spilte ${spread.max} minutter.`
          : `Spilletiden var mellom ${spread.min} og ${spread.max} minutter.`
      );
    }
  }

  return [heading, [result, ...course].join(" "), details.join(" ")].filter(Boolean).join("\n\n");
}
