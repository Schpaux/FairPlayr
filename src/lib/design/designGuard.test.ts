import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanCss, scanSource, type GuardFinding, type GuardRule } from "./designGuard";

// UI-TOKENS-01 (B3): design guard. See designGuard.ts for the rules.
//
// Exceptions are explicit: one file, one rule, the exact text, how many times
// it occurs, and why. Any other count fails (a second occurrence is a new
// finding; none means the exception is stale). There is deliberately no
// directory- or rule-wide opt-out.

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "src");
// Hard-coded colours are checked where components and pages live. src/lib
// holds non-CSS consumers that need literal values (PWA manifest colours,
// brandColors.ts) and the legacy tokens.ts (C6).
const COLOUR_SCOPE = ["src/app/", "src/components/", "src/domain/", "src/hooks/"];
const TOKEN_FILE = "src/app/globals.css";
// The scanner's own source spells out the patterns it looks for.
const SELF = "src/lib/design/designGuard.ts";

interface GuardException {
  file: string;
  rule: GuardRule;
  match: string;
  count: number;
  reason: string;
}

const EXCEPTIONS: GuardException[] = [
  ...["#4285F4", "#34A853", "#FBBC05", "#EA4335"].map((match) => ({
    file: "src/app/[locale]/(app)/auth/sign-in/page.tsx",
    rule: "svgColour" as const,
    match,
    count: 1,
    reason: "Google's 'G' mark on the sign-in button must keep Google's brand colours.",
  })),
  {
    file: "src/app/[locale]/(app)/auth/sign-in/page.tsx",
    rule: "colour",
    match: "bg-white",
    count: 1,
    reason: "The Google 'G' mark sits on a white disc (Google sign-in branding), in both themes.",
  },
  // The lime "time up" digits on live were removed in C6 (UI-LIVE-04/05): the
  // scoreboard is on canvas and stoppage is written as "30+2:13".
];


function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(tsx?|css)$/.test(entry.name) ? [full] : [];
  });
}

function isTestFile(rel: string): boolean {
  return /\.test\.tsx?$/.test(rel) || /\/testUtils\.tsx?$/.test(rel) || rel.includes("/__tests__/");
}

function scanRepo(): (GuardFinding & { file: string })[] {
  const results: (GuardFinding & { file: string })[] = [];
  for (const full of walk(SRC)) {
    const file = path.relative(ROOT, full).split(path.sep).join("/");
    if (isTestFile(file) || file === SELF) continue;
    const text = fs.readFileSync(full, "utf8");
    const findings = file.endsWith(".css") ? scanCss(text, { tokenFile: file === TOKEN_FILE }) : scanSource(text);
    const colourChecked = COLOUR_SCOPE.some((scope) => file.startsWith(scope));
    for (const finding of findings) {
      if (!colourChecked && (finding.rule === "colour" || finding.rule === "svgColour")) continue;
      results.push({ ...finding, file });
    }
  }
  return results;
}

describe("design guard scanner", () => {
  const rules = (source: string) => scanSource(source).map((f) => `${f.rule}:${f.match}`);

  it("finds lime text but not lime fills or on-lime text", () => {
    expect(rules(`<p className="text-primary">`)).toEqual(["limeText:text-primary"]);
    expect(rules(`<p className="dark:text-fp-lime/80 x">`)).toEqual(["limeText:dark:text-fp-lime/80"]);
    expect(rules(`<p style={{ color: "var(--fp-lime)" }}>`)).toEqual(["limeText:color: \"var(--fp-lime)"]);
    expect(rules(`<p className="bg-primary text-primary-foreground text-fp-on-lime bg-fp-lime text-fp-text-primary">`)).toEqual([]);
  });

  it("finds legacy lime tokens and glow", () => {
    expect(rules(`"bg-fp-cta text-fp-cta-foreground glow-cta-sm shadow-[var(--glow-cta-sm)]"`)).toEqual([
      "legacyLime:fp-cta",
      "legacyLime:fp-cta-foreground",
      "glow:glow-cta",
      "glow:--glow-cta-sm",
    ]);
  });

  it("finds retired status tokens, not their replacements", () => {
    expect(rules(`"text-danger bg-danger/10 dark:border-danger/30 text-fp-warning"`)).toEqual([
      "retiredToken:text-danger",
      "retiredToken:bg-danger/10",
      "retiredToken:dark:border-danger/30",
      "retiredToken:text-fp-warning",
    ]);
    expect(rules(`"text-fp-danger-text bg-fp-danger text-fp-on-danger text-fp-warn-text bg-destructive"`)).toEqual([]);
  });

  it("finds blur and hover motion, not pressed scale or hover fills", () => {
    expect(rules(`"backdrop-blur-md blur-sm hover:scale-[1.03] md:hover:-translate-y-0.5 group-hover:scale-105"`)).toEqual([
      "blur:backdrop-blur-md",
      "blur:blur-sm",
      "hoverMotion:hover:scale-[1.03]",
      "hoverMotion:md:hover:-translate-y-0.5",
      "hoverMotion:group-hover:scale-105",
    ]);
    expect(rules(`"active:scale-[.97] hover:bg-fp-surface-2" el.blur(); onBlur={x}`)).toEqual([]);
  });

  it("finds hard-coded colours, not tokens or runtime values", () => {
    expect(rules(`"bg-red-500 dark:text-emerald-300 bg-black/50 text-white border-[#fff]" rgba(0, 0, 0, 0.5)`)).toEqual([
      "colour:bg-red-500",
      "colour:dark:text-emerald-300",
      "colour:bg-black/50",
      "colour:text-white",
      "colour:#fff",
      "colour:rgba(0",
    ]);
    expect(rules(`"shadow-[0_0_0_1px_rgba(14,15,12,0.12)]"`)).toEqual(["colour:rgba(1"]);
    expect(rules("`rgb(${r} ${g} ${b})` \"bg-fp-danger text-fp-on-danger var(--fp-ink) text-white-space\"")).toEqual([]);
  });

  it("tells SVG paint apart from other hex, and ignores comments", () => {
    expect(rules(`"border-[#0f08] bg-[#abcdef12]"`)).toEqual(["colour:#0f08", "colour:#abcdef12"]);
    expect(rules(`<path fill="#4285F4" /> <rect stroke={"#163300"} /> <div style={{ color: "#163300" }} />`)).toEqual([
      "svgColour:#4285F4",
      "svgColour:#163300",
      "colour:#163300",
    ]);
    expect(rules(`// text-primary bg-red-500 https://example.com/#fff\n/* glow-cta */ const url = "https://x.no";`)).toEqual([]);
  });

  it("checks stylesheets, with literals allowed only in the token file", () => {
    const css = `.a { color: var(--fp-lime); backdrop-filter: blur(4px); }\n.b:hover { transform: scale(1.02); }\n.c { color: #fff; }`;
    expect(scanCss(css).map((f) => `${f.rule}@${f.line}`)).toEqual(["limeText@1", "blur@1", "hoverMotion@2", "colour@3"]);
    expect(scanCss(`:root { --fp-ink: #111A15; }`, { tokenFile: true })).toEqual([]);
    expect(scanCss(`.b:hover { background: var(--fp-surface-2); }`)).toEqual([]);
  });
});

describe("design guard (UI-TOKENS-01)", () => {
  const findings = scanRepo();
  const matches = (e: GuardException) => findings.filter((f) => f.file === e.file && f.rule === e.rule && f.match === e.match);
  const isException = (f: GuardFinding & { file: string }) =>
    EXCEPTIONS.some((e) => e.file === f.file && e.rule === f.rule && e.match === f.match && matches(e).length === e.count);

  it("src has no forbidden design patterns", () => {
    const problems = findings
      .filter((f) => !isException(f))
      .map((f) => `${f.file}:${f.line} ${f.rule} ${f.match}`);
    expect(problems, "DESIGN.md violations. Use a token (globals.css @theme); see src/lib/design/designGuard.ts.").toEqual([]);
  });

  it("every exception occurs exactly as often as recorded", () => {
    const off = EXCEPTIONS.filter((e) => matches(e).length !== e.count);
    expect(off.map((e) => `${e.file} ${e.rule} ${e.match}: expected ${e.count}, found ${matches(e).length}`)).toEqual([]);
  });
});
