import "server-only";
import { randomInt } from "node:crypto";

/**
 * SEC-04 / FEAT-SHARE-02: pseudonymisation for the AI summaries.
 *
 * The model never sees a player's name, id, the team or the opponent. Each
 * player gets a random code for one generation (the same code in every
 * attempt of that generation, a new one next time), and the teams get fixed
 * placeholders. The code map stays in this object on the server: it is never
 * sent, logged or stored.
 *
 * A player is known by their id, never by their name: two players with the
 * same name get different codes. Without an id each mention gets its own
 * code, so two mentions are never taken for one player on a guess (the text
 * may then not say that someone scored twice, but it cannot say it wrongly).
 *
 * This is pseudonymisation and data minimisation, not anonymisation: the
 * match facts that are sent (score, minutes, format) could still be linked to
 * a match by someone who already knows it.
 *
 * After generation the text is checked before names are put back: every
 * code and placeholder in it must be one this generation handed out and that
 * this report type may name. Anything else (an unknown code, a code that was
 * not allowed here, a mangled placeholder) rejects the text.
 */

export const TEAM_PLACEHOLDER = "[LAG]";
export const OPPONENT_PLACEHOLDER = "[MOTSTANDER]";

const CODE_PREFIX = "SPILLER_";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

/** A well-formed code (a genitive "s" may follow: "SPILLER_K7QXs"). */
const CODE = /SPILLER_[A-Z0-9]{4}(?![A-Z0-9])/g;
/**
 * What is left of a mangled code once the well-formed ones are removed:
 * "SPILLER" in capitals, or "spiller" glued to "_"/"-". The ordinary word
 * («spiller», «spillere», «Spillerne») does not match.
 */
const MANGLED_CODE = /SPILLER|[Ss]piller[_-]/;
/** Anything in square brackets: only the two team placeholders are valid. */
const BRACKET_TOKEN = /\[[^\]\n]{0,40}\]/g;

export type RestoreError = "unknown_code" | "invalid_placeholder";

export type RestoreResult = { ok: true; text: string } | { ok: false; error: RestoreError };

export interface Pseudonymizer {
  /**
   * The code for this player, or null for no name. The same id always gets
   * the same code; without an id every call gets a new one. The id stays here.
   */
  code(name: string | null | undefined, id?: string | null): string | null;
  /**
   * Validates the model's text and puts names back. `allowedCodes` are the
   * codes this report may name; any other code rejects the text.
   */
  restore(
    text: string,
    names: { team: string; opponent: string; allowedCodes: ReadonlySet<string> }
  ): RestoreResult;
}

export function createPseudonymizer(random: (max: number) => number = randomInt): Pseudonymizer {
  const codeById = new Map<string, string>();
  const nameByCode = new Map<string, string>();

  const newCode = (): string => {
    for (;;) {
      let suffix = "";
      for (let i = 0; i < CODE_LENGTH; i += 1) suffix += CODE_ALPHABET[random(CODE_ALPHABET.length)];
      const code = `${CODE_PREFIX}${suffix}`;
      if (!nameByCode.has(code)) return code;
    }
  };

  return {
    code(name, id) {
      if (typeof name !== "string" || !name.trim()) return null;
      const known = typeof id === "string" && id ? id : null;
      const existing = known ? codeById.get(known) : undefined;
      if (existing) return existing;
      const code = newCode();
      if (known) codeById.set(known, code);
      nameByCode.set(code, name.trim().replace(/\s+/g, " "));
      return code;
    },

    restore(text, { team, opponent, allowedCodes }) {
      for (const match of text.matchAll(CODE)) {
        const token = match[0];
        if (!nameByCode.has(token) || !allowedCodes.has(token)) return { ok: false, error: "unknown_code" };
      }
      const withoutCodes = text.replace(CODE, "");
      if (MANGLED_CODE.test(withoutCodes)) {
        return { ok: false, error: "unknown_code" };
      }
      for (const match of text.matchAll(BRACKET_TOKEN)) {
        if (match[0] !== TEAM_PLACEHOLDER && match[0] !== OPPONENT_PLACEHOLDER) {
          return { ok: false, error: "invalid_placeholder" };
        }
      }

      const restored = text
        .replace(CODE, (token) => nameByCode.get(token) as string)
        .split(TEAM_PLACEHOLDER)
        .join(team)
        .split(OPPONENT_PLACEHOLDER)
        .join(opponent);

      // A broken placeholder ("[LAG", "MOTSTANDER]") leaves a bracket behind.
      if (/[[\]]/.test(restored)) return { ok: false, error: "invalid_placeholder" };
      return { ok: true, text: restored };
    },
  };
}
