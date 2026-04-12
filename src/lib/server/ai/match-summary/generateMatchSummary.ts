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
  maxOutputTokens: 240,
};

const RETRY_PROMPT_SUFFIX =
  "\n\nViktig: Skriv 3 til 6 hele setninger pa norsk bokmal. Ikke svar med bare en kort frase.";

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

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const generated = await generateTextFn({
        systemInstruction: prompt.systemInstruction,
        prompt: attempt === 1 ? prompt.prompt : `${prompt.prompt}${RETRY_PROMPT_SUFFIX}`,
        maxOutputTokens: SUMMARY_DEFAULTS.maxOutputTokens,
        temperature: SUMMARY_DEFAULTS.temperature,
      });

      const normalized = normalizeMatchSummaryText(generated.text);
      if (normalized) {
        console.info("[match-summary] generation finished with ai", {
          matchId: input.matchId,
          attempt,
        });

        return {
          text: normalized,
          source: "ai",
        };
      }

      lastErrorMessage = `AI output invalid after normalization (attempt ${attempt})`;
      console.warn("[match-summary] ai output invalid", {
        matchId: input.matchId,
        attempt,
        rawLength: generated.text.length,
      });
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : "Ukjent feil";
      console.error("[match-summary] ai call failed", {
        matchId: input.matchId,
        attempt,
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
