/**
 * Short display names for players — used in match-related surfaces (lineup,
 * bench, live match, score events) where space is limited.
 *
 * Rule: first name + first letter of each remaining word, up to 2 initials.
 *
 * Examples
 *   "Iver Knut Fossum" → "Iver KF"
 *   "Iver Boye Bakken" → "Iver BB"
 *   "Isak Helge Wahl"  → "Isak HW"
 *   "Lars Olsen"        → "Lars O"
 *   "Sindre"            → "Sindre"
 */
export function shortName(fullName: string): string {
  const normalized = fullName.trim().replace(/\s+/g, " ");
  if (!normalized) return fullName;

  const words = normalized.split(" ");
  if (words.length <= 1) return normalized;

  const firstName = words[0];
  const rest = words.slice(1);

  // First letter of each remaining word, up to 2
  const initials = rest
    .slice(0, 2)
    .map((w) => (w[0] ?? "").toUpperCase())
    .join("");

  return initials ? `${firstName} ${initials}` : firstName;
}

/**
 * Generates a stable short-name map for a list of players.
 *
 * When two players would get the same short name, appends a counter suffix
 * to all but the first occurrence: "Lars O", "Lars O2", "Lars O3", …
 */
export function buildShortNameMap(
  players: ReadonlyArray<{ id: string; name: string }>
): Map<string, string> {
  const shorts = players.map((p) => ({ id: p.id, short: shortName(p.name) }));

  // Count how many players share each short name
  const totals = new Map<string, number>();
  for (const { short } of shorts) {
    totals.set(short, (totals.get(short) ?? 0) + 1);
  }

  // Assign disambiguated names
  const seen = new Map<string, number>();
  const result = new Map<string, string>();

  for (const { id, short } of shorts) {
    if ((totals.get(short) ?? 1) <= 1) {
      result.set(id, short);
    } else {
      const n = (seen.get(short) ?? 0) + 1;
      seen.set(short, n);
      result.set(id, n === 1 ? short : `${short}${n}`);
    }
  }

  return result;
}
