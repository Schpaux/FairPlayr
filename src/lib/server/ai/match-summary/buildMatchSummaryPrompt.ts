import "server-only";
import {
  analyzeMatchNarrative,
  summaryLengthGuide,
  type GoalKind,
  type MatchNarrative,
  type SummaryLengthGuide,
} from "@/domain/matchNarrative";
import {
  OPPONENT_PLACEHOLDER,
  TEAM_PLACEHOLDER,
  type Pseudonymizer,
} from "@/lib/server/ai/match-summary/pseudonymize";
import type { MatchSummaryGoal, MatchSummaryInput } from "@/lib/server/ai/match-summary/types";

export interface MatchSummaryPrompt {
  systemInstruction: string;
  prompt: string;
  /** The player codes the text may contain (scorers and assists). */
  allowedCodes: ReadonlySet<string>;
  lengthGuide: SummaryLengthGuide;
}

type Outcome = "seier" | "uavgjort" | "tap";

export function resolveOutcome(scoreFor: number, scoreAgainst: number): Outcome {
  if (scoreFor > scoreAgainst) return "seier";
  if (scoreFor === scoreAgainst) return "uavgjort";
  return "tap";
}

export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  opening: "første mål",
  go_ahead: "ledermål",
  equaliser: "utligning",
  reduce: "redusering",
  extend: "økt ledelse",
};

/** Goals of both sides in recorded order; older inputs without a timeline get one from the per-side lists. */
export function goalTimelineOf(input: MatchSummaryInput): MatchSummaryGoal[] {
  if (input.goalTimeline) return input.goalTimeline;
  return [
    ...input.goalsFor.map((goal) => ({ side: "own" as const, ...goal })),
    ...input.goalsAgainst.map((goal) => ({ side: "opponent" as const, minute: goal.minute, scorerName: null, assistName: null })),
  ];
}

export function narrativeOf(input: MatchSummaryInput): MatchNarrative {
  return analyzeMatchNarrative(goalTimelineOf(input), { own: input.scoreFor, opponent: input.scoreAgainst });
}

/** Lowest and highest playing time, only when every used player's time is known. */
export function playingTimeSpread(input: MatchSummaryInput): { min: number; max: number } | null {
  const minutes = input.playersUsedList.map((player) => player.minutesPlayed);
  if (minutes.length === 0 || minutes.some((value) => value === null)) return null;
  const known = minutes as number[];
  return { min: Math.min(...known), max: Math.max(...known) };
}

export function lengthRules(guide: SummaryLengthGuide): string[] {
  const paragraphs =
    guide.maxParagraphs === 1
      ? "ett kort avsnitt"
      : guide.minParagraphs === guide.maxParagraphs
        ? `${guide.minParagraphs} korte avsnitt`
        : `${guide.minParagraphs}–${guide.maxParagraphs} korte avsnitt`;
  return [
    `- En kort overskrift på første linje som sier noe om akkurat denne kampen, ikke en generell overskrift som «Kampoppsummering» eller «Kampreferat»; deretter ${paragraphs} med en tom linje mellom`,
    "- Første setning skal tilføre noe utover overskriften, ikke gjenta den",
    `- Faktagrunnlaget styrer lengden, som regel ${guide.minWords}–${guide.maxWords} ord; er det lite å fortelle, blir teksten kortere, og du skal aldri fylle på med generelle setninger for å nå et ordtall`,
  ];
}

/** «4–3-seier», «1–3-tap», «uavgjort 2–2»: the result from the team's side, as the text should give it. */
export function resultPhrase(scoreFor: number, scoreAgainst: number): string {
  const result = `${scoreFor}–${scoreAgainst}`;
  const outcome = resolveOutcome(scoreFor, scoreAgainst);
  return outcome === "uavgjort" ? `uavgjort ${result}` : `${result}-${outcome}`;
}

/** The result requirement of both prompts: the team's goals first, the compound with a hyphen. */
export function resultRule(scoreFor: number, scoreAgainst: number): string {
  // A draw is «uavgjort 2–2», no compound, so no hyphen rule.
  const hyphen = resolveOutcome(scoreFor, scoreAgainst) === "uavgjort" ? "" : " (bindestrek i sammensetningen)";
  return `- Oppgi resultatet som ${scoreFor}–${scoreAgainst}, alltid sett fra ${TEAM_PLACEHOLDER} med ${TEAM_PLACEHOLDER} sine mål først, for eksempel «${resultPhrase(scoreFor, scoreAgainst)}»${hyphen}`;
}

export const TEAM_PLACEHOLDER_RULE = [
  `Lagene heter ${TEAM_PLACEHOLDER} og ${OPPONENT_PLACEHOLDER}. Skriv plassholderne nøyaktig slik de står, også i overskriften, uten å bøye dem.`,
  "Ikke finn på navn på lag eller spillere.",
].join(" ");

/** The example code contains "1", which generated codes never do, so it cannot collide with a real one. */
export const PLAYER_CODE_RULE = [
  "Spillere har koder som SPILLER_A1B2. Skriv kodene nøyaktig slik de står, uten å bøye dem:",
  "for eksempel «målet til SPILLER_A1B2», ikke «SPILLER_A1B2s mål». Ikke bruk koder som ikke står i dataene.",
].join(" ");

export const MINUTE_RULE =
  "minutt er antall spilte minutter da målet kom: skriv for eksempel «etter 12 minutter», og «i første minutt» for 0.";

export const NO_INVENTION_RULE =
  "Bruk bare fakta fra kampdataene. Ikke dikt opp sjanser, redninger, innsats, spillestil, følelser, stemning, vær eller publikum.";

/** AI-QA-01: no date is sent, so no «i dag» or «dagens kamp». */
export const NO_DATE_RULE =
  "Dato og tidspunkt er ikke oppgitt: ikke skriv «i dag», «dagens kamp», «i går», «i helgen» eller lignende.";

/** AI-QA-01: a summary of the course, not a goal-by-goal list, and nothing said twice. */
export const FLOW_RULE = [
  "Oppsummer hvordan kampen utviklet seg i stedet for å ramse opp hvert mål med minutt; nevn bare minuttene som betyr noe for forløpet.",
  "Ikke gjenta resultatet eller samme opplysning flere ganger.",
].join(" ");

/** AI-QA-02: only where scorers are sent; a combined scorer-and-assist list soon reads clumsily. */
export const SCORER_RULE =
  "Nevn målscorerne samlet, og omtal målscorere og assists hver for seg når en samlet liste blir klønete.";

/** AI-QA-01: an incomplete goal log; no order, lead or turnaround. */
export const INCOMPLETE_TIMELINE_RULE = [
  "Når tidslinjen er ufullstendig, er bare noen av målene registrert (registrerte_mål_av_totalt).",
  "Ikke beskriv rekkefølge, ledelse, utligning eller vendinger.",
].join(" ");

/** AI-QA-01: with an incomplete goal log, the recorded scorers are some of the scorers, not all. */
export const INCOMPLETE_SCORER_RULE =
  "Skriv om målscorerne som et utvalg, for eksempel «Blant de registrerte målscorerne var …», og aldri slik at det ser ut som de registrerte scorerne står bak alle målene.";

/**
 * Own goals in an incomplete log without a recorded scorer: the total minus
 * the recorded ones with a scorer. Sent so that the model sees the gap.
 */
export function ownGoalsWithoutScorer(scoreFor: number, recordedOwnScorers: number): number {
  return Math.max(0, scoreFor - recordedOwnScorers);
}

/**
 * The internal match report: structured facts only. No real ids, names,
 * place, date, title or other free text is sent; players are codes and the
 * teams placeholders (see pseudonymize.ts).
 */
export function buildMatchSummaryPrompt(input: MatchSummaryInput, pseudonyms: Pseudonymizer): MatchSummaryPrompt {
  const outcome = resolveOutcome(input.scoreFor, input.scoreAgainst);
  const result = `${input.scoreFor}–${input.scoreAgainst}`;
  const narrative = narrativeOf(input);
  const timeline = goalTimelineOf(input);
  const allowedCodes = new Set<string>();
  const codeOf = (name: string | null, id: string | null | undefined): string | null => {
    const code = pseudonyms.code(name, id);
    if (code) allowedCodes.add(code);
    return code;
  };

  const facts: Record<string, unknown> = {
    lag: TEAM_PLACEHOLDER,
    motstander: OPPONENT_PLACEHOLDER,
  };
  if (input.format) facts.format = input.format;
  if (input.matchDurationMinutes !== null) facts.varighet_minutter = input.matchDurationMinutes;
  facts.sluttresultat = { tekst: result, [TEAM_PLACEHOLDER]: input.scoreFor, [OPPONENT_PLACEHOLDER]: input.scoreAgainst, utfall: outcome };

  const totalGoals = input.scoreFor + input.scoreAgainst;
  if (narrative.complete) {
    facts.tidslinje = "komplett";
    if (narrative.goals.length > 0) {
      facts.mål = narrative.goals.map((goal) => {
        const entry: Record<string, unknown> = {
          minutt: goal.minute,
          lag: goal.side === "own" ? TEAM_PLACEHOLDER : OPPONENT_PLACEHOLDER,
          stilling_etter: `${goal.own}–${goal.opponent}`,
          type: GOAL_KIND_LABEL[goal.kind],
        };
        if (goal.decisive) entry.avgjørende = true;
        const source = timeline[goal.inputIndex];
        const scorer = goal.side === "own" ? codeOf(source.scorerName, source.scorerId) : null;
        const assist = goal.side === "own" ? codeOf(source.assistName, source.assistId) : null;
        if (scorer) entry.målscorer = scorer;
        if (assist) entry.assist = assist;
        return entry;
      });
      facts.forløp = {
        snudd: narrative.comeback,
        utligninger: narrative.equalisers,
      };
    }
  } else {
    facts.tidslinje = "ufullstendig";
    facts.registrerte_mål_av_totalt = `${timeline.length} av ${totalGoals}`;
    // No minutes and no running score: the order of an incomplete timeline is not known.
    const registered = timeline
      .filter((goal) => goal.side === "own")
      .map((goal) => {
        const entry: Record<string, unknown> = {};
        const scorer = codeOf(goal.scorerName, goal.scorerId);
        const assist = codeOf(goal.assistName, goal.assistId);
        if (scorer) entry.målscorer = scorer;
        if (assist) entry.assist = assist;
        return entry;
      })
      .filter((entry) => Object.keys(entry).length > 0);
    if (registered.length > 0) facts.registrerte_egne_mål = registered;
    const withoutScorer = ownGoalsWithoutScorer(
      input.scoreFor,
      registered.filter((entry) => entry.målscorer).length
    );
    if (withoutScorer > 0) facts.egne_mål_uten_registrert_målscorer = withoutScorer;
  }

  if (input.substitutions.length > 0) {
    facts.bytter = {
      antall: input.substitutions.length,
      minutter: input.substitutions.map((sub) => sub.minute).filter((minute): minute is number => minute !== null),
    };
  }

  const spread = playingTimeSpread(input);
  if (input.playersUsed > 0) {
    facts.spilletid = {
      spillere_brukt: input.playersUsed,
      ...(spread ? { laveste_minutter: spread.min, høyeste_minutter: spread.max } : {}),
    };
  }

  const assists = timeline.filter((goal) => goal.side === "own" && goal.assistName).length;
  const factCount =
    timeline.length + assists + (input.substitutions.length > 0 ? 1 : 0) + (input.playersUsed > 0 ? 1 : 0);
  const lengthGuide = summaryLengthGuide(factCount);

  const systemInstruction = [
    "Du skriver kampoppsummeringer for treneren i barne- og breddefotball, på norsk bokmål.",
    "Skriv nøkternt, konkret og lettlest.",
    TEAM_PLACEHOLDER_RULE,
    PLAYER_CODE_RULE,
    NO_INVENTION_RULE,
    NO_DATE_RULE,
    MINUTE_RULE,
    "Sluttresultatet er alltid fasit.",
    "Når tidslinjen er komplett, fortell hvordan kampen utviklet seg: hvem som scoret først, ledelse, utligninger, om kampen ble snudd og hvilket mål som ble avgjørende. Bruk feltene stilling_etter, type og avgjørende; ikke beskriv mer enn de sier.",
    FLOW_RULE,
    SCORER_RULE,
    INCOMPLETE_TIMELINE_RULE,
    INCOMPLETE_SCORER_RULE,
    "Bytter og spilletid omtales nøkternt og samlet, for eksempel antall bytter og spennet i spilletid. Ikke ranger barna, ikke fremhev hvem som spilte mest eller minst, og ikke ros eller kritiser enkeltspillere.",
    "Ved seier kan tonen være positiv, ved uavgjort balansert, ved tap ærlig og rolig uten å pynte på resultatet.",
    "Ikke skriv at teksten er laget av AI.",
    "Svar bare med teksten, uten punktliste og uten markdown.",
  ].join(" ");

  const prompt = [
    "Skriv en kampoppsummering basert bare på disse kampdataene.",
    "",
    "Krav:",
    ...lengthRules(lengthGuide),
    resultRule(input.scoreFor, input.scoreAgainst),
    "- Ingen punktliste",
    "",
    "Kampdata:",
    JSON.stringify(facts, null, 2),
  ].join("\n");

  return { systemInstruction, prompt, allowedCodes, lengthGuide };
}
