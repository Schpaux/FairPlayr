import "server-only";
import type { MatchSummaryInput } from "@/lib/server/ai/match-summary/types";

/**
 * Last-resort fallback summary used when all AI generation attempts fail.
 * Uses available data (scorers, player count) to produce a factual sentence or two.
 */
export function buildFallbackMatchSummary(input: MatchSummaryInput): string {
  const team = input.teamName.trim() || "Laget";
  const opponent = input.opponentName.trim() || "motstanderen";
  const score = `${input.scoreFor}–${input.scoreAgainst}`;

  // Scorer summary if we have goal data
  const scorerNames = input.goalsFor
    .map((g) => g.scorerName)
    .filter((n): n is string => !!n)
    .slice(0, 3);
  const scorerLine =
    scorerNames.length > 0 ? ` Mål for ${team} ble scoret av ${scorerNames.join(", ")}.` : "";

  // Player involvement sentence — only if reliably non-zero
  const involvementLine =
    input.playersUsed > 1 ? ` ${team} brukte ${input.playersUsed} spillere i kampen.` : "";

  if (input.scoreFor > input.scoreAgainst) {
    return `${team} vant ${score} mot ${opponent}.${scorerLine}${involvementLine}`;
  }

  if (input.scoreFor === input.scoreAgainst) {
    return `${team} spilte uavgjort ${score} mot ${opponent}.${scorerLine}${involvementLine}`;
  }

  return `${team} tapte ${score} mot ${opponent}.${scorerLine}${involvementLine}`;
}
