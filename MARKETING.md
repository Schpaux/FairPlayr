# FairPlayr website: marketing design guide

**Status:** version 0.2 (2026-10-28, WEB-01B preparation complete). The creative direction is chosen as an overarching direction (§5); layout, section order and the hero are designed in the build, not fixed here. Visual implementation starts only on the product owner's separate instruction; the technical foundation (phase 0) may start now.

This guide covers the public website at `fairplayr.app` (`/`, `/no` and the website pages under them, the `(marketing)` route group). It does not cover the coach's app or the public match page.

| Document | Authoritative for |
|---|---|
| [BRAND.md](BRAND.md) | Logo, variants, app icons, brand colours, tagline, brand tone |
| [DESIGN.md](DESIGN.md) | Modern Sideline: tokens, type, the app's components and interaction rules |
| **MARKETING.md** (this file) | How the website uses the brand and Modern Sideline, what it may do that the app may not, and content rules |
| [AGENTS.md](AGENTS.md) | Process, approval, product rules |

On the logo, BRAND.md wins. On tokens and on anything the website reuses from the app, DESIGN.md wins. This file adds website rules; it never adds a competing palette, token set or logo.

---

## 1. What the website is for

FairPlayr is a mobile-first matchday assistant for grassroots and youth football coaches: parent coaches and team managers, often without technical background. The website has one job: **let a coach understand in a few seconds what FairPlayr does for them on match day, trust it with their team, and open the app.**

- **Product promise:** *One coach. One screen. Zero stress.* (owner's vision; not yet adopted as public copy, see §11).
- **The core idea to land:** fair playing time, made easy on the sideline. **Total match minutes per player** is the number the product is built around (AGENTS.md §2). The site should show it, not hide it.
- **Primary action:** open the app (`/play`). There is no sign-up wall to try it.
- **Audience:** Norwegian first, English second. Volunteers, not buyers of enterprise software.
- **Contact:** `support@fairplayr.app`, also for privacy requests. FairPlayr has no registered legal entity yet: the website shows **no company name, organisation number or address**, and agents never invent them (§13).

## 2. Brand on the website

- **Name:** «FairPlayr», one word, capital F and P. *Modern Sideline* is never shown to users. *FairPlayr Next* is used only when talking about the action strip.
- **Logo:** horizontal logo in the header, from `BrandLogo` or `public/brand/`. Club master on light sections, chalk master on dark or club-green sections. Never lime, never redrawn, never animated except the approved logo motion (BRAND.md §7: the dot glides into place in 0.9 s, once, website and video only, off with reduced motion).
- **Tagline:** BRAND.md recommends «Mer oversikt. Mer kamp.» / «More clarity. More game.»; not adopted. Never part of the logo.
- **Tone of voice:** concrete, friendly, short, Norwegian first. "Ha oversikt over spilletiden", not "Revolusjonerende AI som garanterer rettferdighet". The coach decides; the app suggests. No superlatives, no invented numbers, no testimonials that do not exist.

## 3. Tokens: one system, website extensions only where needed

The website uses the **existing `--fp-*` tokens** in `src/app/globals.css` (DESIGN.md §2). There is no website palette.

| Role on the website | Token | Notes |
|---|---|---|
| Page backgrounds | `canvas`, `surface`, `surface-2` | Both themes are real; see §5 for which sections use which |
| Text | `ink`, `ink-2` | Body text never below 16px |
| Identity fields | `club`, `on-club`, `on-club-2` | Club-green sections, product framing |
| Primary call to action | `lime` fill + `on-lime` text | **One lime action per viewport.** Lime is never text, never decoration, never a highlight on a headline |
| Football surfaces | `grass`, `grass-stripe`, `grass-line`, `disc`, `tag`, `keeper`, `ring-*` | Only inside product visualisations (pitch, tokens, bench) |
| Focus | `focus` | Visible on every interactive element |

Notes for anyone working from older briefs: the values `#163300` and `#0e0f0c` that have appeared in briefs are **not** FairPlayr tokens. Text on lime is `on-lime` `#0B2E1A`; the dark canvas is `#121B16`.

**Allowed website extensions** (added as `--fp-web-*` tokens in `globals.css` in phase 1 and documented here):

- a **display type scale** larger than the app's (the app's largest is Display 30px);
- **section rhythm** spacing (vertical spacing between sections; the 4px base and 16px mobile gutter stay);
- **website motion tokens** for scroll, reveal and cinematic sequences (§6), with the app's easing curves as the base;
- **gradients, tints and light** built from existing tokens: for example a floodlight fall-off over `grass`, a `club`-to-`canvas` field behind a product frame, a shadow that gives a device or the pitch depth. Defined as named tokens, never inline values.

No new hues. Hard-coded hex values in components are forbidden here too (AGENTS.md §4, `designGuard.test.ts`). The app's bans on gradients, glow, blur and ambient motion do not apply inside `(marketing)` (DESIGN.md §10, WEB-01B); they still apply everywhere else, including the public match page. `designGuard.test.ts` enforces this with a **website profile** for `src/app/[locale]/(marketing)/` and `src/components/marketing/` only (DESIGN.md §11); a component used by both the website and the app is checked as app code.

## 4. Typography

- **Inter for every word, Barlow Condensed 600 for numerals only** (BRAND.md §6, DESIGN.md §3). The website does not introduce a third family.
- Character comes from **how** Inter is set, not from a new face: very large display sizes, tight tracking, heavy weights, short line lengths, and Inter's optical-size axis if the build exposes it (`opsz`; to verify with `next/font` before relying on it).
- **Barlow Condensed is the website's signature for numbers that matter:** minutes played, the match clock, the score, shirt numbers. A large "24′" next to a name is on-brand; Barlow for words is not.
- Body 16–18px, line length under 75 characters, sentence case. Avoid the generated-page tells: one accented word in a headline, all-caps eyebrows above every heading, numbered 01/02/03 markers on content that is not a sequence.
- Fonts are self-hosted at build time (`next/font`). No runtime requests to Google Fonts or any CDN (AGENTS.md §3).

## 5. Creative direction

> **Chosen 2026-10-28 (product owner): The Live Experience, told with cinematic storytelling and refined fintech-grade design.** This is a direction, not a layout. No mockup from the concept work is the answer key; layout, section order, dark/light balance and the hero are designed during the build and reviewed with the owner.

The website has **wide creative freedom** within the brand: photography, advanced motion design, CSS-3D, gradients and other techniques are welcome **when they make the experience better**, not as decoration. The logo, the brand colours (the existing tokens), Inter and Barlow Condensed stay as they are.

The three strands, and what each one means here:

| Strand | What it means on the page | What it does not mean |
|---|---|---|
| **The Live Experience** | The visitor feels a match moment: the clock running, the bench re-sorting least-played first, a substitution landing, minutes ticking up, FairPlayr Next saying what comes next. The live screen is the centre of gravity. | A screenshot gallery or a feature grid with icons. |
| **Cinematic storytelling** | The page is told as a sequence, like a matchday: before kick-off, the first half, the substitution, the final whistle, the parents' view. Framing, pacing, light (floodlights, dusk, grass), the promo film (WEB-01j) as a real part of the story. Scroll moves the story forward. | Autoplaying sound, scroll-jacking that takes control away, long intros before the visitor knows what FairPlayr is. |
| **Refined fintech design** | The precision and trust of a good finance product: exact numbers set beautifully (Barlow numerals, tabular alignment), generous space, quiet surfaces, crisp hierarchy, privacy and reliability stated plainly. Minutes are treated like a balance that must be right. | Fintech clichés: credit-card mockups, charts for decoration, invented statistics, "bank-level security" claims. |

What every part of the page must respect:

1. **The subject leads.** The most characteristic thing in FairPlayr's world is a coach on the sideline looking at a pitch, a bench and a number that says who has played least. A concept should open with that (the product itself, a real match moment, the minutes), not with an abstract gradient, a device mock floating in space or a stock photo of a stadium.
2. **Watch the palette's cliché.** Dark ground plus one bright acid-green accent is one of the most common looks of generated pages. FairPlayr's palette sits on it by brand. The distinction must therefore come from the subject: grass, chalk lines, club green, shirt-number discs, real product UI and real (or clearly staged) grassroots photography. A concept that would look the same with another product's name on it fails.
3. **Spend the boldness in one place.** One memorable element (for example the live pitch demo, a full-bleed minutes moment or the film), everything around it quiet.
4. **The product is the hero image.** Product visualisations are built from the real components or faithful renders of them (§8), not illustrations of an imagined app.
5. **Calm, not loud.** The app's emotional goal is calm control; the website can be more expressive but never frantic.

Defined during the build (phase 1 onwards) and recorded here when reviewed: hero treatment; dark/light section balance; display scale values; section rhythm; the "one bold thing"; photography and film style; how the product frame and, later, the demo are presented. Until the interactive demo (WEB-01k) ships, the product is shown by the film and faithful product renders (§8).

### Evaluating a design

| Criterion | Question |
|---|---|
| Recognisable | Is it unmistakably FairPlayr (logo, club green, pitch, minutes) without the logo? |
| Honest | Does every claim match a released feature (§9)? |
| Fair-play message | Is "everyone gets to play, and you can see it" understood in the first viewport? |
| Mobile | Does it work one-handed at 360×640, with the CTA reachable? |
| Light | Does the first view render without JavaScript and within the performance budget (§7)? |
| Not generic | Would it still work with another product's name? If yes, it fails. |
| Direction | Does it feel live (§5), tell a story in sequence, and carry the precision of the numbers? |

## 6. Motion

The app has no ambient motion (DESIGN.md §4). The website may use advanced motion design, cinematic sequences and ambient motion, under these rules:

- **Motion explains the product, tells the story or answers the visitor.** Examples: the bench re-sorting least-played first, a substitution landing, minutes counting up, the action strip changing message, a camera-like move from the stands down to the bench, floodlights coming on. Not: fade-and-slide on every section, floating blobs, cursor trails, effects that would look the same on any product.
- **One orchestrated moment per view** beats scattered effects. Quiet ambient motion (light, grass, a slow drift in depth) is allowed where it serves the scene, never competing with the moment.
- Easing from DESIGN.md (`cubic-bezier(0.22, 1, 0.36, 1)`, land `cubic-bezier(0.16, 1, 0.3, 1)`); UI responses under 300ms; scroll-linked and cinematic sequences may be longer because the visitor controls them or chose to watch.
- Animate `transform` and `opacity` only. No animated blur, no animated `filter`, no layout properties, no `will-change` sprinkled as a fix. Static blur, glow and gradients are fine where they hold the frame budget on a mid-range Android.
- **3D** means CSS `perspective`, `rotate3d` and layered depth on a product frame, the pitch plane or a scene, or pre-rendered stills and video. **WebGL or a 3D engine** needs the owner's explicit approval for one element, with a static fallback and a performance check.
- Scroll-linked motion uses CSS scroll-driven animations as a progressive enhancement, with a complete static layout where they are unsupported. Framer Motion (already a dependency) only inside client islands that need it.
- **`prefers-reduced-motion`:** every transform and scroll effect is off; content and order stay identical; the demo still works by tap, without autoplay.
- No motion that carries information on its own (status is never motion-only or colour-only).
- The logo animation is the only animation of the logo.
- Checked by the website profile in `designGuard.test.ts` (DESIGN.md §11): animated `filter`/`backdrop-filter`, animated layout properties (including `transition-all` and Framer Motion `layout`) and scroll-linked motion (`animation-timeline`, `useScroll`) in a file without a reduced-motion check fail the test. Time-based CSS motion is already off with reduced motion (`globals.css`), and Framer Motion follows `MotionConfig reducedMotion="user"`.

## 7. Performance and technical floor

- **Budget (mobile, 4G, mid-range Android):** LCP < 2.0 s, CLS < 0.05, INP < 200 ms. JavaScript for the first view as close to zero as the concept allows; heavy parts (demo, video player) load on interaction or when scrolled near.
- Server Components by default; client islands only for the demo, the video facade and the language switcher if it needs state.
- Images through `next/image` with explicit sizes; posters and stills in AVIF/WebP; no autoplaying video on mobile data.
- No third-party requests on page load: no analytics, no tag managers, no remote fonts, no YouTube until the visitor asks to play (§8).
- The website shares origin, service worker and storage with the app: it must stay user-agnostic and static (`shellRouteSafety.test.ts`), must not read or write the app's `localStorage` keys, and must not change the coach's theme setting.
- **Website media lives in `public/marketing/`** and is referenced by path (`<Image src="/marketing/…">`, `<video src="/marketing/…">`), never imported statically: a static import lands in `.next/static/media`, which the service worker precaches into every installed app. `src/lib/marketing/websiteBoundary.test.ts` fails on a static media import, on browser storage, service-worker or `setTheme` calls, and on imports of the app's storage, Supabase, worker, providers or live match controller.
- **Only `/` and `/no` are precached.** Other website pages (`/roadmap`, `/no/privacy`, …) are network-first and never stored by the worker; precaching another page is a deliberate change with its own test (`src/sw/shellRoutes.test.ts`). Website pages are listed once, in `src/lib/marketing/routes.ts`; the proxy skips the Supabase session refresh on exactly those paths.

## 8. Product visualisations and data

- **Prefer the real thing:** the live pitch, bench, scoreboard and action strip rendered from the app's own presentational components, driven by a deterministic demo model (see the WEB-01B plan). A faithful screenshot or recording is second best. An invented UI is not allowed.
- **Demo data is fictional, and obviously so:** invented first names, a made-up opponent («Lyn» style placeholders are fine; real club names are not), no photos of real children, no real match data, no data from production. Demo state never touches the app's storage or the network.
- **Never imply real usage:** no "used by 500 clubs", no star ratings, no testimonials, no club logos, until they exist and the owner approves them.
- Screens and recordings are taken in Norwegian for the Norwegian site and English for the English site.
- **Photography is welcome** and carries the cinematic strand: real grassroots football, natural light or floodlights, close to the sideline (BRAND.md §5). No identifiable children without documented consent; prefer coaches, backs, feet, hands, the ball, the bench. Licensed stock only when it is clearly grassroots and the licence covers web and marketing use; never a professional stadium standing in for a youth pitch. Images are served from our own domain.

## 9. Content truth

- Only **released** features are presented as available. The source of truth is `roadmap/roadmap.json`: `status: "released"`, or for older work `implemented` with `released_no_later_than`. Planned work appears only in the roadmap teaser and `/roadmap`, labelled as planned.
- The public roadmap comes from `publicRoadmap()` in `scripts/roadmap/lib.mjs` (`public.visible`, `public.no` / `public.en`). Never a second list.
- Privacy and security statements must match what the code and the configuration actually do. Anything legal (GDPR wording, data processor roles, retention) is written or approved by the owner, not inferred by an agent.
- All visible text lives in `messages/no.json` and `messages/en.json` under `marketing.*`. No hard-coded copy in components.

## 10. Accessibility and mobile

- WCAG 2.2 AA: text contrast ≥ 4.5:1 (the palette measures ≥ 6:1), non-text ≥ 3:1, visible focus, skip link, one `h1`, semantic landmarks and headings.
- Targets ≥ 44px; the primary CTA reachable with one thumb at 360×640; no horizontal scroll at 360px.
- Every interactive demo element works with keyboard and screen reader, with a text alternative that says what happened ("Selma inn, Maja ut. Maja har spilt 16 minutter").
- The video has a real button, a visible title, captions (Norwegian and English) and a transcript or text summary.
- Tested at 375×667, 390×844 and 360×640, light and dark, like the app (AGENTS.md §5).

## 11. Decisions log

| ID | Date | Decision |
|---|---|---|
| WEB-01 | 2026-10-27 | Website at `/` and `/no`, app Home at `/play`, one Next.js app, origin and Vercel project (owner, alternative A2). |
| WEB-01 | 2026-10-28 | A2 confirmed: no `play.fairplayr.app` origin (owner). |
| WEB-01b | 2026-10-28 | Creative direction: The Live Experience with cinematic storytelling and refined fintech-grade design (§5). A direction, not a layout; no mockup is the answer key (owner). |
| WEB-01b | 2026-10-28 | Wide creative freedom on the website: photography, advanced motion, CSS-3D, gradients and similar, within the brand and the existing colour tokens (§3, §6, §8). Recorded in DESIGN.md §10 (owner). |
| WEB-01c | 2026-10-28 | Contact `support@fairplayr.app`. No company details until a legal entity exists (owner). |
| WEB-01i/j/k | 2026-10-28 | Privacy and terms P2, promo film P1 and in the first launch, interactive demo P2 and after the first launch (owner). |
| AGENTS.md §6 | 2026-10-28 | Anthropic's `frontend-design` allowed for the website (owner). |
| WEB-01l | 2026-10-28 | Legal clarifications committed, P1: closed before public launch (removing `noindex`, publishing privacy and terms); not a blocker for development (owner). |
| WEB-01g | 2026-10-28 | Search foundation (phase 0): hreflang `nb` for Norwegian (`/no`), English on `/` as `x-default`, canonical always `https://fairplayr.app`. One switch, `WEBSITE_INDEXABLE` in `src/lib/marketing/seo.ts`, stays `false` until launch (noindex, empty sitemap, no `Sitemap:` line). `X-Robots-Tag: noindex` on every response from the exact host `fair-playr.vercel.app`, not from `fairplayr.app` or other hosts. App routes are `noindex` (owner). |
| WEB-01 | 2026-10-28 | The website is prerendered per locale (SSG) and sends no app messages to the browser (owner). Because `/` and `/no` are precached by the worker, `/` must keep answering a plain 200 without a redirect; changing the default language on `/` needs a service-worker change and a two-builds test. |
| — | open | Public tagline and the "One coach. One screen. Zero stress." line. |
| — | open | Default language on `/` and path names per language (English on `/`, English paths on both today). |
| — | open | Theme on the website: art-directed per section, or following the coach's app theme. |
| — | open | Analytics: none at launch is the current rule (§7). |
| — | open | The answers to the legal clarifications in §13.1 (WEB-01l). |

## 12. When the website needs an update

Check this list when a change lands (AGENTS.md §7, WEB-01h). If any line applies, propose a website update in the review patch; do not edit the website as a side effect.

- BRAND.md, the logo, app icons or brand colours changed.
- A roadmap item with `public.visible` changed status (released, new milestone, dropped).
- A user-visible feature was released, renamed or removed.
- Privacy-relevant behaviour changed: what is stored, shared publicly, sent to AI or third parties, or where it is processed.
- A new language, new pricing or payment model, or new sign-in method.
- Screens shown on the website changed visibly (stale screenshots or demo).

## 13. Before public launch

The website is built behind `noindex`. Two separate lists must be closed before `noindex` is removed. Agents work on the technical list; the legal list belongs to the product owner (with a lawyer where needed) and is never answered by an agent.

### 13.1 Legal clarifications (product owner, WEB-01l)

Not development tasks. Each answer feeds the privacy policy and terms (WEB-01i).

1. **Who is responsible.** FairPlayr has no legal entity yet. Who is the controller and the sender of the terms until one exists, and what the pages say about it. No company name, organisation number or address is shown or invented in the meantime.
2. **Roles for children's data.** Whether FairPlayr is controller or processor for player data a coach enters, and who is controller for the children's data: the coach, the team or the club.
3. **Legal basis** for each data category: coach account, players, matches and playing time, attendance, Spond connection, AI summary, public sharing.
4. **Children and parents.** Which rules apply to processing children's names and playing time, and whether coaches must inform parents.
5. **Sub-processors.** Which data processing agreements are in place and which regions are actually used (Supabase, Vercel, Google for Vertex AI and sign-in, Spond, YouTube if used). Confirmed with the providers, not read from the code.
6. **Transfers outside the EEA.** The basis for any transfer to US-owned providers.
7. **Retention and deletion.** How long matches, players and shared links live, and what deleting a team, player or account removes.
8. **Cookies and local storage.** Whether sign-in cookies, local match data and the theme are strictly necessary, and whether playing the film from YouTube or any future analytics needs separate consent under the Norwegian e-communications rules.
9. **Review.** Whether a lawyer reviews the privacy policy and terms before launch.

### 13.2 Technical launch tasks (development)

- Privacy and terms pages built from the owner's approved text (WEB-01i), and a contact route to `support@fairplayr.app` (WEB-01c).
- The film behind a facade: no YouTube request before the visitor presses play (WEB-01j).
- Metadata, canonical and hreflang, `robots.ts`, `sitemap.ts`, Open Graph image, structured data; app routes and the Vercel preview domain kept out of the index (WEB-01g, BRAND-01h). **Done in phase 0:** metadata, canonical, hreflang, `robots.ts`, `sitemap.ts`, app-route `noindex`, `X-Robots-Tag` on `fair-playr.vercel.app`. **Left:** Open Graph image, structured data, a separate meta description per language (in the creative implementation), Turning `WEBSITE_INDEXABLE` on was **done on 2026-10-28** (owner decision: the landing page is searchable before the film, roadmap and legal pages); since then `X-Robots-Tag: noindex` is sent from every host except `fairplayr.app`. Requirement: only the canonical production host may be indexable; every other Vercel host and every preview deployment stays `noindex` (owner decision 2026-10-28).
- Performance budget (§7) and accessibility (§10) measured on the production build.
- Public roadmap texts reviewed (`public.visible`, both languages).
- `noindex` removed on the website only, as its own approved change. **Done 2026-10-28** for `/` and `/no`.
