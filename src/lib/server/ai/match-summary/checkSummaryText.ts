import "server-only";

/**
 * FEAT-SHARE-02: content checks shared by the internal report and the public
 * text. A text that fails them is not used (another attempt, then the
 * factual fallback).
 */

/**
 * Fewer words than this is a fragment, not a summary. The target length is
 * asked for in the prompt; a shorter but correct text is still better than
 * the factual fallback, so it is not rejected for that.
 */
export const MIN_SUMMARY_WORDS = 12;

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** True when the text states this result ("3–1", "3-1" or "3 - 1"). */
export function statesResult(text: string, score: { for: number; against: number }): boolean {
  return new RegExp(`(^|\\D)${score.for}\\s*[-–—]\\s*${score.against}(\\D|$)`).test(text);
}

/**
 * True when the text gives the result the wrong way round ("3–4" for a 4–3
 * win). The running score is always the team's first, and it can only pass
 * the reversed final score in a draw, so outside a draw this is a wrong
 * perspective, not an intermediate score.
 */
export function statesReversedResult(text: string, score: { for: number; against: number }): boolean {
  if (score.for === score.against) return false;
  return statesResult(text, { for: score.against, against: score.for });
}

/**
 * Words for things the app never records: chances, saves, effort, playing
 * style, feelings and atmosphere. A text that uses them has invented them.
 *
 * This is a limited quality filter, not a guarantee against invented facts:
 * it only catches these words. An invented fact in other words (a wrong
 * minute, a goal credited to the wrong code, "a tight
 * match") passes it. The real safeguards are the structured facts in the
 * prompt, the result check, the code check and the fallback text.
 */
const UNSUPPORTED_DETAIL =
  /(^|[^\p{L}])(sjanse|målsjanse|redning|reddet|stolpe|tverrligger|innsats|kjempe(?:t|nde)|ballbesittelse|presse(?:t|r)|spillestil|kombinasjonsspill|stemning|publikum|jubel|jublet|skuffe(?:t|lse)|stolt|glede|frustr)/iu;

/** AI-QA-01: the model gets no date, so «i dag», «dagens kamp», «i går» or «i helgen» are invented. */
const UNSUPPORTED_TIME =
  /(^|[^\p{L}])(i dag|dagens|i går|gårsdagens|i kveld|kveldens|i helgen|helgens|i morges)($|[^\p{L}])/iu;

export function inventsUnsupportedDetail(text: string): boolean {
  return UNSUPPORTED_DETAIL.test(text) || UNSUPPORTED_TIME.test(text);
}
