import "server-only";
import { AiServiceError } from "@/lib/server/ai/errors";
import { generateText, type GenerateTextResult } from "@/lib/server/ai/service";
import { SUMMARY_DEFAULTS, finishReasonOfError } from "@/lib/server/ai/match-summary/generateMatchSummary";
import { normalizeMatchSummaryText } from "@/lib/server/ai/match-summary/normalizeMatchSummaryText";
import {
  FLOW_RULE,
  GOAL_KIND_LABEL,
  INCOMPLETE_SCORER_RULE,
  INCOMPLETE_TIMELINE_RULE,
  MINUTE_RULE,
  NO_DATE_RULE,
  NO_INVENTION_RULE,
  PLAYER_CODE_RULE,
  SCORER_RULE,
  TEAM_PLACEHOLDER_RULE,
  lengthRules,
  ownGoalsWithoutScorer,
  resolveOutcome,
  resultRule,
} from "@/lib/server/ai/match-summary/buildMatchSummaryPrompt";
import {
  MIN_SUMMARY_WORDS,
  inventsUnsupportedDetail,
  statesResult,
  statesReversedResult,
  wordCount,
} from "@/lib/server/ai/match-summary/checkSummaryText";
import {
  OPPONENT_PLACEHOLDER,
  TEAM_PLACEHOLDER,
  createPseudonymizer,
  type Pseudonymizer,
} from "@/lib/server/ai/match-summary/pseudonymize";
import { analyzeMatchNarrative, summaryLengthGuide } from "@/domain/matchNarrative";
import { buildFactualSummary, type PublicGoal, type PublicMatchShare } from "@/domain/matchShare";

export { statesResult };

/**
 * FEAT-SHARE-01: the public summary of a shared match.
 *
 * It is written from the public answer alone (what a visitor may already
 * see at the share's level), never from the internal report or the match
 * state, so it cannot contain playing time, attendance or anything the level
 * hides. It is generated once per completed match and level and stored; a
 * page visit never generates.
 *
 * FEAT-SHARE-02: the model gets placeholders for the teams and, only at the
 * detailed level, random codes for the scorers and assists (see
 * pseudonymize.ts). The public answer has names but no player ids.
 * AI-ID-01: the server reads the ids from the goal events itself and uses
 * them for the code map only when that list lines up with the public goal
 * list without doubt (alignGoalPlayerIds); then one player keeps one code.
 * Otherwise every mention gets its own code, and two players with the same
 * name are never merged. The ids stay in the code map: never in the public
 * answer, the model data or a log. Without names the model data has no
 * player codes at all. The kick-off date is not sent.
 *
 * The AI text is checked before use: only the codes this level may name, the
 * result the answer gives, nothing invented, and no squad player the level
 * does not show. When the AI is unavailable, or a check fails, the factual
 * text is used.
 */

type GenerateTextFn = (input: {
  systemInstruction?: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
  thinkingBudget?: number;
}) => Promise<GenerateTextResult>;

export interface PublicSummaryResult {
  text: string;
  source: "ai" | "factual";
}

/** The scorer's and assist's player ids of one public own goal; never sent or logged. */
export interface GoalPlayerIds {
  scorerId: string | null;
  assistId: string | null;
}

/** A goal event as the server reads it (match_events), for alignGoalPlayerIds. */
export interface GoalEventRow {
  type: string;
  minute: number | null;
  timestamp_ms: number | null;
  created_at: string;
  primary_player_id: string | null;
  secondary_player_id: string | null;
  payload?: unknown;
}

function payloadName(payload: unknown, key: "primaryPlayerName" | "secondaryPlayerName"): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** get_public_match_share's order: timestamp_ms, then minute (nulls last), then created_at. */
function compareGoalEvents(a: GoalEventRow, b: GoalEventRow): number {
  const nullsLast = (x: number | null, y: number | null) =>
    x === y ? 0 : x === null ? 1 : y === null ? -1 : x - y;
  return (
    nullsLast(a.timestamp_ms, b.timestamp_ms) ||
    nullsLast(a.minute, b.minute) ||
    (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)
  );
}

/**
 * AI-ID-01: the player ids for each public goal (null for an opponent goal),
 * or null when the two lists do not line up without doubt. They line up when
 * the events, in the public answer's own order, have the same count, the same
 * side and minute at every place, a stored name equal to the public one where
 * both exist, and no two events whose order is a tie but whose players
 * differ (the database could put those either way). An id is only used for a
 * name the public goal shows. Any doubt: null, and each mention gets its own
 * code as before.
 */
export function alignGoalPlayerIds(
  goals: readonly PublicGoal[],
  events: readonly GoalEventRow[]
): Array<GoalPlayerIds | null> | null {
  const ordered = events
    .filter((event) => event.type === "goal_for" || event.type === "goal_against")
    .slice()
    .sort(compareGoalEvents);
  if (ordered.length !== goals.length) return null;

  for (let i = 1; i < ordered.length; i += 1) {
    const [a, b] = [ordered[i - 1], ordered[i]];
    const samePlayers =
      a.type === b.type &&
      a.primary_player_id === b.primary_player_id &&
      a.secondary_player_id === b.secondary_player_id;
    if (compareGoalEvents(a, b) === 0 && !samePlayers) return null;
  }

  const sameName = (shown: string | null | undefined, stored: string | null) =>
    !shown || !stored || shown.trim().replace(/\s+/g, " ") === stored.replace(/\s+/g, " ");

  const ids: Array<GoalPlayerIds | null> = [];
  for (let i = 0; i < goals.length; i += 1) {
    const goal = goals[i];
    const event = ordered[i];
    const side = event.type === "goal_for" ? "own" : "opponent";
    if (side !== goal.side || (event.minute ?? null) !== goal.minute) return null;
    if (side === "opponent") {
      ids.push(null);
      continue;
    }
    if (
      !sameName(goal.scorer, payloadName(event.payload, "primaryPlayerName")) ||
      !sameName(goal.assist, payloadName(event.payload, "secondaryPlayerName"))
    ) {
      return null;
    }
    ids.push({
      scorerId: goal.scorer ? event.primary_player_id : null,
      assistId: goal.assist ? event.secondary_player_id : null,
    });
  }
  return ids;
}

/** AI-QA-02: the result level hides player details, so missing scorers are not news. */
export const RESULT_LEVEL_RULE =
  "Spilleropplysninger er ikke med på dette nivået: ikke kommenter at målscorere mangler eller ikke er registrert, og omtal bare kampfaktaene som er oppgitt.";

export interface PublicSummaryPrompt {
  systemInstruction: string;
  prompt: string;
  /** Scorer and assist codes; always empty below the detailed level. */
  allowedCodes: ReadonlySet<string>;
}

export function buildPublicSummaryPrompt(
  view: PublicMatchShare,
  pseudonyms: Pseudonymizer = createPseudonymizer(),
  /** Per public goal, from alignGoalPlayerIds; without it each mention gets its own code. */
  goalPlayerIds: ReadonlyArray<GoalPlayerIds | null> | null = null
): PublicSummaryPrompt {
  const named = view.detailLevel === "detailed";
  const allowedCodes = new Set<string>();
  const codeOf = (name: string | null | undefined, id?: string | null): string | null => {
    if (!named) return null;
    const code = pseudonyms.code(name, id);
    if (code) allowedCodes.add(code);
    return code;
  };

  const goals = view.goals ?? [];
  const ids = goalPlayerIds && goalPlayerIds.length === goals.length ? goalPlayerIds : null;
  const score = view.score ?? { for: 0, against: 0 };
  const result = `${score.for}–${score.against}`;
  const narrative = analyzeMatchNarrative(goals, { own: score.for, opponent: score.against });

  const facts: Record<string, unknown> = {
    lag: TEAM_PLACEHOLDER,
    motstander: OPPONENT_PLACEHOLDER,
    sluttresultat: {
      tekst: result,
      [TEAM_PLACEHOLDER]: score.for,
      [OPPONENT_PLACEHOLDER]: score.against,
      utfall: resolveOutcome(score.for, score.against),
    },
    tidslinje: narrative.complete ? "komplett" : "ufullstendig",
  };

  if (narrative.complete && narrative.goals.length > 0) {
    facts.mål = narrative.goals.map((goal) => {
      const entry: Record<string, unknown> = {
        minutt: goal.minute,
        lag: goal.side === "own" ? TEAM_PLACEHOLDER : OPPONENT_PLACEHOLDER,
        stilling_etter: `${goal.own}–${goal.opponent}`,
        type: GOAL_KIND_LABEL[goal.kind],
      };
      if (goal.decisive) entry.avgjørende = true;
      const source = goals[goal.inputIndex];
      const sourceIds = ids?.[goal.inputIndex] ?? null;
      if (goal.side === "own") {
        const scorer = codeOf(source.scorer, sourceIds?.scorerId);
        const assist = codeOf(source.assist, sourceIds?.assistId);
        if (scorer) entry.målscorer = scorer;
        if (assist) entry.assist = assist;
      }
      return entry;
    });
    facts.forløp = { snudd: narrative.comeback, utligninger: narrative.equalisers };
  } else if (!narrative.complete) {
    facts.registrerte_mål_av_totalt = `${goals.length} av ${score.for + score.against}`;
    const registered = goals
      .map((goal, index) => ({ goal, goalIds: ids?.[index] ?? null }))
      .filter(({ goal }) => goal.side === "own")
      .map(({ goal, goalIds }) => {
        const entry: Record<string, unknown> = {};
        const scorer = codeOf(goal.scorer, goalIds?.scorerId);
        const assist = codeOf(goal.assist, goalIds?.assistId);
        if (scorer) entry.målscorer = scorer;
        if (assist) entry.assist = assist;
        return entry;
      })
      .filter((entry) => Object.keys(entry).length > 0);
    if (registered.length > 0) facts.registrerte_egne_mål = registered;
    // Only where names are shown: without them there are no scorers to overstate.
    if (named) {
      const withoutScorer = ownGoalsWithoutScorer(score.for, registered.filter((entry) => entry.målscorer).length);
      if (withoutScorer > 0) facts.egne_mål_uten_registrert_målscorer = withoutScorer;
    }
  }

  const factCount = goals.length + allowedCodes.size;
  const guide = summaryLengthGuide(factCount);

  const systemInstruction = [
    "Du skriver offentlige kampreferater for barne- og breddefotball på norsk bokmål.",
    "Teksten leses av foreldre og andre som fulgte laget.",
    TEAM_PLACEHOLDER_RULE,
    named ? PLAYER_CODE_RULE : "Ikke nevn noen spillere, verken med navn eller kode, og ikke beskriv enkeltspillere.",
    NO_INVENTION_RULE,
    NO_DATE_RULE,
    MINUTE_RULE,
    "Sluttresultatet er alltid fasit.",
    "Når tidslinjen er komplett, fortell hvordan kampen utviklet seg ut fra feltene stilling_etter, type og avgjørende, og ikke mer.",
    FLOW_RULE,
    named ? SCORER_RULE : "",
    INCOMPLETE_TIMELINE_RULE,
    named ? INCOMPLETE_SCORER_RULE : RESULT_LEVEL_RULE,
    "Ikke ranger, ros eller kritiser enkeltspillere.",
    named ? "Spillere nevnes bare som målscorer eller assist." : "",
    "Ikke skriv at teksten er laget av AI.",
    "Svar bare med teksten, uten punktliste og uten markdown.",
  ]
    .filter(Boolean)
    .join(" ");

  const prompt = [
    "Skriv et kampreferat basert bare på disse dataene.",
    "",
    "Krav:",
    ...lengthRules(guide),
    resultRule(score.for, score.against),
    "- Ingen punktliste",
    "",
    "Kampdata:",
    JSON.stringify(facts, null, 2),
  ].join("\n");

  return { systemInstruction, prompt, allowedCodes };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Name parts long enough to check for (short parts match ordinary words). */
function nameParts(names: readonly string[]): string[] {
  return [...new Set(names.flatMap((name) => name.split(/\s+/)).map((part) => part.trim()).filter((part) => part.length >= 3))];
}

/** True when the text contains any of the names (whole words, any case). */
export function mentionsAnyName(text: string, names: readonly string[]): boolean {
  return nameParts(names).some((part) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(part)}($|[^\\p{L}\\p{N}])`, "iu").test(text)
  );
}

/**
 * Squad names the text must not contain at this level: all of them without
 * names, and at the detailed level everyone who is not a listed scorer or
 * assist.
 */
export function forbiddenNamesFor(view: PublicMatchShare, squadNames: readonly string[]): string[] {
  if (view.detailLevel !== "detailed") return [...squadNames];
  const shown = new Set(
    nameParts((view.goals ?? []).flatMap((goal) => [goal.scorer ?? "", goal.assist ?? ""]).filter(Boolean)).map((part) =>
      part.toLocaleLowerCase("nb")
    )
  );
  return squadNames
    .map((name) => name.split(/\s+/).filter((part) => !shown.has(part.toLocaleLowerCase("nb"))).join(" "))
    .filter((name) => name.trim().length > 0);
}

/** The team names to put back; without an opponent name, «motstanderen» (capitalised at a sentence start). */
function restoreTeams(text: string, view: PublicMatchShare): { team: string; opponent: string; text: string } {
  const opponent = view.opponentName?.trim();
  if (opponent) return { team: view.teamName, opponent, text };
  // Capitalise the generic word where the placeholder starts a sentence or the heading.
  const capitalised = text.replace(
    new RegExp(`(^|[.!?]\\s+|\\n)${OPPONENT_PLACEHOLDER.replace(/[[\]]/g, "\\$&")}`, "g"),
    (_match, lead: string) => `${lead}Motstanderen`
  );
  return { team: view.teamName, opponent: "motstanderen", text: capitalised };
}

export async function generatePublicSummary(
  view: PublicMatchShare,
  options: {
    squadNames: readonly string[];
    /** From alignGoalPlayerIds (server only); null or missing gives a code per mention. */
    goalPlayerIds?: ReadonlyArray<GoalPlayerIds | null> | null;
    generateTextFn?: GenerateTextFn;
    pseudonymizer?: Pseudonymizer;
  }
): Promise<PublicSummaryResult> {
  const factual: PublicSummaryResult = { text: buildFactualSummary(view, "no"), source: "factual" };

  // Status level stays without AI; without a result there is nothing to narrate either.
  if (view.detailLevel === "status" || !view.score) {
    return factual;
  }

  const generateTextFn = options.generateTextFn ?? generateText;
  // One code map for all attempts of this generation; it never leaves the server.
  const pseudonyms = options.pseudonymizer ?? createPseudonymizer();
  const { systemInstruction, prompt, allowedCodes } = buildPublicSummaryPrompt(
    view,
    pseudonyms,
    options.goalPlayerIds ?? null
  );
  const forbidden = forbiddenNamesFor(view, options.squadNames);

  for (const attempt of [
    { systemInstruction, prompt, temperature: 0.2 },
    { prompt: `${systemInstruction}\n\n${prompt}`, temperature: 0.3 },
  ]) {
    try {
      const generated = await generateTextFn({
        ...attempt,
        maxOutputTokens: SUMMARY_DEFAULTS.maxOutputTokens,
        thinkingBudget: SUMMARY_DEFAULTS.thinkingBudget,
      });
      const teams = restoreTeams(generated.text, view);
      const restored = pseudonyms.restore(teams.text, { team: teams.team, opponent: teams.opponent, allowedCodes });
      const text = restored.ok ? normalizeMatchSummaryText(restored.text) : null;
      const code = !restored.ok
        ? "ai_unknown_code"
        : !text || wordCount(text) < MIN_SUMMARY_WORDS
          ? "ai_invalid_output"
          : !statesResult(text, view.score) || statesReversedResult(text, view.score)
            ? "ai_wrong_result"
            : inventsUnsupportedDetail(text)
              ? "ai_unsupported_detail"
              : mentionsAnyName(text, forbidden)
                ? "ai_forbidden_name"
                : null;
      if (text && code === null) {
        return { text, source: "ai" };
      }
      console.warn("[public-summary] ai text rejected", { code });
    } catch (error) {
      console.warn("[public-summary] ai call failed", {
        code: error instanceof AiServiceError ? error.code : "unknown",
        finishReason: finishReasonOfError(error),
      });
    }
  }

  return factual;
}
