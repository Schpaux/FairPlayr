import "server-only";
import type { MatchSummaryInput } from "@/lib/server/ai/match-summary/types";

export interface MatchSummaryPrompt {
  systemInstruction: string;
  prompt: string;
}

function resolveOutcome(scoreFor: number, scoreAgainst: number): "seier" | "uavgjort" | "tap" {
  if (scoreFor > scoreAgainst) return "seier";
  if (scoreFor === scoreAgainst) return "uavgjort";
  return "tap";
}

export function buildMatchSummaryPrompt(input: MatchSummaryInput): MatchSummaryPrompt {
  const systemInstruction = [
    "Du skriver kampoppsummeringer for bredde- og barnefotball på norsk bokmål.",
    "Målet er å lage en varm, konkret og lettlest oppsummering som føles nyttig for treneren.",
    "Skriv naturlig og presist ut fra faktiske kampdata. Bruk kampforløpet aktivt.",
    "Ikke dikt opp detaljer som ballbesittelse, press, sjanser eller prestasjoner som ikke finnes i dataene.",
    "Vi har mer data om eget lag enn om motstanderlaget — vekt eget lags data høyere og spekuler ikke om motstanderens spill.",
    "Hvis kampen endte med seier, kan tonen være positiv og konkret.",
    "Hvis kampen var jevn (uavgjort), skriv balansert og saklig.",
    "Hvis laget tapte, skal teksten være ærlig, rolig og konstruktiv — ikke pynt på resultatet, men unngå å være unødvendig negativ.",
    "Ikke trekk bastante konklusjoner om spilletid eller antall brukte spillere dersom datagrunnlaget er ufullstendig.",
    "Bruk spillernavn naturlig og sparsommelig.",
    "Ikke skriv at dette er en AI-oppsummering.",
    "Svar kun med selve teksten: skriv en kort overskrift på første linje, deretter to korte avsnitt.",
  ].join(" ");

  const outcome = resolveOutcome(input.scoreFor, input.scoreAgainst);

  // Build structured context — only include sections with actual data
  const context: Record<string, unknown> = {
    lagNavn: input.teamName,
    motstander: input.opponentName,
  };

  if (input.dateTime) context.dato = input.dateTime;
  if (input.venue) context.sted = input.venue;
  if (input.format) context.format = input.format;
  if (input.matchDurationMinutes !== null) context.varighet_minutter = input.matchDurationMinutes;

  context.resultat = {
    for: input.scoreFor,
    mot: input.scoreAgainst,
    utfall: outcome,
  };

  // Starting lineup — only if snapshot is available
  if (input.startingPlayers.length > 0) {
    context.startoppstilling = input.startingPlayers.map((p) => p.name);
  }

  // Chronological match events — the main narrative source for the AI
  if (input.matchEvents.length > 0) {
    context.kampforløp = input.matchEvents.map((e) => ({
      minutt: e.minute,
      hendelse: e.detail,
    }));
  }

  // Players used — only if we have reliable data
  if (input.playersUsedList.length > 0) {
    context.spillere_brukt = input.playersUsedList.map((p) => {
      const entry: Record<string, unknown> = { navn: p.name };
      if (p.started) entry.startet = true;
      else if (p.cameOn) entry.kom_inn = true;
      if (p.minutesPlayed !== null) entry.minutter = p.minutesPlayed;
      return entry;
    });
    context.antall_spillere_brukt = input.playersUsed;
  } else if (input.playersUsed > 0) {
    // Fallback: only the count if we don't have a reliable list
    context.antall_spillere_brukt = input.playersUsed;
  }

  const prompt = [
    "Lag en kampoppsummering basert kun på disse kampdataene.",
    "",
    "Prioriter:",
    "1. Resultat og hvem som vant",
    "2. Kampforløp: hvem scoret først, hvordan laget reagerte, om kampen ble snudd, om ledelsen ble økt",
    "3. Mål, assister og bytter",
    "4. Kort refleksjon om involvering eller spilletid dersom dataene er tydelige",
    "",
    "Krav:",
    "- Skriv på norsk bokmål",
    "- Skriv en kort overskrift på første linje",
    "- Deretter to korte avsnitt",
    "- Totalt ca. 90–170 ord",
    "- Ikke bruk punktliste",
    "- Ikke dikt opp detaljer som ikke finnes i dataene",
    "",
    "Kampdata:",
    JSON.stringify(context, null, 2),
  ].join("\n");

  return {
    systemInstruction,
    prompt,
  };
}
