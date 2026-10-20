// STAB-06: builds e2e/ui-audit.baseline.json from recorded observations.
//
//   FP_UI_AUDIT_UPDATE=1 npx playwright test e2e/ui-audit.spec.ts
//   node e2e/support/ui-audit-baseline.mjs           # write the baseline
//   node e2e/support/ui-audit-baseline.mjs --check   # report changes only
//
// Run the script right after the update run: Playwright empties test-results/
// at the start of every run.
//
// Per route and theme, each signature keeps the highest count seen on any
// viewport; the shared app shell ("chrome") is merged over all routes per
// theme. The baseline is meant to shrink. The script refuses to write when
// - an observation is missing (every route needs every project × theme), or
// - a route or the chrome would *gain* an entry or a higher count, or start
//   to overflow, unless --allow-growth is passed (accepting a new deviation
//   is a deliberate decision, not a side effect of regenerating).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const observedDir = path.join(root, "test-results", "ui-audit-observed");
const baselinePath = path.join(root, "e2e", "ui-audit.baseline.json");
const FINDINGS = ["targets", "smallText", "limeText"];
const CATEGORIES = [...FINDINGS, "console"];

const args = new Set(process.argv.slice(2));
const files = fs.existsSync(observedDir) ? fs.readdirSync(observedDir).filter((f) => f.endsWith(".json")) : [];
if (files.length === 0) {
  console.error(`No observations in ${observedDir}. Run with FP_UI_AUDIT_UPDATE=1 first.`);
  process.exit(1);
}

const observations = files.map((file) => JSON.parse(fs.readFileSync(path.join(observedDir, file), "utf8")));

// Completeness: a partial run would silently drop entries.
const projects = new Set(observations.map((o) => o.project));
const themes = new Set(observations.map((o) => o.theme));
const missing = [];
for (const route of new Set(observations.map((o) => o.route))) {
  for (const project of projects) {
    for (const theme of themes) {
      if (!observations.some((o) => o.route === route && o.project === project && o.theme === theme)) {
        missing.push(`${route} ${project} ${theme}`);
      }
    }
  }
}
if (missing.length) {
  console.error(`Incomplete observations (${missing.length} missing):\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

const merge = (entry, category, counts) => {
  for (const [signature, count] of Object.entries(counts ?? {})) {
    entry[category] ??= {};
    entry[category][signature] = Math.max(entry[category][signature] ?? 0, count);
  }
};

// Every route and theme gets an entry, even an empty one, so "no deviations" is explicit.
const routes = {};
const chrome = {};
for (const o of observations) {
  const entry = ((routes[o.route] ??= {})[o.theme] ??= {});
  const shell = (chrome[o.theme] ??= {});
  for (const category of FINDINGS) {
    merge(entry, category, o.page?.[category]);
    merge(shell, category, o.chrome?.[category]);
  }
  merge(entry, "console", o.console);
  if (o.overflowPx > 0) entry.overflow = true;
}

const sortKeys = (value) =>
  value && typeof value === "object"
    ? Object.fromEntries(
        Object.keys(value)
          .sort((a, b) => a.localeCompare(b))
          .map((key) => [key, sortKeys(value[key])]),
      )
    : value;

// Flatten to "scope theme" entries to compare with the previous baseline.
const flatten = (doc) => {
  const out = {};
  for (const [theme, entry] of Object.entries(doc.chrome ?? {})) out[`chrome ${theme}`] = entry;
  for (const [route, perTheme] of Object.entries(doc.routes ?? {})) {
    for (const [theme, entry] of Object.entries(perTheme)) out[`${route} ${theme}`] = entry;
  }
  return out;
};

const previousDoc = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : {};
const previous = flatten(previousDoc);
const next = flatten({ chrome, routes });
const hadBaseline = Object.keys(previous).length > 0;
const stale = [];
const grown = [];
for (const scope of new Set([...Object.keys(previous), ...Object.keys(next)])) {
  const before = previous[scope] ?? {};
  const after = next[scope] ?? {};
  for (const category of CATEGORIES) {
    for (const signature of Object.keys(before[category] ?? {})) {
      if (!(signature in (after[category] ?? {}))) stale.push(`${scope} ${category}: ${signature}`);
    }
    for (const [signature, count] of Object.entries(after[category] ?? {})) {
      const was = before[category]?.[signature] ?? 0;
      if (count > was) grown.push(`${scope} ${category}: ${signature} ×${count} (was ${was})`);
    }
  }
  if (after.overflow && !before.overflow) grown.push(`${scope} overflow: starts to scroll horizontally`);
  if (before.overflow && !after.overflow) stale.push(`${scope} overflow`);
}

console.log(`${observations.length} observations: ${Object.keys(routes).length} routes × ${projects.size} projects × ${themes.size} themes.`);
if (stale.length) console.log(`\nResolved (no longer seen), ${stale.length}:\n  ${stale.join("\n  ")}`);
if (grown.length) console.log(`\nNew or higher, ${grown.length}:\n  ${grown.join("\n  ")}`);
if (args.has("--check")) process.exit(0);

if (grown.length && hadBaseline && !args.has("--allow-growth")) {
  console.error("\nRefusing to grow the baseline. Fix the regressions, or pass --allow-growth for an accepted deviation.");
  process.exit(1);
}

const doc = {
  _about:
    "STAB-06 UI guard baseline: known deviations from FP-UI-REVISION-2026-10 (signature → highest count on any viewport), per theme. 'chrome' is the app shell shared by all routes; 'routes' is each route's own content. May only shrink. Regenerate with e2e/support/ui-audit-baseline.mjs.",
  chrome: sortKeys(chrome),
  routes: sortKeys(routes),
};
fs.writeFileSync(baselinePath, JSON.stringify(doc, null, 2) + "\n");
console.log(`\nWrote ${path.relative(root, baselinePath)}.`);
