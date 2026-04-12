import "server-only";
import type { MatchSummaryInput } from "@/lib/server/ai/match-summary/types";

export interface MatchSummaryPrompt {
  systemInstruction: string;
  prompt: string;
}

export function buildMatchSummaryPrompt(input: MatchSummaryInput): MatchSummaryPrompt {
  const systemInstruction = [
    "Du skriver korte kampoppsummeringer for barne- og breddefotball i Norge.",
    "Teksten leses av trenere og foreldre — ikke TV-eksperter eller journalister.",
    "Svar alltid på norsk bokmål.",
    "Skriv enkelt, varmt og jordnært — unngå klisjeer og proffspråk.",
    "Ikke bruk ord som 'dominans', 'presshøyde', 'taktisk kontroll', 'intensitet' eller lignende fagutttrykk fra toppfotball.",
    "Vi har mye mer data om vårt eget lag enn om motstanderlaget — ikke spekuler om motstanderens spill utover score og målene de scoret.",
    "Hold deg strengt til fakta i inputdata. Ikke dikt opp spillere, hendelser eller detaljer som ikke finnes der.",
    "Fremhev gjerne rettferdig rullering og bred involvering dersom dataene støtter det — dette er viktig i bredde- og barnefotball.",
    "Hold teksten til 3–6 setninger. Svar kun med selve oppsummeringsteksten.",
  ].join(" ");

  // Build structured context object — only include sections we actually have data for
  const context: Record<string, unknown> = {
    lagNavn: input.teamName,
    motstander: input.opponentName,
    dato: input.dateTime,
    format: input.format,
    mål_for: input.scoreFor,
    mål_mot: input.scoreAgainst,
  };

  if (input.matchDurationMinutes !== null) {
    context.varighet_minutter = input.matchDurationMinutes;
  }

  if (input.goalsFor.length > 0) {
    context.mål_scoret_av_oss = input.goalsFor.map((g) => ({
      minutt: g.minute,
      scorer: g.scorerName,
      assist: g.assistName,
    }));
  }

  if (input.goalsAgainst.length > 0) {
    context.mål_scoret_av_motstander = input.goalsAgainst.map((g) => ({
      minutt: g.minute,
    }));
  }

  if (input.substitutions.length > 0) {
    context.bytter_eget_lag = input.substitutions.map((s) => ({
      minutt: s.minute,
      inn: s.playerInName,
      ut: s.playerOutName,
    }));
  }

  if (input.playerTimes.length > 0) {
    context.spilletid_per_spiller = input.playerTimes.map((p) => ({
      spiller: p.playerName,
      minutter: p.minutesPlayed,
    }));
    context.antall_spelere_brukt = input.playersUsed;
  }

  const prompt = [
    "Skriv en kort kampoppsummering på norsk bokmål basert på dataene under.",
    "Svar kun med selve oppsummeringsteksten — ingen tittel, ingen punktliste.",
    "",
    JSON.stringify(context, null, 2),
  ].join("\n");

  return {
    systemInstruction,
    prompt,
  };
}
