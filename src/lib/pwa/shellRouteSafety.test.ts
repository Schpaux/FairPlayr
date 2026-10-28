import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Shell routes are precached by the service worker and served cache-first
// (FP-OFF-01 §S.5, B6), so their HTML must be identical for every user. This
// test fails if a shell page, a layout above it, or anything they import
// (transitively, local files only) reads per-request state on the server:
// `next/headers`, the server Supabase client, `@/lib/server/*`, or a call to
// cookies()/headers(). Personal data belongs in client islands that fetch
// after hydration (for example `src/components/home/HomeSeasonSummary.tsx`).
//
// next-intl's getMessages()/getTranslations() read the locale from the
// `X-NEXT-INTL-LOCALE` request header unless setRequestLocale() was called;
// the header comes from the URL (src/proxy.ts), never from cookies. The layout
// calls setRequestLocale(locale) so even that does not depend on the request,
// and the last test below keeps it that way.

const SRC = path.resolve(__dirname, "../..");
const APP = path.join(SRC, "app");

/** Shell pages, relative to src/app. */
const SHELL_PAGES = [
  // The app's Home at /play (WEB-01d).
  "[locale]/(app)/play/page.tsx",
  "[locale]/(app)/match/setup/page.tsx",
  "[locale]/(app)/match/live/page.tsx",
  "[locale]/(app)/team/page.tsx",
  // The service worker's offline fallback, precached with the shells.
  "[locale]/(app)/offline/page.tsx",
  // The website's front page at / (WEB-01d); its chain includes (marketing)/layout.tsx.
  "[locale]/(marketing)/page.tsx",
];

/** Route files that wrap a page and render on the server with it. */
const CHAIN_FILES = ["layout", "template", "loading", "error", "not-found"];
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

const FORBIDDEN_MODULES = ["next/headers", "@/lib/supabase/server"];
const FORBIDDEN_PREFIXES = ["@/lib/server/"];
const FORBIDDEN_FILES = [path.join(SRC, "lib", "supabase", "server.ts")];
const FORBIDDEN_DIRS = [path.join(SRC, "lib", "server") + path.sep];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Value imports only: `import type` / `export type` are erased at build time. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /(?:^|[\n;])\s*import\s+(?!type\s)(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /(?:^|[\n;])\s*export\s+(?!type\s)[\s\S]*?\s+from\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveLocal(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;

  const candidates = [
    base,
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

/** The page plus every layout/template/... from src/app down to its folder. */
function routeChain(page: string): string[] {
  const files = [path.join(APP, page)];
  let dir = path.dirname(path.join(APP, page));
  while (dir.startsWith(APP)) {
    for (const name of CHAIN_FILES) {
      for (const ext of EXTENSIONS) {
        const file = path.join(dir, name + ext);
        if (existsSync(file)) files.push(file);
      }
    }
    if (dir === APP) break;
    dir = path.dirname(dir);
  }
  return files;
}

interface Violation {
  file: string;
  reason: string;
  via: string[];
}

function scan(entries: string[]): { violations: Violation[]; visited: number } {
  const violations: Violation[] = [];
  const seen = new Set<string>();
  const queue: Array<{ file: string; via: string[] }> = entries.map((file) => ({ file, via: [] }));

  while (queue.length > 0) {
    const { file, via } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const rel = path.relative(SRC, file);
    const chain = [...via, rel];
    const source = stripComments(readFileSync(file, "utf8"));

    if (/(?<![.\w$])(?:cookies|headers)\s*\(/.test(source)) {
      violations.push({ file: rel, reason: "calls cookies()/headers()", via });
    }

    for (const specifier of importSpecifiers(source)) {
      if (
        FORBIDDEN_MODULES.includes(specifier) ||
        FORBIDDEN_PREFIXES.some((prefix) => specifier.startsWith(prefix))
      ) {
        violations.push({ file: rel, reason: `imports ${specifier}`, via });
        continue;
      }

      const resolved = resolveLocal(specifier, file);
      if (!resolved || !/\.(tsx?|jsx?)$/.test(resolved)) continue;

      if (FORBIDDEN_FILES.includes(resolved) || FORBIDDEN_DIRS.some((dir) => resolved.startsWith(dir))) {
        violations.push({ file: rel, reason: `imports ${specifier} (${path.relative(SRC, resolved)})`, via });
        continue;
      }

      queue.push({ file: resolved, via: chain });
    }
  }

  return { violations, visited: seen.size };
}

function format(violations: Violation[]): string[] {
  return violations.map(
    ({ file, reason, via }) => `${file} ${reason}${via.length ? `  [via ${via.join(" → ")}]` : ""}`
  );
}

describe("shell routes are user-agnostic (cache-safe HTML)", () => {
  for (const page of SHELL_PAGES) {
    it(`${page} and its layouts do not read cookies, headers or server data`, () => {
      expect(existsSync(path.join(APP, page)), `${page} exists`).toBe(true);
      const { violations, visited } = scan(routeChain(page));
      expect(visited).toBeGreaterThan(1);
      expect(format(violations)).toEqual([]);
    });
  }

  it("the scanner catches a forbidden import and a cookies() call", () => {
    const fixture = "import { cookies } from 'next/headers';\nconst jar = await cookies();\n";
    expect(importSpecifiers(stripComments(fixture))).toContain("next/headers");
    expect(/(?<![.\w$])(?:cookies|headers)\s*\(/.test(stripComments(fixture))).toBe(true);
    expect(importSpecifiers("import type { X } from '@/lib/server/seasonStats';")).toEqual([]);
    expect(importSpecifiers('import { getSeasonStats } from "@/lib/server/seasonStats";')).toEqual([
      "@/lib/server/seasonStats",
    ]);
  });

  it("[locale]/layout.tsx pins the locale from the URL and sends no messages itself", () => {
    const source = stripComments(readFileSync(path.join(APP, "[locale]/layout.tsx"), "utf8"));
    expect(source.indexOf("setRequestLocale(locale)")).toBeGreaterThan(-1);
    expect(source).not.toContain("getMessages(");
    expect(source).not.toContain("NextIntlClientProvider");
  });

  // WEB-01 phase 0: each route group sends its own messages to the browser.
  it.each(["[locale]/(app)/layout.tsx", "[locale]/(public)/layout.tsx", "[locale]/(marketing)/layout.tsx"])(
    "%s pins the locale from the URL before getMessages()",
    (layout) => {
      const source = stripComments(readFileSync(path.join(APP, layout), "utf8"));
      const setAt = source.indexOf("setRequestLocale(locale)");
      const messagesAt = source.indexOf("getMessages(");
      expect(setAt).toBeGreaterThan(-1);
      expect(messagesAt).toBeGreaterThan(setAt);
      // Without `messages`, the provider would inherit every message.
      expect(source).toMatch(/<NextIntlClientProvider\s+messages=\{messages\}>/);
    }
  );

  it("the website passes only its client namespaces to the browser", () => {
    const source = stripComments(readFileSync(path.join(APP, "[locale]/(marketing)/layout.tsx"), "utf8"));
    expect(source).toMatch(/pickMessages\(await getMessages\(\), WEBSITE_CLIENT_NAMESPACES\)/);
  });
});
