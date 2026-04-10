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

export async function generateMatchSummary(
  input: MatchSummaryInput,
  deps: GenerateMatchSummaryDeps = {}
): Promise<MatchSummaryResult> {
  const generateTextFn = deps.generateTextFn ?? generateText;

  console.info("[match-summary] generation started", {
    matchId: input.matchId,
  });

  const fallback = buildFallbackMatchSummary(input);

  try {
    const prompt = buildMatchSummaryPrompt(input);
    const generated = await generateTextFn({
      systemInstruction: prompt.systemInstruction,
      prompt: prompt.prompt,
      maxOutputTokens: SUMMARY_DEFAULTS.maxOutputTokens,
      temperature: SUMMARY_DEFAULTS.temperature,
    });

    const normalized = normalizeMatchSummaryText(generated.text);

    if (!normalized) {
      console.warn("[match-summary] ai output invalid, using fallback", {
        matchId: input.matchId,
      });

      return {
        text: fallback,
        source: "fallback",
      };
    }

    console.info("[match-summary] generation finished with ai", {
      matchId: input.matchId,
    });

    return {
      text: normalized,
      source: "ai",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";

    console.error("[match-summary] ai call failed, using fallback", {
      matchId: input.matchId,
      message,
    });

    return {
      text: fallback,
      source: "fallback",
    };
  }
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
