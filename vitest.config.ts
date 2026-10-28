import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // Browser smoke tests live in e2e/ and run under Playwright, not Vitest.
    // Agent worktrees (AGENTS.md §7) are other checkouts with their own deps.
    exclude: [...configDefaults.exclude, "e2e/**", "design-exploration/**", ".claude/worktrees/**"],
    // next-intl's middleware imports `next/server` without an extension, which
    // Node's ESM loader rejects; transforming it lets src/proxy.test.ts run the
    // real proxy (WEB-01d).
    server: { deps: { inline: ["next-intl"] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
