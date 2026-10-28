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
 *   - gradient:    CSS gradients and Tailwind gradient utilities (§2.5)
 *   - depth3d:     CSS 3D (`perspective`, `rotate3d`, `preserve-3d`, …)
 *   - websiteToken: the website's `fp-web-*` tokens (MARKETING.md §3) outside
 *                  the website and globals.css
 *   - colour:      hard-coded colours where tokens apply: hex and numeric
 *                  rgb()/hsl()/oklch() literals, Tailwind palette classes
 *                  (`bg-red-500`, `text-white`, …) and `bg-black/50`-style scrims
 *
 * Profiles (WEB-01b, DESIGN.md §11): the public website (`WEBSITE_SCOPE`) may
 * use glow, static blur, hover motion, gradients and CSS-3D. It is checked
 * for what MARKETING.md §6 forbids there instead:
 *   - animatedFilter: `filter`/`backdrop-filter` in keyframes, transitions or
 *                  Framer Motion animation props (static blur is fine)
 *   - layoutMotion: animated layout properties (width, top, margin, …) and
 *                  Framer Motion's `layout`/`layoutId`
 *   - reducedMotion: scroll-linked motion (CSS `animation-timeline`, Framer's
 *                  `useScroll`) in a file that never checks reduced motion.
 *                  Time-based motion is already off globally (globals.css,
 *                  MotionConfig in ThemeProvider).
 * These are heuristics: Framer props are read up to the first `}`, and one
 * reduced-motion check anywhere in a file counts for the whole file.
 * Everything else, including the public match page, is the app profile.
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
  | "gradient"
  | "depth3d"
  | "websiteToken"
  | "animatedFilter"
  | "layoutMotion"
  | "reducedMotion"
  | "colour"
  | "svgColour";

export type GuardProfile = "app" | "website";

/** The website's source (WEB-01b). Locked by a test: widen it only with DESIGN.md §11. */
export const WEBSITE_SCOPE = ["src/app/[locale]/(marketing)/", "src/components/marketing/"] as const;

/** The profile a repo-relative path (forward slashes) is checked with. */
export function guardProfile(file: string): GuardProfile {
  return WEBSITE_SCOPE.some((scope) => file.startsWith(scope)) ? "website" : "app";
}

const WEBSITE_ALLOWS = new Set<GuardRule>(["glow", "blur", "hoverMotion", "gradient", "depth3d", "websiteToken"]);
const WEBSITE_ONLY = new Set<GuardRule>(["animatedFilter", "layoutMotion", "reducedMotion"]);

function applies(rule: GuardRule, profile: GuardProfile): boolean {
  return profile === "website" ? !WEBSITE_ALLOWS.has(rule) : !WEBSITE_ONLY.has(rule);
}

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
const CLASS_TAIL = String.raw`[^\s"'\x60}]*`;

const GRADIENT_FUNCTION = String.raw`(?<![\w-])(?:repeating-)?(?:linear|radial|conic)-gradient\(`;
const DEPTH_FUNCTION = String.raw`\b(?:perspective|rotate3d|rotate[XY]|translateZ|translate3d)\(|\bpreserve-3d\b`;
// A whole property name: `margin-left` counts, `stop-color` or `border-bottom-color` does not.
const LAYOUT_PROPS = "width|height|min-width|min-height|max-width|max-height|top|right|bottom|left|(?:inset|margin|padding)(?:-[a-z-]+)?|gap|row-gap|column-gap";
const LAYOUT_PROP = String.raw`(?<![\w-])(?:${LAYOUT_PROPS})(?![\w-])`;

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
    "gradient",
    new RegExp(`${GRADIENT_FUNCTION}|(?<![\\w-])${VARIANTS}bg-(?:linear|radial|conic|gradient)(?:-${CLASS_TAIL})?${END}`, "g"),
  ],
  [
    "depth3d",
    new RegExp(
      `${DEPTH_FUNCTION}|\\b(?:perspective|rotate[XY]|transformPerspective)\\s*:|(?<![\\w-])${VARIANTS}-?(?:perspective-${CLASS_TAIL}|rotate-[xy]-${CLASS_TAIL}|translate-z-${CLASS_TAIL}|transform-3d|backface-hidden)${END}`,
      "g",
    ),
  ],
  ["websiteToken", /(?:--(?:color-)?)?\bfp-web-[\w-]+/g],
  [
    "animatedFilter",
    new RegExp(
      [
        String.raw`(?<![\w-])${VARIANTS}transition-\[[^\]\s]*filter[^\]\s]*\]`,
        String.raw`transition(?:Property)?:\s*["'\x60][^"'\x60]*filter`,
        String.raw`\b(?:animate|initial|exit|whileHover|whileTap|whileFocus|whileInView|whileDrag)=\{\{[^}]*\b(?:filter|backdropFilter|WebkitBackdropFilter)\s*:`,
      ].join("|"),
      "g",
    ),
  ],
  [
    "layoutMotion",
    new RegExp(
      [
        String.raw`(?<![\w-])${VARIANTS}transition-\[[^\]\s]*?(?<![\w-])(?:${LAYOUT_PROPS})(?![\w-])[^\]\s]*\]`,
        String.raw`(?<![\w-])${VARIANTS}transition-(?:all|spacing|size|width|height)${END}`,
        String.raw`<motion\.\w+\b[^>]*?\slayout(?:Id)?(?=[\s=/>])`,
        String.raw`\b(?:animate|initial|exit|whileHover|whileTap|whileFocus|whileInView|whileDrag)=\{\{[^}]*\b(?:width|height|top|left|right|bottom|margin\w*|padding\w*)\s*:`,
      ].join("|"),
      "g",
    ),
  ],
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
  ["gradient", new RegExp(GRADIENT_FUNCTION, "g")],
  ["depth3d", new RegExp(`${DEPTH_FUNCTION}|(?<![\\w-])perspective(?:-origin)?\\s*:|transform-style\\s*:`, "g")],
  ["websiteToken", /--(?:color-)?fp-web-[\w-]+/g],
  ["animatedFilter", /transition(?:-property)?\s*:[^;{}]*\bfilter\b/g],
  ["layoutMotion", new RegExp(String.raw`transition(?:-property)?\s*:[^;{}]*${LAYOUT_PROP}`, "g")],
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

const REDUCED_MOTION_CHECK = /prefers-reduced-motion|useReducedMotion\(|reducedMotion=|motion-safe:|motion-reduce:/;

/** Scroll-linked motion in a file that never looks at reduced motion. */
function unguardedScrollMotion(text: string, pattern: RegExp): Located[] {
  if (REDUCED_MOTION_CHECK.test(text)) return [];
  return [...text.matchAll(pattern)].map((m) => ({ rule: "reducedMotion" as const, line: lineOf(text, m.index), match: m[0].trim(), at: m.index }));
}

/** Scans one TS/TSX source. */
export function scanSource(source: string, { profile = "app" }: { profile?: GuardProfile } = {}): GuardFinding[] {
  const text = stripComments(source);
  const findings: Located[] = [];
  for (const [rule, pattern] of TS_RULES) {
    if (!applies(rule, profile)) continue;
    for (const m of text.matchAll(pattern)) {
      findings.push({ rule, line: lineOf(text, m.index), match: m[0].trim(), at: m.index });
    }
  }
  if (applies("reducedMotion", profile)) findings.push(...unguardedScrollMotion(text, /\buseScroll\(/g));
  for (const m of text.matchAll(HEX)) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    findings.push({ rule: SVG_PAINT.test(before) ? "svgColour" : "colour", line: lineOf(text, m.index), match: m[0], at: m.index });
  }
  return ordered(findings);
}

/** `@keyframes` bodies (nested braces), with the offset where each body starts. */
function keyframeBlocks(text: string): { body: string; at: number }[] {
  const blocks: { body: string; at: number }[] = [];
  for (const m of text.matchAll(/@keyframes\s+[\w-]+\s*\{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
    }
    blocks.push({ body: text.slice(m.index + m[0].length, i - 1), at: m.index + m[0].length });
  }
  return blocks;
}

/** Offsets covered by `--fp-web-*` declarations in the token file. */
function websiteTokenDeclarations(text: string): [number, number][] {
  return [...text.matchAll(/--(?:color-)?fp-web-[\w-]+\s*:[^;{}]*/g)].map((m) => [m.index, m.index + m[0].length]);
}

/**
 * Scans one stylesheet. `hoverMotion` here is a `:hover` rule that sets a
 * transform. Token files (globals.css) are scanned without the colour rule,
 * because that is where the literals are meant to live; there the website's
 * `--fp-web-*` tokens may also be defined, gradients included.
 */
export function scanCss(source: string, { tokenFile = false, profile = "app" }: { tokenFile?: boolean; profile?: GuardProfile } = {}): GuardFinding[] {
  const text = stripComments(source, true);
  const findings: Located[] = [];
  const webTokens = tokenFile ? websiteTokenDeclarations(text) : [];
  const inWebToken = (at: number) => webTokens.some(([start, end]) => at >= start && at < end);
  for (const [rule, pattern] of CSS_RULES) {
    if (!applies(rule, profile)) continue;
    if (tokenFile && (rule === "colour" || rule === "websiteToken")) continue;
    for (const m of text.matchAll(pattern)) {
      if ((rule === "gradient" || rule === "depth3d") && inWebToken(m.index)) continue;
      findings.push({ rule, line: lineOf(text, m.index), match: m[0].trim(), at: m.index });
    }
  }
  if (applies("hoverMotion", profile)) {
    for (const m of text.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)) {
      if (/(?:^|[\s;])(?:transform|translate|scale)\s*:/.test(m[2])) {
        const at = m.index + m[0].indexOf(":hover");
        findings.push({ rule: "hoverMotion", line: lineOf(text, at), match: m[1].trim(), at });
      }
    }
  }
  if (profile === "website") {
    for (const { body, at } of keyframeBlocks(text)) {
      const animated = (rule: GuardRule, pattern: RegExp) => {
        for (const m of body.matchAll(pattern)) {
          const offset = at + m.index;
          findings.push({ rule, line: lineOf(text, offset), match: m[0].trim(), at: offset });
        }
      };
      animated("animatedFilter", /(?<![\w-])(?:-webkit-)?(?:backdrop-)?filter\s*:/g);
      animated("layoutMotion", new RegExp(String.raw`${LAYOUT_PROP}\s*:`, "g"));
    }
    // `transition: all` in a rule that sets a filter animates the filter.
    for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
      if (/transition(?:-property)?\s*:\s*all\b/.test(m[1]) && /(?<![\w-])(?:-webkit-)?(?:backdrop-)?filter\s*:/.test(m[1])) {
        const at = m.index + m[0].indexOf("transition");
        findings.push({ rule: "animatedFilter", line: lineOf(text, at), match: "transition: all", at });
      }
    }
    findings.push(...unguardedScrollMotion(text, /(?:animation|view|scroll)-timeline\s*:/g));
  }
  return ordered(findings);
}
