/**
 * UI-TOKENS-01 (B3): static design guard. Pure scanner; the file walk and the
 * exception list live in designGuard.test.ts.
 *
 * It looks for patterns DESIGN.md forbids and that B3 removed, so they cannot
 * creep back:
 *   - glow:        the legacy `.glow-*` utilities and `--glow-*` tokens (§2.5)
 *   - legacyLime:  the `fp-cta` / `fp-accent` tokens (lime is fp-lime, §2.2)
 *   - retiredToken: the off-spec status colours `danger` and `fp-warning`
 *                  (use fp-danger-text, fp-warn-text, fp-danger). Tailwind
 *                  silently drops a class whose token is gone, so the colour
 *                  would vanish without an error.
 *   - limeText:    lime as a text colour (`text-primary`, `text-fp-lime`, …,
 *                  `color: var(--fp-lime)`); lime is a fill, ring or underline (§2.5)
 *   - blur:        backdrop blur, blur filters, glass (§2.5)
 *   - hoverMotion: hover scale or translate (§5.7: hover is a fill shift)
 *   - colour:      hard-coded colours where tokens apply: hex and numeric
 *                  rgb()/hsl()/oklch() literals, Tailwind palette classes
 *                  (`bg-red-500`, `text-white`, …) and `bg-black/50`-style scrims
 *
 * Context: comments are ignored. Hex in an SVG paint attribute (`fill="#…"`)
 * is reported as its own rule, `svgColour`, because a few third-party marks
 * must keep their colours; everything else in an SVG can use currentColor.
 * Values built at runtime (`rgb(${r} …)`, `var(--x)`) are not literals.
 */

export type GuardRule =
  | "glow"
  | "legacyLime"
  | "retiredToken"
  | "limeText"
  | "blur"
  | "hoverMotion"
  | "colour"
  | "svgColour";

export interface GuardFinding {
  rule: GuardRule;
  line: number;
  match: string;
}

type Located = GuardFinding & { at: number };

/** In source order, without the offset. */
function ordered(found: Located[]): GuardFinding[] {
  return found.sort((a, b) => a.at - b.at).map(({ rule, line, match }) => ({ rule, line, match }));
}

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOUR_UTILITIES =
  "bg|text|border(?:-[trblxy])?|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|shadow|divide|placeholder|caret|accent";
// Optional variant prefixes such as `dark:`, `hover:`, `group-focus/x:`.
const VARIANTS = String.raw`(?:[\w\-\[\]/=&>*()@.]+:)*`;
// A class token ends at whitespace, a quote, a backtick or the end of the string.
const END = String.raw`(?=$|[\s"'\x60}])`;

const TS_RULES: [GuardRule, RegExp][] = [
  ["glow", /\bglow-(?:primary|accent|cta)\b|--glow-[\w-]+/g],
  ["legacyLime", /\bfp-(?:cta|accent)\b(?:-foreground)?/g],
  ["retiredToken", new RegExp(String.raw`(?<![\w-])${VARIANTS}(?:${COLOUR_UTILITIES})-(?:danger|fp-warning)(?:/\d+)?${END}`, "g")],
  [
    "limeText",
    new RegExp(
      String.raw`(?<![\w-])${VARIANTS}text-(?:fp-lime|primary|accent|sidebar-primary)(?:/\d+)?${END}|color:\s*["'\x60]?var\(--(?:fp-lime|primary|accent)\)`,
      "g",
    ),
  ],
  [
    "blur",
    /\bbackdrop-(?:blur|filter)\b[\w-]*|(?<![\w-])(?:[\w-]+:)*blur-(?:xs|sm|md|lg|xl|2xl|3xl|\[[^\]]+\])(?=$|[\s"'`])|backdropFilter|filter:\s*["'`]?blur\(/g,
  ],
  ["hoverMotion", new RegExp(String.raw`(?<![\w-])(?:[\w-]+:)*(?:group-|peer-)?hover(?:/\w+)?:(?:[\w-]+:)*-?(?:scale|translate)(?:-[xy])?-[\w\[\].%/-]+`, "g")],
  [
    "colour",
    new RegExp(
      [
        String.raw`(?<![\w-])${VARIANTS}(?:${COLOUR_UTILITIES})-(?:(?:${PALETTE})-\d{2,3}|white|black)(?:/\d+)?${END}`,
        String.raw`(?<![A-Za-z-])(?:rgba?|hsla?|oklch|oklab)\(\s*[\d.]`,
      ].join("|"),
      "g",
    ),
  ],
];

const CSS_RULES: [GuardRule, RegExp][] = [
  ["glow", /--glow-[\w-]+|\.glow-[\w-]+/g],
  ["legacyLime", /--(?:color-)?fp-(?:cta|accent)\b(?:-foreground)?/g],
  ["retiredToken", /--color-(?:danger|fp-warning)\b/g],
  ["limeText", /(?<![\w-])color:\s*var\(--(?:fp-lime|primary|accent)\)/g],
  ["blur", /backdrop-filter|filter:\s*blur\(/g],
  ["colour", /#[0-9a-fA-F]{3,8}\b|(?<![A-Za-z-])(?:rgba?|hsla?|oklch|oklab)\(\s*[\d.]/g],
];

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const SVG_PAINT = /\b(?:fill|stroke|stopColor|stop-color|floodColor|lightingColor|color)=\{?\s*["'`]$/;

/** Blanks comments but keeps line breaks, so line numbers stay right. */
export function stripComments(source: string, css = false): string {
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  let out = source.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (!css) {
    // Line comments, but not `://` inside URLs.
    out = out.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (all, lead: string) => lead + blank(all.slice(lead.length)));
  }
  return out;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Scans one TS/TSX source. */
export function scanSource(source: string): GuardFinding[] {
  const text = stripComments(source);
  const findings: Located[] = [];
  for (const [rule, pattern] of TS_RULES) {
    for (const m of text.matchAll(pattern)) {
      findings.push({ rule, line: lineOf(text, m.index), match: m[0].trim(), at: m.index });
    }
  }
  for (const m of text.matchAll(HEX)) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    findings.push({ rule: SVG_PAINT.test(before) ? "svgColour" : "colour", line: lineOf(text, m.index), match: m[0], at: m.index });
  }
  return ordered(findings);
}

/**
 * Scans one stylesheet. `hoverMotion` here is a `:hover` rule that sets a
 * transform. Token files (globals.css) are scanned without the colour rule,
 * because that is where the literals are meant to live.
 */
export function scanCss(source: string, { tokenFile = false } = {}): GuardFinding[] {
  const text = stripComments(source, true);
  const findings: Located[] = [];
  for (const [rule, pattern] of CSS_RULES) {
    if (tokenFile && rule === "colour") continue;
    for (const m of text.matchAll(pattern)) {
      findings.push({ rule, line: lineOf(text, m.index), match: m[0].trim(), at: m.index });
    }
  }
  for (const m of text.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)) {
    if (/(?:^|[\s;])(?:transform|translate|scale)\s*:/.test(m[2])) {
      const at = m.index + m[0].indexOf(":hover");
      findings.push({ rule: "hoverMotion", line: lineOf(text, at), match: m[1].trim(), at });
    }
  }
  return ordered(findings);
}
