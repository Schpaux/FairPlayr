---
name: logo-design
description: Review and maintain FairPlayr's approved logo and wordmark against BRAND.md. Use for logo colours, versions, contrast, readability, SVG master checks and brand consistency. Never generate or modify logo artwork without an explicit scoped request and approval.
---

# FairPlayr Logo Design — project skill

## Authority and prerequisites
1. Read `AGENTS.md`, `BRAND.md`, `DESIGN.md` and relevant current SVG masters under `public/brand/` before any review.
2. `BRAND.md` defines approved identity; `DESIGN.md` defines UI. The existing brand package v1.0 is local, unversioned source material and may be unavailable. Do not claim to have inspected it unless provided.
3. This is a **FairPlayr-specific review skill**, not a copy of any third-party or previously used Logo Design skill.
4. Review is read-only by default. Never create mockups, images, SVGs, assets or change files when a review is requested. Never commit, push, open/merge PR or deploy without the approval required by `AGENTS.md`.

## Identity invariants
- Product name: FairPlayr. Preserve the existing geometric F-and-dot symbol, including dot geometry, colour treatment and light/dark geometry differences.
- Preserve wordmark letterforms (outlined Inter 700), kerning, alignment, proportions, viewBox and clear space unless explicitly approved otherwise.
- Keep original approved masters recoverable. No gradients, shadows, 3D, unapproved movement, or replacement typography.
- Do not treat generic design skill advice as permission to change brand rules.

## Review workflow
1. Inventory actual files and variants (horizontal, stacked, symbol and any standalone wordmark); distinguish repository masters from package-only variants.
2. Identify background colours and text/mark colours for light and dark use from `BRAND.md` and design tokens.
3. For proposed colours calculate WCAG relative-luminance contrast against actual backgrounds. Assess small-size optical legibility, visual balance, colour harmony and ability to reproduce in SVG/print. WCAG text ratios are useful diagnostics, not automatically normative for a logo. Explain limits.
4. Compare at least the user's proposals and at most 2-3 carefully justified alternatives; include hex codes and measured contrast, with a recommendation and trade-offs.
5. State explicitly which existing brand rules would need revision, *if* the change is approved.
6. Output review with findings, recommendation, risks, and proposed approval decision. No files changed.

## Current request to review (not an approved brand change)
- Keep logo symbol and all other brand elements untouched.
- Consider highlighting **only the final lowercase r** of `FairPlayr`.
- On dark canvas `#121B16`, proposed r: lime `#9FE870`; remaining wordmark chalk `#F2EFE7`.
- On light canvas `#F9FAF8`, remaining wordmark club green `#0E4D33`; evaluate an accent with stronger contrast than lime, including `#4D8C1F`, `#458B32`, `#568A16` and other close alternatives.
- Determine whether the two-tone treatment is a strong identity choice at 150px horizontal-logo size. Do not silently apply it or alter the symbol.

## Implementation phase — only after explicit separate approval
Update `BRAND.md` first, then SVG masters and `BrandLogo` while retaining exact path geometry (split final glyph without changing outlines), related tests, and only the necessary exported variants. Validate light/dark contrast and `BrandLogo` master parity. Keep old masters and avoid touching symbol/favicon/app icons/splash.
