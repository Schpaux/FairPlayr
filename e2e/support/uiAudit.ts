import type { Page } from "@playwright/test";

// STAB-06: the UI guard's measurements, shared by e2e/ui-audit.spec.ts.
// Ported from design-exploration/ui-revision-2026-10/audit.mjs (the baseline
// of FP-UI-REVISION-2026-10) and made stable enough to compare across runs:
// every finding becomes a *signature* (what and which element, never pixel
// sizes), digits are folded to "#" so clocks and dates do not churn, and the
// result counts how often each signature occurs on the page.

export type Counts = Record<string, number>;

export interface FindingSet {
  /** Interactive elements under 44px in either dimension (DESIGN.md §4, §9). */
  targets: Counts;
  /**
   * Visible text under 13px (DESIGN.md §3: 13px is the floor). The key has
   * no size, so 11px → 12px is not churn; the text is still too small.
   */
  smallText: Counts;
  /** Lime text on a light surface (DESIGN.md §2.5: lime is never text there). */
  limeText: Counts;
}

export interface AuditFindings {
  /** The route's own content: `main` and anything portalled (sheets). */
  page: FindingSet;
  /**
   * The app shell around `main` (header, team picker, banner, bottom nav).
   * It is the same on every route, so it has one shared baseline.
   */
  chrome: FindingSet;
  /** Horizontal overflow of the document, in px (0 = none). */
  overflowPx: number;
}

export const MIN_TARGET_PX = 44;
export const MIN_TEXT_PX = 13;

/** Folds digits and whitespace so a signature survives clocks and dates. */
export function normalise(text: string, max = 40): string {
  return text.replace(/\s+/g, " ").trim().replace(/\d+/g, "#").slice(0, max);
}

export async function measureUi(page: Page): Promise<AuditFindings> {
  const raw = await page.evaluate(
    ({ minTarget, minText }) => {
      const fold = (text: string, max = 40) => text.replace(/\s+/g, " ").trim().replace(/\d+/g, "#").slice(0, max);
      const visible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) return false;
        return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
      };
      const ignored = (el: Element) => !!el.closest("nextjs-portal, script, style, noscript, template");
      // An element under something else (the live overlay, a sheet's scrim)
      // can be neither read nor tapped, so it is not measured. Only points
      // inside the viewport can be hit-tested; the rest count as uncovered.
      const covered = (el: Element) => {
        const rect = el.getBoundingClientRect();
        const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
        const y = rect.top + rect.height / 2;
        if (y < 0 || y >= window.innerHeight || rect.right < 0 || rect.left >= window.innerWidth) return false;
        const hit = document.elementFromPoint(x, y);
        // Text inside a control (a label over a transparent radio) is not covered.
        const owner = el.closest("label, a, button, [role=button]") ?? el;
        return !!hit && !owner.contains(hit) && !hit.contains(el);
      };
      const main = document.querySelector("main");
      const shellParts = main?.parentElement ? [...main.parentElement.children].filter((child) => child !== main) : [];
      const scopeOf = (el: Element) => (shellParts.some((part) => part.contains(el)) ? "chrome" : "page");
      const empty = () => ({ targets: {}, smallText: {}, limeText: {} }) as Record<"targets" | "smallText" | "limeText", Record<string, number>>;
      const sets = { page: empty(), chrome: empty() };
      const bump = (el: Element, category: "targets" | "smallText" | "limeText", key: string) => {
        const counts = sets[scopeOf(el)][category];
        counts[key] = (counts[key] ?? 0) + 1;
      };

      // Interactive elements under the minimum hit area.
      const interactive =
        "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=menuitem]";
      const labelText = (control: Element) => {
        const label = (control as HTMLInputElement).labels?.[0];
        if (!label) return "";
        // The label's own words, without the text of the control inside it (a select's options).
        const clone = label.cloneNode(true) as Element;
        clone.querySelectorAll("select, input, textarea").forEach((node) => node.remove());
        return clone.textContent ?? "";
      };
      const measured = new Set<Element>();
      for (const control of document.querySelectorAll(interactive)) {
        if (ignored(control)) continue;
        // A visually hidden native input (opacity 0 over a styled label) is
        // tapped through its label, so the label is the hit area to measure.
        let el: Element = control;
        if (!visible(control) && control.tagName === "INPUT") {
          const owner = control.closest("label");
          if (!owner) continue;
          el = owner;
        }
        if (measured.has(el) || !visible(el)) continue;
        measured.add(el);
        const rect = el.getBoundingClientRect();
        if (rect.width >= minTarget - 0.5 && rect.height >= minTarget - 0.5) continue;
        if (covered(el)) continue;
        const name = control.getAttribute("aria-label") || labelText(control) || el.textContent || "";
        const kind = control.tagName === "INPUT" ? `input[${(control as HTMLInputElement).type}]` : control.tagName.toLowerCase();
        bump(el, "targets", `${kind} "${fold(name)}"`);
      }

      // Text nodes: size floor and lime-on-light.
      const parseRgb = (value: string) => {
        const match = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (!match) return null;
        return { r: +match[1], g: +match[2], b: +match[3], a: match[4] === undefined ? 1 : +match[4] };
      };
      const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
        const channel = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const backgroundOf = (el: Element | null) => {
        for (let node = el; node; node = node.parentElement) {
          const bg = parseRgb(getComputedStyle(node).backgroundColor);
          if (bg && bg.a >= 0.5) return bg;
        }
        return parseRgb(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
      };
      // Lime is the --fp-lime token (#9FE870); e2e/ui-audit-canary.spec.ts
      // fails if the token moves and this detector would go blind. Light means
      // a relative luminance over 0.4 (canvas and surfaces in the light theme);
      // background images and gradients are not considered.
      const isLime = (color: string) => {
        const rgb = parseRgb(color);
        return !!rgb && rgb.r === 159 && rgb.g === 232 && rgb.b === 112 && rgb.a > 0.3;
      };

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = node.textContent ?? "";
        if (!text.trim()) continue;
        const el = node.parentElement;
        if (!el || ignored(el) || !visible(el)) continue;
        const style = getComputedStyle(el);
        const size = parseFloat(style.fontSize);
        const small = size < minText;
        const lime = isLime(style.color) && luminance(backgroundOf(el)) > 0.4;
        if ((!small && !lime) || covered(el)) continue;
        const tag = el.tagName.toLowerCase();
        if (small) bump(el, "smallText", `${tag} "${fold(text)}"`);
        if (lime) bump(el, "limeText", `${tag} "${fold(text)}"`);
      }

      return {
        page: sets.page,
        chrome: sets.chrome,
        // Against the device width, not innerWidth: without a zoom lock, mobile
        // browsers widen the layout viewport to fit wide content, which would
        // hide the overflow (UI-A11Y-01 removes the lock).
        overflowPx: Math.max(0, document.documentElement.scrollWidth - Math.min(window.innerWidth, window.screen.width)),
      };
    },
    { minTarget: MIN_TARGET_PX, minText: MIN_TEXT_PX },
  );
  return raw;
}

// Console messages that are development noise, not app problems.
const CONSOLE_NOISE = [
  /Download the React DevTools/i,
  /\[HMR\]/,
  /\[Fast Refresh\]/,
  /webpack-hmr|turbopack-hmr/i,
];

/**
 * Collects uncaught page errors, console errors and any hydration warning.
 * Returns a live array; read it after the page has settled.
 */
export function collectConsoleProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${normalise(error.message, 120)}`));
  page.on("console", (message) => {
    const text = message.text();
    const type = message.type();
    const relevant = type === "error" || (type === "warning" && /hydrat/i.test(text));
    if (!relevant || CONSOLE_NOISE.some((pattern) => pattern.test(text))) return;
    // The source path tells two failed resources apart ("Failed to load resource" has no URL).
    // Only for resources: elsewhere the location is a hashed JS chunk that churns per build.
    let source = "";
    if (/^Failed to load resource/.test(text)) {
      try {
        source = ` @${new URL(message.location().url).pathname}`;
      } catch {
        // No usable location.
      }
    }
    problems.push(`${type}: ${normalise(text, 160)}${source}`);
  });
  return problems;
}

export function countsOf(list: string[]): Counts {
  const counts: Counts = {};
  for (const item of list) counts[item] = (counts[item] ?? 0) + 1;
  return counts;
}

/** Findings that exceed the baseline: a new signature or a higher count. */
export function regressions(observed: Counts, allowed: Counts | undefined): string[] {
  return Object.entries(observed)
    .filter(([signature, count]) => count > (allowed?.[signature] ?? 0))
    .map(([signature, count]) => `${signature} ×${count} (baseline ${allowed?.[signature] ?? 0})`);
}

/** Baseline entries this run no longer sees (candidates for removal). */
export function resolved(observed: Counts, allowed: Counts | undefined): string[] {
  return Object.keys(allowed ?? {}).filter((signature) => !(signature in observed));
}
