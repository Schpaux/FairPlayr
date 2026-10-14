import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // Browser smoke tests live in e2e/ and run under Playwright, not Vitest.
    exclude: [...configDefaults.exclude, "e2e/**", "design-exploration/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
