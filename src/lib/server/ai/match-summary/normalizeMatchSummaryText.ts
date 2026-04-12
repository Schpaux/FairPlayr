import "server-only";

const MAX_LINES = 6;
const MAX_CHARS = 700;
const MIN_WORDS = 6;
const MIN_WORDS_BEST_EFFORT = 8;
const MIN_CHARS_BEST_EFFORT = 45;

function wordCount(text: string): number {
  return text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean).length;
}

function hasSentenceTerminator(text: string): boolean {
  return /[.!?](?:["')\]]|\s|$)/.test(text);
}

export function normalizeMatchSummaryText(text: string): string | null {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00A0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) {
    return null;
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES);

  if (lines.length === 0) {
    return null;
  }

  const compact = lines.join("\n");

  if (compact.length < 20) {
    return null;
  }

  const words = wordCount(compact);
  if (words < MIN_WORDS) {
    return null;
  }

  if (!hasSentenceTerminator(compact)) {
    // Best-effort rescue: accept reasonably long/complete-looking text by appending period.
    if (words >= MIN_WORDS_BEST_EFFORT && compact.length >= MIN_CHARS_BEST_EFFORT) {
      return `${compact}.`;
    }

    return null;
  }

  if (compact.length > MAX_CHARS) {
    return `${compact.slice(0, MAX_CHARS - 1).trim()}...`;
  }

  return compact;
}
