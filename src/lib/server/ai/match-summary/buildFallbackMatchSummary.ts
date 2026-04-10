import "server-only";
import type { MatchSummaryInput } from "@/lib/server/ai/match-summary/types";

export function buildFallbackMatchSummary(input: MatchSummaryInput): string {
  const team = input.teamName.trim() || "Laget";
  const opponent = input.opponentName.trim() || "motstanderen";
  const score = `${input.scoreFor}-${input.scoreAgainst}`;

  if (input.scoreFor > input.scoreAgainst) {
    return `${team} spilte en fin kamp mot ${opponent} og tok seieren ${score}.`;
  }

  if (input.scoreFor === input.scoreAgainst) {
    return `${team} spilte en jevn kamp mot ${opponent}, og oppgjoret endte ${score}.`;
  }

  return `${team} motte ${opponent} til en innsatsrik kamp. Det endte til slutt ${score}.`;
}
