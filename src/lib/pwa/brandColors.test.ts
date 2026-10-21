import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_COLORS, DEFAULT_THEME, themeColorFor } from "@/lib/pwa/brandColors";

const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");

/** The body of the first top-level rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`globals.css has no "${selector}" rule`);
  return match[1];
}

function canvasIn(selector: string): string {
  const match = /--fp-canvas:\s*(#[0-9a-fA-F]{3,8})\s*;/.exec(ruleBody(selector));
  if (!match) throw new Error(`"${selector}" in globals.css defines no --fp-canvas hex value`);
  return match[1].toUpperCase();
}

describe("brandColors", () => {
  it("matches --fp-canvas in :root (light)", () => {
    expect(BRAND_COLORS.canvasLight.toUpperCase()).toBe(canvasIn(":root"));
  });

  it("matches --fp-canvas in .dark", () => {
    expect(BRAND_COLORS.canvasDark.toUpperCase()).toBe(canvasIn(".dark"));
  });

  it("maps theme names to the canvas colour, defaulting to dark", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(themeColorFor("light")).toBe(BRAND_COLORS.canvasLight);
    expect(themeColorFor("dark")).toBe(BRAND_COLORS.canvasDark);
    expect(themeColorFor(undefined)).toBe(BRAND_COLORS.canvasDark);
    expect(themeColorFor("system")).toBe(BRAND_COLORS.canvasDark);
  });
});
