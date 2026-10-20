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

interface NameParts {
  first: string;
  /** Last word of the name, or "" for a one-word name. */
  last: string;
  full: string;
  firstKey: string;
  lastChars: string[];
  lastKey: string[];
  /** Everything after the first name, e.g. "Marie Ruud". */
  restChars: string[];
  restKey: string[];
  fullKey: string;
}

function splitName(name: string): NameParts {
  // NFC, so a name pasted in decomposed form (common from iOS/macOS) matches.
  const full = name.normalize("NFC").trim().replace(/\s+/g, " ");
  const words = full ? full.split(" ") : [];
  const first = words[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1] : "";
  const lastChars = Array.from(last);
  const restChars = Array.from(words.slice(1).join(" "));

  return {
    first,
    last,
    full,
    firstKey: first.toLowerCase(),
    lastChars,
    lastKey: lastChars.map((char) => char.toLowerCase()),
    restChars,
    restKey: restChars.map((char) => char.toLowerCase()),
    fullKey: full.toLowerCase(),
  };
}

function commonPrefixLength(a: string[], b: string[]): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) {
    length += 1;
  }
  return length;
}

/** The ladder for one player against the others sharing their first name. */
function ladderName(self: NameParts, sameFirst: NameParts[]): string {
  const others = sameFirst.filter((other) => other.fullKey !== self.fullKey);

  if (others.length === 0 || self.lastChars.length === 0) {
    return self.first;
  }

  // Same last word, different middle names: the shortest unique prefix of
  // everything after the first name ("Ida M" / "Ida S" for "Ida Marie Ruud" /
  // "Ida Sofie Ruud"), so the tag stays short.
  const lastKey = self.lastKey.join("");
  if (others.some((other) => other.lastKey.join("") === lastKey)) {
    const needed = 1 + Math.max(...others.map((other) => commonPrefixLength(self.restKey, other.restKey)));
    return `${self.first} ${self.restChars.slice(0, Math.min(needed, self.restChars.length)).join("").trimEnd()}`;
  }

  const needed = 1 + Math.max(...others.map((other) => commonPrefixLength(self.lastKey, other.lastKey)));
  return `${self.first} ${self.lastChars.slice(0, Math.min(needed, self.lastChars.length)).join("")}`;
}

/**
 * Display names for the match surfaces (pitch, bench, scorer sheet), built
 * from the match squad: the ladder from DESIGN.md §5.2 (FEAT-NAME-01).
 *
 * 1. First name when it is unique in the squad: "Emma".
 * 2. Otherwise first name + surname initial: "Emma H" / "Emma B".
 * 3. Otherwise the shortest unique surname prefix: "Emma Hau" / "Emma Han".
 *    Each player gets the shortest form that tells them apart, so a third
 *    "Emma Berg" stays "Emma B".
 * 4. Identical full names: first name + shirt number, the shortest form
 *    that tells them apart ("Emma #7" / "Emma #12", next to "Emma Hau").
 *    Without a distinguishing number, the first in squad order keeps the
 *    ladder name and the next ones get "(2)", "(3)", … as a last resort.
 *
 * Display only: ids and stored names are never changed. Every id in
 * `players` gets an entry, and the entries are unique.
 */
export function buildDisplayNameMap(
  players: ReadonlyArray<{ id: string; name: string; number?: number | null }>
): Map<string, string> {
  const parts = players.map((player) => splitName(player.name));

  const byFirst = new Map<string, NameParts[]>();
  for (const part of parts) {
    byFirst.set(part.firstKey, [...(byFirst.get(part.firstKey) ?? []), part]);
  }

  const base = parts.map((part, index) =>
    part.full ? ladderName(part, byFirst.get(part.firstKey) ?? []) : players[index].name
  );

  // Identical full names: shirt number when it tells them apart, else a counter.
  const byFull = new Map<string, number[]>();
  parts.forEach((part, index) => {
    byFull.set(part.fullKey, [...(byFull.get(part.fullKey) ?? []), index]);
  });

  const labels = [...base];
  for (const [fullKey, indexes] of byFull) {
    // Empty names have nothing to add a number to; the safety net separates them.
    if (indexes.length < 2 || fullKey === "") continue;

    const numberCount = new Map<number, number>();
    for (const index of indexes) {
      const number = players[index].number;
      if (number !== undefined && number !== null) {
        numberCount.set(number, (numberCount.get(number) ?? 0) + 1);
      }
    }

    let unnumbered = 0;
    for (const index of indexes) {
      const number = players[index].number;
      if (number !== undefined && number !== null && numberCount.get(number) === 1) {
        labels[index] = `${parts[index].first} #${number}`;
      } else {
        unnumbered += 1;
        labels[index] = unnumbered === 1 ? base[index] : `${base[index]} (${unnumbered})`;
      }
    }
  }

  // Safety net: never hand out the same label twice.
  const used = new Set<string>();
  const result = new Map<string, string>();
  players.forEach((player, index) => {
    let label = labels[index];
    for (let counter = 2; used.has(label); counter += 1) {
      label = `${labels[index]} (${counter})`;
    }
    used.add(label);
    result.set(player.id, label);
  });

  return result;
}
