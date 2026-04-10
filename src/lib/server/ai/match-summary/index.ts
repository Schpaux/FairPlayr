import "server-only";

export type { MatchSummaryInput, MatchSummaryResult } from "@/lib/server/ai/match-summary/types";
export { buildMatchSummaryInput } from "@/lib/server/ai/match-summary/buildMatchSummaryInput";
export { buildMatchSummaryPrompt } from "@/lib/server/ai/match-summary/buildMatchSummaryPrompt";
export { buildFallbackMatchSummary } from "@/lib/server/ai/match-summary/buildFallbackMatchSummary";
export { normalizeMatchSummaryText } from "@/lib/server/ai/match-summary/normalizeMatchSummaryText";
export { generateMatchSummary, generateMatchSummaryByMatchId } from "@/lib/server/ai/match-summary/generateMatchSummary";
