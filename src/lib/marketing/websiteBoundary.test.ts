import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The website shares its origin, service worker and storage with the coach's
// app (MARKETING.md §7). This test fails if a website file, or anything it
// imports (transitively, local files only), reaches into the app: its
// storage, Supabase, the service worker, the app's providers or the live
// match controller; reads or writes browser storage; talks to the service
// worker; or changes the coach's theme. Website media is served from
// `public/marketing/` by path: a static import would put the file in
// `.next/static/media`, and the worker precaches that folder into every
// installed app.
//
// The import walk is the one in src/lib/pwa/shellRouteSafety.test.ts.

const SRC = path.resolve(__dirname, "../..");
const WEBSITE_DIRS = ["app/[locale]/(marketing)", "components/marketing"].map((dir) => path.join(SRC, dir));
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

const FORBIDDEN_PREFIXES = ["@/lib/storage/", "@/lib/supabase/", "@/components/pwa/", "@/components/providers/", "@/sw/"];
const FORBIDDEN_DIRS = ["lib/storage", "lib/supabase", "components/pwa", "components/providers", "sw"].map((dir) => path.join(SRC, dir) + path.sep);
const FORBIDDEN_NAMES = /(?:^|\/)(?:MatchLiveManager|useLiveSubstitution)(?:\.tsx?)?$/;
const STATIC_MEDIA = /\.(?:png|jpe?g|webp|avif|gif|mp4|webm|mov)$/i;
const FORBIDDEN_CODE: [RegExp, string][] = [
  [/\b(?:localStorage|sessionStorage|indexedDB)\b/, "uses browser storage"],
  [/\bnavigator\s*\.\s*serviceWorker\b|\bserviceWorker\s*\.\s*(?:register|getRegistration)/, "talks to the service worker"],
  [/\bsetTheme\b/, "changes the coach's theme"],
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Value imports only: `import type` / `export type` are erased at build time. */
function importSpecifiers(source: string): string[] {
  const patterns = [
    /(?:^|[\n;])\s*import\s+(?!type\s)(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /(?:^|[\n;])\s*export\s+(?!type\s)[\s\S]*?\s+from\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));
}

function resolveLocal(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => path.join(base, `index${ext}`))];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function websiteFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return websiteFiles(full);
    return /\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Problems in one source, without following imports. */
function sourceProblems(source: string): string[] {
  const text = stripComments(source);
  const problems = FORBIDDEN_CODE.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason);
  for (const specifier of importSpecifiers(text)) {
    if (FORBIDDEN_PREFIXES.some((prefix) => specifier.startsWith(prefix)) || FORBIDDEN_NAMES.test(specifier)) problems.push(`imports ${specifier}`);
    else if (STATIC_MEDIA.test(specifier)) problems.push(`imports media ${specifier} (use a /marketing/... path)`);
  }
  return problems;
}

function scan(entries: string[]): { problems: string[]; visited: number } {
  const problems: string[] = [];
  const seen = new Set<string>();
  const queue = entries.map((file) => ({ file, via: [] as string[] }));
  while (queue.length > 0) {
    const { file, via } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const rel = path.relative(SRC, file);
    const where = `${rel}${via.length ? `  [via ${via.join(" → ")}]` : ""}`;
    const source = readFileSync(file, "utf8");
    problems.push(...sourceProblems(source).map((problem) => `${where} ${problem}`));
    for (const specifier of importSpecifiers(stripComments(source))) {
      const resolved = resolveLocal(specifier, file);
      if (!resolved || !/\.(tsx?|jsx?)$/.test(resolved)) continue;
      if (FORBIDDEN_DIRS.some((dir) => resolved.startsWith(dir)) || FORBIDDEN_NAMES.test(resolved.replace(/\.[jt]sx?$/, ""))) {
        problems.push(`${where} imports ${specifier} (${path.relative(SRC, resolved)})`);
        continue;
      }
      queue.push({ file: resolved, via: [...via, rel] });
    }
  }
  return { problems, visited: seen.size };
}

describe("website boundary (WEB-01 phase 0, MARKETING.md §7)", () => {
  it("the website does not reach into the app's storage, session, worker or theme", () => {
    const entries = WEBSITE_DIRS.flatMap(websiteFiles);
    expect(entries.map((file) => path.relative(SRC, file))).toEqual(expect.arrayContaining(["app/[locale]/(marketing)/page.tsx"]));
    const { problems, visited } = scan(entries);
    expect(visited).toBeGreaterThan(entries.length);
    expect(problems).toEqual([]);
  });

  it("app code does not import website components (they are checked with the website's design rules)", () => {
    const appFiles = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (WEBSITE_DIRS.includes(full)) return [];
        if (entry.isDirectory()) return appFiles(full);
        return /\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
      });
    const offenders = appFiles(SRC).filter((file) =>
      importSpecifiers(stripComments(readFileSync(file, "utf8"))).some(
        (specifier) => specifier.startsWith("@/components/marketing") || resolveLocal(specifier, file)?.startsWith(WEBSITE_DIRS[1] + path.sep),
      ),
    );
    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it("the scanner catches what it should", () => {
    expect(sourceProblems(`import { readLiveMatch } from "@/lib/storage/liveMatchStorage";`)).toEqual(["imports @/lib/storage/liveMatchStorage"]);
    expect(sourceProblems(`import { createClient } from "@/lib/supabase/client";`)).toEqual(["imports @/lib/supabase/client"]);
    expect(sourceProblems(`import { PwaRoot } from "@/components/pwa/PwaRoot";`)).toEqual(["imports @/components/pwa/PwaRoot"]);
    expect(sourceProblems(`import { AuthProvider } from "@/components/providers/AuthProvider";`)).toEqual(["imports @/components/providers/AuthProvider"]);
    expect(sourceProblems(`import X from "@/components/match/MatchLiveManager";`)).toEqual(["imports @/components/match/MatchLiveManager"]);
    expect(sourceProblems(`import hero from "./hero.webp";`)).toEqual(["imports media ./hero.webp (use a /marketing/... path)"]);
    expect(sourceProblems(`window.localStorage.getItem("fairplayr.x");`)).toEqual(["uses browser storage"]);
    expect(sourceProblems(`navigator.serviceWorker.register("/sw.js");`)).toEqual(["talks to the service worker"]);
    expect(sourceProblems(`const { setTheme } = useTheme();`)).toEqual(["changes the coach's theme"]);
    // Allowed: type-only imports, media by path, reading the theme, comments.
    expect(
      sourceProblems(`import type { X } from "@/lib/storage/x";\n<Image src="/marketing/hero.webp" />\nconst { resolvedTheme } = useTheme();\n// localStorage`),
    ).toEqual([]);
  });
});
