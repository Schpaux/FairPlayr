import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output and design prototypes (not app source):
    "playwright-report/**",
    "test-results/**",
    "design-exploration/**",
    // Agent worktrees (AGENTS.md §7): other checkouts, linted there.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
