# FairPlayr brand

**Status:** approved by the product owner, authoritative. **Version:** 1.1 (2026-10-28, approved wordmark accent), based on brand package v1.0, direction «Neste spiller».

This document is the single source of truth for the FairPlayr **brand**: the logo, its variants, brand colours, app icons and how the brand is used in the app, on public pages and on the coming website (WEB-01). [DESIGN.md](DESIGN.md) stays the single source of truth for **Modern Sideline**, the design language of the interface. Where the two meet (colour tokens), they use the same values; if they ever disagree on the logo or icons, this document wins, and on everything else in the UI, DESIGN.md wins.

Every future brand change goes through this document first: update it, then the assets, then the code.

---

## 1. Brand architecture

| Name | What it is | Where it appears |
|---|---|---|
| **FairPlayr** | The product and the main brand. The only name with a logo. | App header, public match page, app icon, website, store listings |
| **Modern Sideline** | The design language and UI system (DESIGN.md): calm, clear, football identity on match surfaces only | The whole interface; never shown to users as a name |
| **FairPlayr Next** | The action strip on the live screen that suggests the next relevant action (DESIGN.md §5.4) | Product communication about that feature only |

Neither Modern Sideline nor FairPlayr Next replaces the product name, and neither has its own logo. Write «FairPlayr» as one word with a capital F and P.

---

## 2. Logo

**Concept, «Neste spiller» (next player):** the F is the main form and the dot is a player at the next step. A 40-unit stem and open counters give it weight. The symbol is its own geometric construction; the wordmark is Inter 700 (optical size 32, tightened spacing) converted to outlines, not a typeface.

### Variants

| Variant | Use | Master |
|---|---|---|
| **Horizontal** (symbol + wordmark) | The primary logo: app header, public match page, website header | `public/brand/fairplayr-horizontal-{club,chalk}.svg` |
| **Stacked** | Square or centred layouts (house guidance; the package only names the variant) | `public/brand/fairplayr-stacked-{club,chalk}.svg` |
| **Symbol** | Only where FairPlayr is already known from context: app icon, avatar, favicon, small UI | `public/brand/fairplayr-symbol-{club,chalk}.svg` |
| **Small** (symbol cut with a larger dot) | The symbol at 16–23px; the package's favicons and app icons use the same larger dot | brand package only |
| Wordmark alone, black and white versions | Not used in the app (house guidance: third parties and one-colour print) | brand package only |

SVG is the master. PNG exports in the brand package are for presentations and publishing, never for the app.

### Rules

- **Clear space:** at least one stem width (40/256 of the symbol grid) on every side. The master view boxes include margin, but not always a full 40 units (the symbol master has 36 on the right): keep clear space around the box as well.
- **Minimum size on screen:** horizontal logo 150px wide; symbol 24px; the small cut for 16–23px. In print: symbol 8mm, logo 40mm.
- **Never** stretch, rotate, redraw, re-space, recolour or move the dot. No gradient, glow, shadow, outline, 3D or live text. Do not build the tagline into the logo.
- **The dot and F symbol are never lime.** The only approved two-tone exception is the final lowercase `r` of the outlined FairPlayr wordmark: `#4D8C1F` on light and `#9FE870` on dark. All other letterforms retain their existing colour and geometry.
- **Two geometries:** the chalk and white masters have an F stem one unit wider than the club and black masters (41 vs 40 units; the package gives no reason). Use the chalk master on dark grounds and the club master on light grounds; never just recolour one into the other.

---

## 3. Colour

The brand colours are the Modern Sideline tokens (DESIGN.md §2); the brand package took them from `globals.css`. There is no separate brand palette in code.

| Brand name | Hex | Token (`--fp-*`) | Brand role |
|---|---|---|---|
| Klubbgrønt (club green) | `#0E4D33` | `club` | Identity; the logo on light grounds; app icon background |
| Kalkhvitt (chalk) | `#F2EFE7` | `on-club` | The logo on club green or the dark canvas |
| Mørk canvas (dark canvas) | `#121B16` | `canvas` (dark) | Dark background, PWA theme and splash |
| Lime | `#9FE870` | `lime` | Next action; also the last wordmark `r` on dark backgrounds |
| On lime | `#0B2E1A` | `on-lime` | Text on lime |
| Ink | `#111A15` | `ink` (light) | Text |
| Light | `#F9FAF8` | `canvas` (light) | Light background |
| Muted | `#A4B3A9` | `ink-2` (dark) | Secondary text on dark |

**Logo colour:** `--fp-brand-mark` (Tailwind `text-fp-brand-mark`) is club green in the light theme and chalk in the dark theme. `--fp-brand-wordmark-accent` is `#4D8C1F` on light and `#9FE870` on dark, used **only** for the final lowercase `r` in the wordmark. The F-and-dot symbol is always monochrome and unchanged. For use on club-green panels, ensure the chalk wordmark and lime final `r` remain legible.

Colours are sRGB screen values. No Pantone match or print profile exists yet (BRAND-01i): proof any print job.

---

## 4. App icons, favicon and splash

App icons have a full-bleed background; the platform makes the corners. The PNG icons come from the brand package, flattened losslessly to opaque RGB (they had no transparent pixels); `favicon.ico` and the SVG sources are byte-identical; the iOS splash is composed from the chalk symbol master (BRAND-01d).

| File | Size | What |
|---|---|---|
| `src/app/favicon.ico` | 16, 32, 48 | Small cut, chalk on club green |
| `src/app/apple-icon.png` | 180 | iOS home screen (web) |
| `public/icons/icon-192.png`, `icon-512.png` | 192, 512 | Manifest, purpose `any` |
| `public/icons/icon-maskable-512.png` | 512 | Manifest, purpose `maskable` (symbol inside the 80 % safe zone) |
| `public/icons/icon-source.svg`, `icon-maskable-source.svg` | vector | Sources of the above (package `app-icon.svg`, `maskable.svg`) |
| `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` | 1024 | iOS app icon, no alpha channel (App Store rule) |
| `ios/App/App/Assets.xcassets/Splash.imageset/*` | 2732 | Splash: the chalk symbol master, centred at 416px on the dark canvas |

- The file names are fixed: the service worker precaches these exact paths (`src/sw/routes.ts`, `src/app/serwist/[path]/route.ts`). Replace the contents, not the names.
- PWA `theme_color` and `background_color` are the dark canvas (`src/lib/pwa/brandColors.ts`). The iOS launch screen and the Capacitor SplashScreen use the same colour.
- The splash is approved as design direction (product owner, 2026-10-27). iOS changes take effect after an approved Capacitor sync and Xcode build (AGENTS.md §1); neither has been run, so the icon and splash are not yet verified on a device.

---

## 5. Where the logo is used

| Surface | Variant | Implementation |
|---|---|---|
| App header | Horizontal, 150px, theme colour | `src/components/brand/BrandLogo.tsx` in `Header.tsx` |
| Public match page (`/s/[token]`) | Horizontal, 150px, theme colour | `BrandLogo` in `PublicMatchView.tsx` |
| Installed app, browser tab, iOS | Symbol on club green | §4 |
| Website (WEB-01) | Horizontal: club on light, chalk on dark | `public/brand/` masters, or `BrandLogo` |

**The app, the website and the public match pages use the same main logo.** `BrandLogo` copies the master path data unchanged and `BrandLogo.test.tsx` fails if it drifts from `public/brand/`. The accessible name comes from messages (`common.appName`, `publicMatch.brand`).

### Website (WEB-01)

- Header: the horizontal logo; club master on light sections, chalk master on dark or club-green sections.
- Interface and typography follow Modern Sideline (DESIGN.md); lime only for the primary call to action.
- Tagline (a recommendation, not yet adopted; the product owner decides it in WEB-01): «Mer oversikt. Mer kamp.» / «More clarity. More game.» Never part of the logo.
- Photography: real grassroots football, natural light, close to the sideline. Graphics: open surfaces, clear shapes, no glow or decorative gradients.
- Copy: Norwegian first, concrete, friendly and short; the coach decides. Write «Ha oversikt over spilletiden», not «Revolusjonerende AI som garanterer rettferdighet». Never promise planned features or use invented testimonials.
- Share image (Open Graph): not in the package yet (BRAND-01h); make it from the masters and get it approved.

---

## 6. Typography

Inter 400 for body text, 600 for labels, 700 for headings (and the wordmark). Barlow Condensed 600 for match numerals only: score, clock and shirt numbers (DESIGN.md §3). Both are SIL OFL. The app bundles both fonts at build time; no runtime font requests (AGENTS.md §3).

---

## 7. Motion

The logo animation in the brand package: the dot glides into place in 0.9 s, with no bounce or loop. It is for video and the website only, never in the app UI (DESIGN.md: no ambient motion), and it respects reduced motion. Do not communicate status with colour alone.

---

## 8. Source and licensing

- **Brand package v1.0** (2026-10-27): a local, unversioned folder (`design-exploration/FairPlayr-Brand-package-v1/`). It is source material: keep it unchanged and copy only the files needed into the repo. It also holds the brand guide (PDF), SoMe templates, video end card, presentation, logo motion demo, brand tokens and AI briefs.
- The logo is an original construction for FairPlayr. Inter and Barlow Condensed are SIL Open Font License 1.1.
- **Not done:** trademark clearance, Pantone match and an ICC-profiled print master (BRAND-01i). Clear these before a larger public launch.

**Brand v1.1 (2026-10-28):** approved two-tone last `r` on horizontal and stacked logo SVG masters and in `BrandLogo`. The local source package v1.0 remains unchanged and is not claimed to be regenerated. Standalone wordmark, presentations, PNG exports, email assets and other package-only artefacts require separate regeneration from updated masters when needed.

## 9. Open needs

Tracked in `roadmap/roadmap.json` under BRAND-01: marketing material (BRAND-01g), share image (BRAND-01h), trademark and print profile (BRAND-01i), SVG favicon (BRAND-01j). Do not improvise a variant the package does not cover; register the need there instead.
