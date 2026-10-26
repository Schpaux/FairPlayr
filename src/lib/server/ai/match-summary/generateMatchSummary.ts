import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiServiceError } from "@/lib/server/ai/errors";
import { generateText, type GenerateTextResult } from "@/lib/server/ai/service";
import { buildFallbackMatchSummary } from "@/lib/server/ai/match-summary/buildFallbackMatchSummary";
import { buildMatchSummaryInput } from "@/lib/server/ai/match-summary/buildMatchSummaryInput";
import { buildMatchSummaryPrompt } from "@/lib/server/ai/match-summary/buildMatchSummaryPrompt";
import { normalizeMatchSummaryText } from "@/lib/server/ai/match-summary/normalizeMatchSummaryText";
import {
  MIN_SUMMARY_WORDS,
  inventsUnsupportedDetail,
  statesResult,
  statesReversedResult,
  wordCount,
} from "@/lib/server/ai/match-summary/checkSummaryText";
import { createPseudonymizer, type Pseudonymizer } from "@/lib/server/ai/match-summary/pseudonymize";
import type {
  MatchSummaryFailureCode,
  MatchSummaryInput,
  MatchSummaryResult,
} from "@/lib/server/ai/match-summary/types";

export type GenerateTextFn = (input: {
  systemInstruction?: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
  thinkingBudget?: number;
}) => Promise<GenerateTextResult>;

interface GenerateMatchSummaryDeps {
  generateTextFn?: GenerateTextFn;
  /** Tests only: a deterministic code source. */
  pseudonymizer?: Pseudonymizer;
}

/** Shared by the internal report and the public text (publicSummary.ts). */
export const SUMMARY_DEFAULTS = {
  temperature: 0.2,
  // Gemini 2.5 counts its thinking against this limit; 600 cut longer texts short.
  maxOutputTokens: 2048,
  // AI-QA-01: a bounded think (valid for every Gemini 2.5 model, see
  // thinkingConfigFor) leaves at least 1,500 tokens for a 250-word text; the
  // dynamic default could use the whole limit and return nothing.
  thinkingBudget: 512,
};

/** The finish reason of an empty answer, for the log (never content). */
export function finishReasonOfError(error: unknown): string | undefined {
  const reason = error instanceof AiServiceError ? error.details?.finishReason : undefined;
  return typeof reason === "string" ? reason : undefined;
}

const RETRY_PROMPT_SUFFIX =
  "\n\nViktig: Skriv hele setninger på norsk bokmål, med overskrift og avsnitt. Bruk plassholderne og kodene nøyaktig slik de står.";

interface GenerationAttemptSpec {
  label: string;
  systemInstruction?: string;
  prompt: string;
  temperature?: number;
}

/** A short code for a failed call: never the message, which can carry upstream response text. */
export function failureCodeForError(error: unknown): MatchSummaryFailureCode {
  if (error instanceof AiServiceError && error.code.startsWith("VERTEX_CONFIG")) return "ai_config";
  return "ai_call_failed";
}

/**
 * Checks a raw model text and, when it passes, returns it with the names put
 * back. Codes and placeholders are checked first (on the model's own text),
 * then the result, the length and invented details.
 */
export function acceptSummaryText(
  rawText: string,
  input: MatchSummaryInput,
  pseudonyms: Pseudonymizer,
  allowedCodes: ReadonlySet<string>
): { ok: true; text: string } | { ok: false; code: MatchSummaryFailureCode } {
  const restored = pseudonyms.restore(rawText, {
    team: input.teamName.trim() || "Laget",
    opponent: input.opponentName.trim() || "motstanderen",
    allowedCodes,
  });
  if (!restored.ok) return { ok: false, code: "ai_unknown_code" };

  const text = normalizeMatchSummaryText(restored.text);
  if (!text || wordCount(text) < MIN_SUMMARY_WORDS) return { ok: false, code: "ai_invalid_output" };
  const score = { for: input.scoreFor, against: input.scoreAgainst };
  if (!statesResult(text, score) || statesReversedResult(text, score)) {
    return { ok: false, code: "ai_wrong_result" };
  }
  if (inventsUnsupportedDetail(text)) return { ok: false, code: "ai_unsupported_detail" };
  return { ok: true, text };
}

export async function generateMatchSummary(
  input: MatchSummaryInput,
  deps: GenerateMatchSummaryDeps = {}
): Promise<MatchSummaryResult> {
  const generateTextFn = deps.generateTextFn ?? generateText;
  // One code map per generation: the same player keeps the same code in every attempt.
  const pseudonyms = deps.pseudonymizer ?? createPseudonymizer();

  console.info("[match-summary] generation started", {
    matchId: input.matchId,
  });

  const fallback = buildFallbackMatchSummary(input);
  const prompt = buildMatchSummaryPrompt(input, pseudonyms);
  let lastFailure: MatchSummaryFailureCode | null = null;
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
      temperature: 0.3,
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
  ];

  for (let attempt = 1; attempt <= attempts.length; attempt += 1) {
    const spec = attempts[attempt - 1];
    try {
      const generated = await generateTextFn({
        systemInstruction: spec.systemInstruction,
        prompt: spec.prompt,
        maxOutputTokens: SUMMARY_DEFAULTS.maxOutputTokens,
        thinkingBudget: SUMMARY_DEFAULTS.thinkingBudget,
        temperature: spec.temperature ?? SUMMARY_DEFAULTS.temperature,
      });

      const accepted = acceptSummaryText(generated.text, input, pseudonyms, prompt.allowedCodes);
      if (accepted.ok) {
        console.info("[match-summary] generation finished with ai", {
          matchId: input.matchId,
          attempt,
          strategy: spec.label,
        });

        return {
          text: accepted.text,
          source: "ai",
        };
      }

      lastFailure = accepted.code;
      console.warn("[match-summary] ai output rejected", {
        matchId: input.matchId,
        attempt,
        strategy: spec.label,
        code: accepted.code,
        rawLength: generated.text.length,
      });
    } catch (error) {
      lastFailure = failureCodeForError(error);
      console.error("[match-summary] ai call failed", {
        matchId: input.matchId,
        attempt,
        strategy: spec.label,
        code: lastFailure,
        errorCode: error instanceof AiServiceError ? error.code : undefined,
        finishReason: finishReasonOfError(error),
      });
      // Missing configuration does not change between attempts.
      if (lastFailure === "ai_config") break;
    }
  }

  console.warn("[match-summary] using fallback summary", {
    matchId: input.matchId,
    code: lastFailure,
  });

  return {
    text: fallback,
    source: "fallback",
    failureReason: lastFailure ?? "ai_invalid_output",
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
