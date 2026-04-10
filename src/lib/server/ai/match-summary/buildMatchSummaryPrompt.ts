import "server-only";
import type { MatchSummaryInput } from "@/lib/server/ai/match-summary/types";

export interface MatchSummaryPrompt {
  systemInstruction: string;
  prompt: string;
}

export function buildMatchSummaryPrompt(input: MatchSummaryInput): MatchSummaryPrompt {
  const systemInstruction = [
    "Du skriver korte kampoppsummeringer for breddefotball i Norge.",
    "Svar alltid pa norsk bokmal.",
    "Skriv enkelt, varmt og naturlig.",
    "Hold deg til fakta i inputdata.",
    "Ikke finn pa hendelser, spillere eller kampforlop som ikke finnes i data.",
    "Unnga klisjeer, overdrivelser og journalistisk sportsprat.",
    "Hold teksten kort: omtrent 3 til 6 linjer.",
    "Hvis data er begrenset, skriv en enkel oppsummering basert pa resultat og motstander.",
  ].join(" ");

  const promptPayload = {
    teamName: input.teamName,
    opponentName: input.opponentName,
    dateTime: input.dateTime,
    format: input.format,
    scoreFor: input.scoreFor,
    scoreAgainst: input.scoreAgainst,
    goalsFor: input.goalsFor,
    goalsAgainst: input.goalsAgainst,
  };

  const prompt = [
    "Lag en kort kampoppsummering basert pa dataene under.",
    "Svar kun med selve oppsummeringsteksten.",
    "",
    JSON.stringify(promptPayload, null, 2),
  ].join("\n");

  return {
    systemInstruction,
    prompt,
  };
}
