import "server-only";

/**
 * Maximum number of non-empty content lines (title + up to 3 paragraphs).
 * Blank separator lines between sections are preserved but do not count toward this limit.
 */
const MAX_CONTENT_LINES = 4;
const MAX_CHARS = 1100;
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

/**
 * Normalise AI-generated match summary text.
 *
 * Preserves single blank lines between sections (title / paragraph breaks) so that
 * the UI can render them correctly with `whitespace-pre-line`. Collapses runs of 2+
 * blank lines into a single blank line. Limits to MAX_CONTENT_LINES non-empty lines.
 *
 * Returns null if the text is too short, too sparse, or lacks sentence structure.
 */
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

  // Process lines: keep content lines up to MAX_CONTENT_LINES, preserve single blank-line separators
  const rawLines = normalized.split("\n").map((line) => line.trim());
  const resultLines: string[] = [];
  let contentLineCount = 0;
  let prevWasBlank = false;

  for (const line of rawLines) {
    if (line) {
      contentLineCount++;
      if (contentLineCount > MAX_CONTENT_LINES) break;
      resultLines.push(line);
      prevWasBlank = false;
    } else {
      // Add a single blank separator only when adjacent to content (no consecutive blanks)
      if (resultLines.length > 0 && !prevWasBlank) {
        resultLines.push("");
        prevWasBlank = true;
      }
    }
  }

  // Strip trailing blank line if the last content line ended up followed by one
  while (resultLines.length > 0 && resultLines[resultLines.length - 1] === "") {
    resultLines.pop();
  }

  if (resultLines.length === 0) {
    return null;
  }

  const compact = resultLines.join("\n");

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
