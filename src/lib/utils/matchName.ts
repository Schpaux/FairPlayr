/**
 * Auto-generates a match display name from the opponent name and kick-off time.
 *
 * Format
 *   With opponent : "Lånke – 12. apr 11:00"
 *   Without       : "Kamp – 12. apr 11:00"
 *
 * The separator is an en-dash (–) so the name is legible without a space
 * before it on narrow screens.
 */

const MONTHS_NO = [
  "jan",
  "feb",
  "mar",
  "apr",
  "mai",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "des",
];

/**
 * Formats a Date as the short Norwegian date+time used in match names:
 * "12. apr 11:00"
 */
export function formatMatchDate(date: Date): string {
  const day = date.getDate();
  const month = MONTHS_NO[date.getMonth()] ?? "?";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${day}. ${month} ${hh}:${mm}`;
}

/**
 * Generates an auto match name.
 *
 * @param opponentName - the opponent team name (null/empty → generic prefix)
 * @param date         - kick-off Date; defaults to now
 */
export function generateMatchName(
  opponentName: string | null | undefined,
  date: Date = new Date()
): string {
  const dateStr = formatMatchDate(date);
  const opponent = (opponentName ?? "").trim();
  return opponent ? `${opponent} \u2013 ${dateStr}` : `Kamp \u2013 ${dateStr}`;
}

/**
 * Returns true if `name` looks like an auto-generated match name (heuristic).
 * Used to decide whether to re-generate when the user edits opponent or time.
 */
export function isAutoMatchName(name: string): boolean {
  // Auto names always contain " – " (en-dash with spaces) followed by a date fragment
  return /\s\u2013\s\d{1,2}\.\s[a-z]{3}\s\d{2}:\d{2}$/.test(name.trim());
}
