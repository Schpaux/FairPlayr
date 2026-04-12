import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText, type GenerateTextResult } from "@/lib/server/ai/service";
import { buildFallbackMatchSummary } from "@/lib/server/ai/match-summary/buildFallbackMatchSummary";
import { buildMatchSummaryInput } from "@/lib/server/ai/match-summary/buildMatchSummaryInput";
import { buildMatchSummaryPrompt } from "@/lib/server/ai/match-summary/buildMatchSummaryPrompt";
import { normalizeMatchSummaryText } from "@/lib/server/ai/match-summary/normalizeMatchSummaryText";
import type { MatchSummaryInput, MatchSummaryResult } from "@/lib/server/ai/match-summary/types";

interface GenerateMatchSummaryDeps {
  generateTextFn?: (input: {
    systemInstruction?: string;
    prompt: string;
    maxOutputTokens?: number;
    temperature?: number;
  }) => Promise<GenerateTextResult>;
}

const SUMMARY_DEFAULTS = {
  temperature: 0.2,
  maxOutputTokens: 420,
};

const RETRY_PROMPT_SUFFIX =
  "\n\nViktig: Skriv 3 til 6 hele setninger pa norsk bokmal. Ikke svar med bare en kort frase.";

interface GenerationAttemptSpec {
  label: string;
  systemInstruction?: string;
  prompt: string;
  temperature?: number;
}

function summarizeInvalidOutput(rawText: string): string {
  const compact = rawText.replace(/\s+/g, " ").trim();
  const words = compact ? compact.split(" ").filter(Boolean).length : 0;
  const hasTerminator = /[.!?](?:["')\]]|\s|$)/.test(compact);
  const snippet = compact.slice(0, 120);
  return `invalid_output(chars=${compact.length}, words=${words}, sentenceTerminator=${String(hasTerminator)}, snippet="${snippet}")`;
}

function buildRepairedSummaryFromPartial(input: MatchSummaryInput, rawText: string): string | null {
  const compact = rawText.replace(/\s+/g, " ").trim();
  if (!compact) {
    return null;
  }

  const words = compact.split(" ").filter(Boolean);
  if (words.length < 5) {
    return null;
  }

  const team = input.teamName.trim() || "Laget";
  const opponent = input.opponentName.trim() || "motstanderen";
  const score = `${input.scoreFor}-${input.scoreAgainst}`;

  const cleanedBase = compact.replace(/[.!?\s]+$/g, "");
  const needsOpponentCompletion = /\bmot$/i.test(cleanedBase);
  const firstSentenceBase = needsOpponentCompletion
    ? `${cleanedBase} ${opponent}`
    : cleanedBase;
  const firstSentence = `${firstSentenceBase}.`;

  const resultSentence = `Resultatet ble ${score}.`;

  let detailSentence = "";
  if (input.goalsFor.length > 0) {
    const scorers = input.goalsFor
      .map((goal) => goal.scorerName)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      .slice(0, 3);
    if (scorers.length > 0) {
      detailSentence = `Målscorere for ${team} var ${scorers.join(", ")}.`;
    }
  }

  const usageSentence =
    input.playersUsed > 0
      ? `${team} brukte ${input.playersUsed} spillere i kampen.`
      : "";

  const repaired = [firstSentence, resultSentence, detailSentence, usageSentence]
    .filter(Boolean)
    .join(" ");

  return normalizeMatchSummaryText(repaired);
}

function buildHardRecoveryPrompt(input: MatchSummaryInput): string {
  const goalsFor = input.goalsFor
    .map((g) => `${g.minute ?? "?"}' ${g.scorerName ?? "ukjent"}`)
    .slice(0, 6)
    .join(", ");
  const goalsAgainst = input.goalsAgainst
    .map((g) => `${g.minute ?? "?"}'`)
    .slice(0, 6)
    .join(", ");

  return [
    "Skriv en kampoppsummering pa norsk bokmal.",
    "Krav:",
    "- 4 hele setninger.",
    "- Minst 60 tegn totalt.",
    "- Enkelt sprak for barne-/breddefotball.",
    "- Ingen overskrift, ingen punktliste.",
    "- Bruk kun fakta under.",
    "",
    `Lag: ${input.teamName}`,
    `Motstander: ${input.opponentName}`,
    `Resultat: ${input.scoreFor}-${input.scoreAgainst}`,
    `Vare mal: ${goalsFor || "ingen detaljer"}`,
    `Motstanders mal: ${goalsAgainst || "ingen detaljer"}`,
    `Antall spillere brukt: ${input.playersUsed}`,
  ].join("\n");
}

export async function generateMatchSummary(
  input: MatchSummaryInput,
  deps: GenerateMatchSummaryDeps = {}
): Promise<MatchSummaryResult> {
  const generateTextFn = deps.generateTextFn ?? generateText;

  console.info("[match-summary] generation started", {
    matchId: input.matchId,
  });

  const fallback = buildFallbackMatchSummary(input);
  const prompt = buildMatchSummaryPrompt(input);
  let lastErrorMessage: string | null = null;
  const attempts: GenerationAttemptSpec[] = [
    {
      label: "default",
      systemInstruction: prompt.systemInstruction,
      prompt: prompt.prompt,
    },
    {
      label: "default_with_retry_suffix",
      systemInstruction: prompt.systemInstruction,
      prompt: `${prompt.prompt}${RETRY_PROMPT_SUFFIX}`,
    },
    {
      label: "no_system_instruction",
      prompt: [
        "Instruksjoner:",
        prompt.systemInstruction,
        "",
        "Oppgave:",
        `${prompt.prompt}${RETRY_PROMPT_SUFFIX}`,
      ].join("\n"),
    },
    {
      label: "hard_recovery_plain_prompt",
      prompt: buildHardRecoveryPrompt(input),
      temperature: 0.35,
    },
  ];

  for (let attempt = 1; attempt <= attempts.length; attempt += 1) {
    const spec = attempts[attempt - 1];
    try {
      const generated = await generateTextFn({
        systemInstruction: spec.systemInstruction,
        prompt: spec.prompt,
        maxOutputTokens: SUMMARY_DEFAULTS.maxOutputTokens,
        temperature: spec.temperature ?? SUMMARY_DEFAULTS.temperature,
      });

      const normalized = normalizeMatchSummaryText(generated.text);
      if (normalized) {
        console.info("[match-summary] generation finished with ai", {
          matchId: input.matchId,
          attempt,
          strategy: spec.label,
        });

        return {
          text: normalized,
          source: "ai",
        };
      }

      const repaired = buildRepairedSummaryFromPartial(input, generated.text);
      if (repaired) {
        console.info("[match-summary] generation finished with repaired ai text", {
          matchId: input.matchId,
          attempt,
          strategy: spec.label,
        });

        return {
          text: repaired,
          source: "ai",
        };
      }

      lastErrorMessage = `${summarizeInvalidOutput(generated.text)} (attempt ${attempt}, strategy=${spec.label})`;
      console.warn("[match-summary] ai output invalid", {
        matchId: input.matchId,
        attempt,
        strategy: spec.label,
        rawLength: generated.text.length,
        rawPreview: generated.text.slice(0, 120),
      });
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : "Ukjent feil";
      console.error("[match-summary] ai call failed", {
        matchId: input.matchId,
        attempt,
        strategy: spec.label,
        message: lastErrorMessage,
      });
    }
  }

  console.warn("[match-summary] using fallback summary", {
    matchId: input.matchId,
    reason: lastErrorMessage,
  });

  return {
    text: fallback,
    source: "fallback",
    failureReason: lastErrorMessage ?? "Ukjent AI-feil",
  };
}

export async function generateMatchSummaryByMatchId(
  supabase: SupabaseClient,
  userId: string,
  matchId: string,
  deps: GenerateMatchSummaryDeps = {}
): Promise<{ input: MatchSummaryInput; result: MatchSummaryResult }> {
  const input = await buildMatchSummaryInput(supabase, userId, matchId);
  const result = await generateMatchSummary(input, deps);

  return {
    input,
    result,
  };
}
