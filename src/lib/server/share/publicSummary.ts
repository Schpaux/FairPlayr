import "server-only";
import { generateText, type GenerateTextResult } from "@/lib/server/ai/service";
import { normalizeMatchSummaryText } from "@/lib/server/ai/match-summary/normalizeMatchSummaryText";
import { buildFactualSummary, type PublicMatchShare } from "@/domain/matchShare";

/**
 * FEAT-SHARE-01: the public summary of a shared match.
 *
 * It is written from the public answer alone (what a visitor may already
 * see at the share's level), never from the internal report or the match
 * state, so it cannot contain playing time, attendance or anything the level
 * hides. It is generated once per completed match and level and stored; a
 * page visit never generates.
 *
 * The AI text is checked before use: it must state the result the answer
 * gives, and it must not name a squad player the level does not show. When
 * the AI is unavailable, or the check fails, the factual text is used.
 */

type GenerateTextFn = (input: {
  systemInstruction?: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}) => Promise<GenerateTextResult>;

export interface PublicSummaryResult {
  text: string;
  source: "ai" | "factual";
}

function formatKickoff(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(at);
}

export function buildPublicSummaryPrompt(view: PublicMatchShare): { systemInstruction: string; prompt: string } {
  const named = view.detailLevel === "detailed";
  const systemInstruction = [
    "Du skriver korte, offentlige kampreferater for barne- og breddefotball på norsk bokmål.",
    "Teksten leses av foreldre og andre som fulgte laget.",
    "Bruk bare fakta fra kampdataene. Ikke dikt opp sjanser, redninger, spillestil, prestasjoner, vær eller stemning.",
    "Ikke ranger, ros eller kritiser enkeltspillere.",
    named
      ? "Bruk bare navnene som står i kampdataene, og bare som målscorer eller assist."
      : "Ikke nevn noen spillere ved navn, og ikke beskriv enkeltspillere.",
    "Ikke skriv at teksten er laget av AI.",
    "Svar bare med teksten: en kort overskrift på første linje, deretter ett kort avsnitt.",
  ].join(" ");

  const outcome = view.score
    ? view.score.for > view.score.against
      ? "seier"
      : view.score.for === view.score.against
        ? "uavgjort"
        : "tap"
    : null;

  const context: Record<string, unknown> = {
    lag: view.teamName,
    motstander: view.opponentName ?? "motstanderen",
  };
  const kickoff = formatKickoff(view.startsAt);
  if (kickoff) context.dato = kickoff;
  if (view.score) {
    context.resultat = { for: view.score.for, mot: view.score.against, utfall: outcome };
  }
  if (view.goals && view.goals.length > 0) {
    context.mål = view.goals.map((goal) => {
      const entry: Record<string, unknown> = {
        minutt: goal.minute,
        lag: goal.side === "own" ? view.teamName : view.opponentName ?? "motstanderen",
      };
      if (named && goal.side === "own") {
        if (goal.scorer) entry.målscorer = goal.scorer;
        if (goal.assist) entry.assist = goal.assist;
      }
      return entry;
    });
  }

  const prompt = [
    "Skriv et kort kampreferat basert bare på disse dataene.",
    "",
    "Krav:",
    "- Norsk bokmål",
    "- Overskrift på første linje, deretter ett avsnitt på 2–4 setninger (40–90 ord)",
    `- Oppgi resultatet som ${view.score ? `${view.score.for}–${view.score.against}` : "ukjent"}`,
    "- Ingen punktliste",
    "- Ikke dikt opp noe som ikke står i dataene",
    "",
    "Kampdata:",
    JSON.stringify(context, null, 2),
  ].join("\n");

  return { systemInstruction, prompt };
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

/** True when the text states this result ("3–1", "3-1" or "3 - 1"). */
export function statesResult(text: string, score: { for: number; against: number }): boolean {
  return new RegExp(`(^|\\D)${score.for}\\s*[-–—]\\s*${score.against}(\\D|$)`).test(text);
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

export async function generatePublicSummary(
  view: PublicMatchShare,
  options: { squadNames: readonly string[]; generateTextFn?: GenerateTextFn }
): Promise<PublicSummaryResult> {
  const factual: PublicSummaryResult = { text: buildFactualSummary(view, "no"), source: "factual" };

  // Without a result there is nothing to narrate that the factual text does not say.
  if (view.detailLevel === "status" || !view.score) {
    return factual;
  }

  const generateTextFn = options.generateTextFn ?? generateText;
  const { systemInstruction, prompt } = buildPublicSummaryPrompt(view);
  const forbidden = forbiddenNamesFor(view, options.squadNames);

  for (const attempt of [
    { systemInstruction, prompt, temperature: 0.2 },
    { prompt: `${systemInstruction}\n\n${prompt}`, temperature: 0.3 },
  ]) {
    try {
      const generated = await generateTextFn({ ...attempt, maxOutputTokens: 400 });
      const text = normalizeMatchSummaryText(generated.text);
      if (text && statesResult(text, view.score) && !mentionsAnyName(text, forbidden)) {
        return { text, source: "ai" };
      }
      console.warn("[public-summary] ai text rejected");
    } catch (error) {
      console.warn("[public-summary] ai call failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return factual;
}
