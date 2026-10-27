import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BRAND_LOGO_PATHS, BrandLogo } from "@/components/brand/BrandLogo";

const brandDir = path.resolve(__dirname, "../../../public/brand");

/** Every `d` attribute in a master SVG, in source order. */
function pathsOf(file: string): string[] {
  const svg = readFileSync(path.join(brandDir, file), "utf8");
  return Array.from(svg.matchAll(/<path[^>]*\sd="([^"]+)"/g), (match) => match[1]);
}

afterEach(cleanup);

describe("BrandLogo", () => {
  it("draws the club-green master unchanged (F, then wordmark)", () => {
    expect(pathsOf("fairplayr-horizontal-club.svg")).toEqual([BRAND_LOGO_PATHS.F_ON_LIGHT, BRAND_LOGO_PATHS.WORDMARK]);
  });

  it("draws the chalk master unchanged (F, then wordmark)", () => {
    expect(pathsOf("fairplayr-horizontal-chalk.svg")).toEqual([BRAND_LOGO_PATHS.F_ON_DARK, BRAND_LOGO_PATHS.WORDMARK]);
  });

  it("keeps the master's dot and symbol placement", () => {
    const svg = readFileSync(path.join(brandDir, "fairplayr-horizontal-club.svg"), "utf8");
    expect(svg).toContain('viewBox="0 0 863 256"');
    expect(svg).toContain('<g transform="translate(0 23) scale(.82)">');
    expect(svg).toContain('<circle cx="204" cy="132" r="16"/>');
    expect(svg).toContain('transform="translate(250 174)"');

    const { container } = render(<BrandLogo label="FairPlayr" />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 863 256");
    expect(container.querySelector("g")?.getAttribute("transform")).toBe("translate(0 23) scale(.82)");
    const circle = container.querySelector("circle");
    expect([circle?.getAttribute("cx"), circle?.getAttribute("cy"), circle?.getAttribute("r")]).toEqual(["204", "132", "16"]);
  });

  it("is one image named by its label, coloured by the brand token", () => {
    render(<BrandLogo label="FairPlayr" />);
    const logo = screen.getByRole("img", { name: "FairPlayr" });
    expect(logo.getAttribute("fill")).toBe("currentColor");
    expect(logo.getAttribute("class")).toContain("text-fp-brand-mark");
  });

  it("shows the light-ground F in the light theme and the chalk F in the dark theme", () => {
    const { container } = render(<BrandLogo label="FairPlayr" />);
    const [onLight, onDark] = Array.from(container.querySelectorAll("g > path"));
    expect(onLight.getAttribute("d")).toBe(BRAND_LOGO_PATHS.F_ON_LIGHT);
    expect(onLight.getAttribute("class")).toBe("dark:hidden");
    expect(onDark.getAttribute("d")).toBe(BRAND_LOGO_PATHS.F_ON_DARK);
    expect(onDark.getAttribute("class")).toBe("hidden dark:inline");
  });
});
