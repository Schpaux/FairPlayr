import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WEBSITE_SCOPE, guardProfile, scanCss, scanSource, type GuardFinding, type GuardRule } from "./designGuard";

// UI-TOKENS-01 (B3): design guard. See designGuard.ts for the rules.
//
// Exceptions are explicit: one file, one rule, the exact text, how many times
// it occurs, and why. Any other count fails (a second occurrence is a new
// finding; none means the exception is stale). There is deliberately no
// directory- or rule-wide opt-out. The website is not an opt-out either: it
// is one documented profile with its own rules (WEB-01b, DESIGN.md §10).

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
  // Gradients predate the gradient rule (WEB-01b). They are pitch graphics or
  // a functional fade, built from tokens; the files are not edited here.
  ...["src/components/match/LivePitchView.tsx", "src/components/match/LivePitchLineupEditor.tsx", "src/components/lineup/LineupField.tsx"].flatMap(
    (file) => [
      {
        file,
        rule: "gradient" as const,
        match: "linear-gradient(",
        count: 1,
        reason: "The pitch's grass fill (fp-pitch-a → fp-pitch-b): a pitch graphic, not decoration.",
      },
      {
        file,
        rule: "gradient" as const,
        match: "repeating-linear-gradient(",
        count: 1,
        reason: "The pitch's mowing stripes (fp-pitch-stripe-a/b): a pitch graphic, not decoration.",
      },
    ],
  ),
  {
    file: "src/components/live/LiveScreen.module.css",
    rule: "gradient",
    match: "linear-gradient(",
    count: 2,
    reason: "The bench rail's edge fades (transparent → canvas): the functional exception in DESIGN.md §2.5.",
  },
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
    const profile = guardProfile(file);
    const findings = file.endsWith(".css") ? scanCss(text, { tokenFile: file === TOKEN_FILE, profile }) : scanSource(text, { profile });
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

  it("finds gradients, CSS-3D and website tokens in the app", () => {
    expect(
      rules(`style={{ background: "radial-gradient(circle, var(--fp-grass), transparent)" }} "bg-linear-to-r md:bg-radial-[at_50%_0%] bg-conic-180 bg-gradient-to-b"`),
    ).toEqual(["gradient:radial-gradient(", "gradient:bg-linear-to-r", "gradient:md:bg-radial-[at_50%_0%]", "gradient:bg-conic-180", "gradient:bg-gradient-to-b"]);
    expect(rules(`"repeating-conic-gradient(var(--a) 0 25%)"`)).toEqual(["gradient:repeating-conic-gradient("]);
    expect(rules(`style={{ transform: "perspective(800px) rotateX(12deg)", transformStyle: "preserve-3d" }} "perspective-distant rotate-x-12 transform-3d"`)).toEqual([
      "depth3d:perspective(",
      "depth3d:rotateX(",
      "depth3d:preserve-3d",
      "depth3d:perspective-distant",
      "depth3d:rotate-x-12",
      "depth3d:transform-3d",
    ]);
    expect(rules(`"bg-fp-web-floodlight" style={{ color: "var(--fp-web-glow)" }}`)).toEqual(["websiteToken:fp-web-floodlight", "websiteToken:--fp-web-glow"]);
    // Ordinary words, rotations and backgrounds are not gradients or 3D.
    expect(rules(`"bg-fp-grass rotate-45 bg-fp-linear-x" const perspectiveNote = 1; t("gradient")`)).toEqual([]);
  });

  it("checks gradients, 3D and website tokens in stylesheets", () => {
    const css = `.a { background: linear-gradient(var(--fp-grass), var(--fp-club)); }\n.b { perspective: 900px; transform: rotate3d(1, 0, 0, 10deg); }\n.c { color: var(--fp-web-ink); }`;
    expect(scanCss(css).map((f) => `${f.rule}@${f.line}`)).toEqual(["gradient@1", "depth3d@2", "depth3d@2", "websiteToken@3"]);
    // The token file may define the website's tokens, gradients included, but nothing else gets a gradient.
    const tokens = `:root { --fp-web-floodlight: radial-gradient(var(--fp-lime), transparent); }\n.x { background: linear-gradient(red, blue); }`;
    expect(scanCss(tokens, { tokenFile: true }).map((f) => `${f.rule}@${f.line}`)).toEqual(["gradient@2"]);
  });
});

describe("design guard profiles (WEB-01b)", () => {
  it("applies the website profile to the website's two directories only", () => {
    expect(WEBSITE_SCOPE).toEqual(["src/app/[locale]/(marketing)/", "src/components/marketing/"]);
    expect(guardProfile("src/app/[locale]/(marketing)/page.tsx")).toBe("website");
    expect(guardProfile("src/components/marketing/Hero.tsx")).toBe("website");
    for (const file of [
      "src/app/[locale]/(public)/s/[token]/page.tsx",
      "src/app/[locale]/(app)/play/page.tsx",
      "src/app/[locale]/layout.tsx",
      "src/app/globals.css",
      "src/components/live/LiveScreen.module.css",
      "src/components/share/PublicMatchView.tsx",
      "src/components/match/MatchLiveManager.tsx",
      "src/components/marketingx/Hero.tsx",
    ]) {
      expect(guardProfile(file), file).toBe("app");
    }
  });

  const both = (source: string) => ({
    app: scanSource(source, { profile: "app" }).map((f) => f.rule),
    website: scanSource(source, { profile: "website" }).map((f) => f.rule),
  });

  it("lets the website use gradients, static blur, glow, 3D and hover motion", () => {
    const source = `"bg-linear-to-b backdrop-blur-md hover:scale-105 perspective-distant rotate-x-6 bg-fp-web-floodlight glow-primary"`;
    expect(both(source)).toEqual({
      app: ["gradient", "blur", "hoverMotion", "depth3d", "depth3d", "websiteToken", "glow"],
      website: [],
    });
    const css = `.hero { background: radial-gradient(var(--fp-web-a), transparent); backdrop-filter: blur(12px); perspective: 900px; }\n.card:hover { transform: translateY(-2px) rotateY(4deg); }`;
    expect(scanCss(css, { profile: "website" })).toEqual([]);
  });

  it("keeps the shared rules on the website: colours, lime text, retired tokens", () => {
    expect(both(`"text-white text-fp-lime fp-cta bg-[#fff] text-danger"`).website).toEqual(["colour", "limeText", "legacyLime", "colour", "retiredToken"]);
    expect(scanCss(`.a { color: #fff; }`, { profile: "website" }).map((f) => f.rule)).toEqual(["colour"]);
  });

  it("finds animated filters on the website, not static ones", () => {
    expect(both(`"transition-[transform,filter]" style={{ transition: "filter 300ms" }} <motion.div animate={{ filter: "blur(0px)" }} />`).website).toEqual([
      "animatedFilter",
      "animatedFilter",
      "animatedFilter",
    ]);
    expect(both(`<motion.div style={{ filter: "blur(8px)" }} animate={{ opacity: 1 }} className="transition-transform blur-md" />`).website).toEqual([]);
    const css = `@keyframes glow { from { filter: blur(0); } to { filter: blur(6px); } }\n.a { transition: opacity 200ms, backdrop-filter 200ms; }\n.b { filter: blur(4px); transition: all 200ms; }\n.c { filter: blur(4px); transition: transform 200ms; }`;
    expect(scanCss(css, { profile: "website" }).map((f) => `${f.rule}@${f.line}`)).toEqual([
      "animatedFilter@1",
      "animatedFilter@1",
      "animatedFilter@2",
      "animatedFilter@3",
    ]);
  });

  it("finds layout animation on the website", () => {
    expect(
      both(`"transition-[height] transition-all" <motion.div layout /> <motion.li layoutId="x" /> <motion.div animate={{ width: 200 }} />`).website,
    ).toEqual(["layoutMotion", "layoutMotion", "layoutMotion", "layoutMotion", "layoutMotion"]);
    expect(both(`"transition-transform transition-opacity" <motion.div animate={{ y: 0, scale: 1 }} /> <Layout />`).website).toEqual([]);
    const css = `@keyframes grow { to { height: 200px; transform: scale(1); } }\n.a { transition: width 200ms; }\n.b { transition: transform 200ms, opacity 200ms; }`;
    expect(scanCss(css, { profile: "website" }).map((f) => `${f.rule}@${f.line}`)).toEqual(["layoutMotion@1", "layoutMotion@2"]);
    // Longhands count; colour properties that contain a layout word do not.
    expect(both(`"transition-[margin-left] transition-[padding-top,opacity]"`).website).toEqual(["layoutMotion", "layoutMotion"]);
    expect(both(`"transition-[stop-color] transition-[border-bottom-color,transform]"`).website).toEqual([]);
    const longhands = `@keyframes slide { to { margin-left: 0; } }\n.a { transition: padding-top 200ms; }\n.b { transition: border-bottom-color 200ms; }`;
    expect(scanCss(longhands, { profile: "website" }).map((f) => `${f.rule}@${f.line}`)).toEqual(["layoutMotion@1", "layoutMotion@2"]);
  });

  it("requires a reduced-motion check next to scroll-linked motion on the website", () => {
    expect(both(`const { scrollYProgress } = useScroll();`).website).toEqual(["reducedMotion"]);
    expect(both(`const reduce = useReducedMotion(); const { scrollYProgress } = useScroll();`).website).toEqual([]);
    expect(scanCss(`.a { animation: rise linear; animation-timeline: view(); }`, { profile: "website" }).map((f) => f.rule)).toEqual(["reducedMotion"]);
    expect(
      scanCss(`@media (prefers-reduced-motion: no-preference) { .a { animation: rise linear; animation-timeline: view(); } }`, { profile: "website" }),
    ).toEqual([]);
  });

  it("does not apply the website-only rules to the app", () => {
    expect(both(`"transition-[transform,filter] transition-all" <motion.div layout /> useScroll()`).app).toEqual([]);
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
