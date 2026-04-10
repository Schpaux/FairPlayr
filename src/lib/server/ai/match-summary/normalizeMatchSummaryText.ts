import "server-only";

const MAX_LINES = 6;
const MAX_CHARS = 700;

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

  if (compact.length > MAX_CHARS) {
    return `${compact.slice(0, MAX_CHARS - 1).trim()}...`;
  }

  return compact;
}
