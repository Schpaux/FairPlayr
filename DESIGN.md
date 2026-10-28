# FairPlayr design system: Modern Sideline

**Status:** approved visual direction, authoritative. **Version:** 1.6 (2026-10-27, BRAND-01): the FairPlayr logo, app icons and brand rules live in [BRAND.md](BRAND.md); the `brand-mark` token (§2.2). Version 1.5 (2026-10-25, C6): match settings before players and a shorter setup (§7.1, UI-MS-01d, C1-F1), per-half custom duration (§7.1, UI-DURATION-01), sided event timeline with icons (§7.2, §8, UI-EVENTS-01), ordinary time + stoppage on the live clock (§5.1, §6.4, UI-LIVE-04), and a dark (canvas) live scoreboard (§5, §5.1, UI-LIVE-05). Version 1.4 (2026-10-20): dark is the default theme (U4), notice band (§5.6, U5), name ladder for identical names (§5.2), the suggestion gap defined and its button kept as «Velg» (§6.2), four tabs with settings under the profile (§7, U8), squad preselection (§7, U9).
This document is the single source of truth for FairPlayr's visual and interaction design (Modern Sideline). The brand itself (logo, variants, app icons, brand colours and their use on the website) is specified in [BRAND.md](BRAND.md), which uses the same colour values and wins on the logo and icons. Where it conflicts with older notes, prototypes, skills or generic design advice, this document wins. Tokens live in [`src/app/globals.css`](src/app/globals.css); design context for agents lives in [`.impeccable.md`](.impeccable.md).

Background and evidence: `design-exploration/modern-sideline/` (prototype v1.1, `FINAL-VALIDATION.md`, `IMPLEMENTATION-PLAN.md`). The prototype is reference material, not spec: where it differs from this document (for example its chalk canvas), this document is correct.

---

## 1. Direction

**"Grass, a club scoreboard and nothing else."** Modern Sideline combines:
- **Football identity on the match surfaces only:** a grass pitch and shirt-number discs on Live and in the Setup lineup, and a club-green panel for the fixture (Home) and the result (match details). On Live the scoreboard sits on the same canvas as the dugout (UI-LIVE-05, 2026-10-25), so the grass is the only colour field on the match screen.
- **Quiet utility everywhere else:** Inter, hairline lists, white surfaces on a near-white canvas, and no decoration.
- **One fixed "what now" slot:** the action strip between pitch and bench always says what happens next.

The user is a volunteer coach on a sideline, outdoors, often one-handed and under mild stress. The emotional goal is **calm control**. Every decision below serves glanceability, mis-tap resistance and fairness.

### Principles
1. **Readability first.** Outdoor light, arm's length, one hand. Text on the live screen is never under 13px, and names are never under 14px.
2. **Lime means "your next action".** If it is lime, it is the thing to tap now. Nothing else is lime.
3. **Club green is identity, not action.** It is used for the fixture panel, the result panel in match details and shirt discs, and is never a button fill.
4. **Calm through hierarchy.** Normal states are silent ("saved" has no indicator). Only exceptions speak.
5. **Predictable placement.** Controls do not move, and the pitch and bench never shift when the strip changes.
6. **Honest structure.** There is no decorative chrome, glow, gradient, glass or ambient motion.

---

## 2. Colour

**Dark is the default theme** (decision U4, 2026-10-20; the app ships with `defaultTheme="dark"`). Light is fully supported and can be chosen in settings; it suits bright daylight. The grass, lime and club green are identical in both modes; only the surfaces change. The live scoreboard is a surface (canvas), so it follows the theme like the dugout.

### 2.1 Surfaces and text

| Token (`--fp-*`) | Light | Dark | Role |
|---|---|---|---|
| `canvas` | `#F9FAF8` | `#121B16` | Page background (near-white, not beige) |
| `surface` | `#FFFFFF` | `#1A2620` | Cards, list groups, bench tiles, strip, sheets |
| `surface-2` | `#F1F3F0` | `#233229` | Pressed/quiet fills, disabled buttons |
| `surface-3` | `#E7EAE6` | `#2A3A31` | Stronger quiet fill |
| `rule` | `#E3E6E2` | `#2C3C34` | Hairlines, card borders, input borders |
| `rule-strong` | `#C9CEC8` | `#43574C` | Outlines, grab handles (decorative; below 3:1) |
| `control-line` | `#848E86` | `#6A7E72` | Outlines that identify a control (secondary button). At least 3:1 on canvas, surface and surface-2 (WCAG 1.4.11) |
| `ink` | `#111A15` | `#EEF1EA` | Text |
| `ink-2` | `#4A564F` | `#A4B3A9` | Secondary text |

**The light theme is near-white `#F9FAF8` with white surfaces and subtle neutral borders.** The earlier beige "chalk" canvas (`#F2EFE7`) is rejected as a page or surface colour. Chalk survives only as *text and lines on green* (`on-club`, `on-tag`, pitch lines), where it reads as paint on grass, and as the logo on the dark canvas (`brand-mark`, BRAND.md §3).

### 2.2 Identity and action

| Token | Value (both modes unless noted) | Role |
|---|---|---|
| `club` | `#0E4D33` | Fixture panel (Home), result panel (match details). Never a button fill. Not used on the live scoreboard since UI-LIVE-05. |
| `on-club` / `on-club-2` | `#F2EFE7` / `#B7CCBE` | Text on club green (primary / secondary; never grey) |
| `club-disc` | `#0E4D33` · dark `#1D6345` | Shirt discs off the pitch |
| `lime` / `on-lime` | `#9FE870` / `#0B2E1A` | Next action: primary button, selection, suggestion, undo countdown |
| `focus` | `#0E4D33` · dark `#9FE870` | Focus ring |
| `brand-mark` | `club` · dark `on-club` (`#F2EFE7`) | The FairPlayr logo only (BRAND.md §3); never lime |

### 2.3 Pitch

| Token | Light | Dark |
|---|---|---|
| `grass` / `grass-stripe` | `#2E6A45` / `#2A6340` | `#1E4B31` / `#1B452D` |
| `grass-line` | chalk at 42 % | chalk at 30 % |
| `disc` / `on-disc` | `#FFFFFF` / `#0E4D33` | `#F2EFE7` / `#0E4D33` |
| `tag` / `on-tag` | `#0B2A1C` / `#F2EFE7` | `#0A1C13` / `#F2EFE7` |
| `keeper` / `on-keeper` | `#F3D36A` / `#2A2100` | same |
| `ring-fresh` / `ring-watch` / `ring-act` | `#F2EFE7` / `#F2B54E` / `#FFA899` | same |

### 2.4 Status text

| Token | Light | Dark | Use |
|---|---|---|---|
| `warn-text` | `#8A4A00` | `#F2B54E` | Below fair share (−6) |
| `danger-text` | `#B3261E` | `#FF8A7A` | End match now, destructive copy |
| `ok-text` | `#1E6B3F` | `#9FE870` | "Lineup ready" |

Destructive button fill: `#B3261E` with white text in light mode (6.5 : 1), and `#D03238` with white text in dark mode.

### 2.5 Rules
- **Lime is never text on a light surface.** It is only a fill, a ring or an underline, always with `on-lime` ink on top.
- **Never grey text on green.** Text on club green uses `on-club-2`.
- **Status is never colour-only.** Fatigue uses arc length, selection uses scale and outline, and offline uses a glyph. A selected choice chip (format, formation, duration) carries a check mark left of its label in `on-lime`, decorative (`aria-hidden`) next to `aria-pressed`; the chip is the same size in both states (C1-F3). An absent player in the attendance grid says «Borte» on screen and in its accessible name (C1-F6).
- **No glow, gradients, blur or glass.** The legacy `.glow-*` utilities and `--glow-*` tokens were removed in UI-TOKENS-01 (B3). The one exception is functional: the bench rail's edge fade (`transparent` → `canvas`), which shows that players continue off-screen (§5.3).

### 2.6 Measured contrast (WCAG 2.x)

| Pair | Light | Dark |
|---|---|---|
| ink on canvas | 16.96 | 15.41 |
| ink-2 on canvas | 7.33 | 8.04 |
| ink-2 on surface-2 | 6.88 | 6.15 |
| warn-text on surface | 6.86 | 8.57 |
| danger-text on canvas | 6.24 | 7.68 |
| on-lime on lime | 10.04 | 10.04 |
| focus on canvas (non-text, ≥ 3) | 9.43 | 11.93 |

Non-text fatigue rings are at least 3.5 : 1 on grass.

---

## 3. Typography

**Inter** is used for every word in the UI, headings included. **Barlow Condensed 600** is used for **match numerals only**: score, clock and shirt numbers, never words. Urbanist, Geist and Wise Sans are not used.

| Role | Spec | Used for |
|---|---|---|
| Display | Inter 700 30/1.1, −2 % | Fixture opponent, sheet hero |
| Title | Inter 600 20/1.2, −1 % | Screen and sheet titles |
| Body strong / body | Inter 600 / 400, 16 | Lists, sheet copy, strip main line |
| Name | Inter 600 15/1.15 | Names on pitch and bench, up to 7v7 |
| Name, compact | Inter 600 **14**/1.15 | 9v9 / 11v11. **This is the floor for names.** |
| Meta | Inter 500 14 | Secondary info |
| Label | Inter 600 13, caps, +6 % | Section kickers, form-field labels, score team codes |
| Tab label | Inter 600 13/1.25 (700 on the active tab), sentence case; wraps, never truncates | Bottom-nav tab names (C2-F1) |
| Key figure | Inter 700 20/1.25, tabular | Season numbers on Home (Kamper, Balanse, Siste); a missing value is Inter 600 16 in `ink-2` (C2-F1) |
| Minutes | Inter 700 15 (token) / 14 (bench), tabular | Total playing time |
| Score | Barlow Condensed 600 50/0.9 (44 on short screens) | 2 – 1 |
| Clock | Barlow Condensed 600 40/0.9 (34 on short screens) | 16:20; in stoppage `30+2:13` (§5.1) |
| Shirt number | Barlow Condensed 600 22 (19 compact) | Discs |

Implementation:
- Inter is loaded via `next/font/google` (self-hosted at build, `latin` + `latin-ext`), exposed as `--font-inter`, and maps to `--font-sans`, `--font-heading` and `--font-display`.
- Barlow Condensed 600 is **bundled locally** at `src/app/fonts/barlow-condensed-600-latin.woff2` (SIL OFL, licence alongside) and loaded with `next/font/local` as `--font-barlow-condensed`. Use it through `--font-num` or the `.font-num` utility (tabular figures). It has `display: block` and is not preloaded until the live scoreboard uses it.
- Short viewports change spacing, never type size.

---

## 4. Space, shape and motion

- **Spacing:** 4px base (4, 8, 12, 16, 20, 24, 32), with a 16px gutter. Live-screen gaps are 4 / 6 / 8 / 12.
- **Radius:** 6px for tags, 10px for bench tiles and inputs, 14px for list groups and the setup pitch, 20px for the fixture panel, dugout and sheets. **Every button is a pill.**
- **Targets:** at least 44px. Player tokens are at least 52 × 70, bench tiles are at least 44 × 44 (50px tall on tall phones), and goal keys are 48px.
- **Elevation:** flat. Surfaces separate by `surface` on `canvas` plus a 1px `rule`. Sheets use a scrim, not a shadow stack.
- **Motion** (all `cubic-bezier(0.22, 1, 0.36, 1)` unless noted):

| Name | Duration | Use |
|---|---|---|
| press | 90ms | `scale(.97)` on any control (`.94` on discs) |
| quick | 140ms | Fades, target halos |
| base | 220ms | Strip message change (6px rise and fade) |
| sheet | 260ms | Sheet slide-up |
| land | 360ms, `cubic-bezier(0.16, 1, 0.3, 1)` | Swapped-in token lands; no bounce |
| undo | 5000ms linear | Undo countdown bar |

- There is no ambient motion: no pulsing, breathing or glow. Critical fatigue is a tinted ring track, not a pulse.
  - **Exception (FEAT-SHARE-01, public match page only):** the LIVE badge on the public match page (`/s/<token>`) has one small red dot that fades slowly (`.fp-live-pulse`, opacity 1 → 0.35, 2s, ease-in-out) while the match is shared live. Nothing else on that page moves, and the exception does not extend to the coach's app (live screen, setup, history and details stay without ambient motion). The word «LIVE» carries the state; the dot is decoration (`aria-hidden`). With `prefers-reduced-motion` the dot is solid.
- `prefers-reduced-motion`: all transforms and transitions go to 1ms. The undo countdown stays, because it carries information, and it also shows its seconds as a number.

---

## 5. Live screen

Full screen, with no global header or bottom nav and no scrolling. It is portrait-first. Landscape is a two-column fallback (pitch left, board and dugout right), not a design target.

```
┌ Scoreboard (canvas, runs under the status bar) ────┐  ~140px (~120 short)
│ (⏸) 16:20             2 – 1              ⋯          │
│     ● 1. omgang · av 25:00   BK    LYN              │
│ [ + Mål for oss ]  [ + Mål for Lyn ]                │
├ Pitch (flex: 1, edge to edge) ──────────────────────┤  everything left over
╭ Dugout (canvas, 20px radius, overlaps grass 18px) ─╮
│ [ Action strip: the one place that says what next ] │  60px (54 short)
│ [Frida][Ida][Selma][Vilde]   bench, least-played 1st│  1 row 44px · 2 rows 92px (3 rows 158px tall)
└─────────────────────────────────────────────────────┘
```

### 5.1 Scoreboard
- **Surface (UI-LIVE-05, 2026-10-25):** `canvas`, the same background as the dugout, in both themes (dark by default, near-white in light). Text is `ink`, secondary text `ink-2`, the focus ring is `focus` (as everywhere else). This replaces the earlier club-green scoreboard; club green stays on Home's fixture panel and the match-details result panel. A 1px `rule` under the goal keys separates the board from the grass.
- **Clock key** (left): a 44px play/pause disc plus the clock, as one button. When paused, the disc is lime, the digits are dimmed (`ink-2`) and the status dot is hollow. At half-time and full-time it shows a flag outline and is inert. The clock keeps running past the half's length, because **the referee ends the half, not the app**.
- **Display clock (UI-LIVE-04):** the clock follows the match's ordinary timeline, half by half, and never shows stoppage as ordinary time:
  - First half (or a one-period match) from `00:00` up to the half length (`15:00` in 2 × 15).
  - Second half from the half length (`15:00`) up to the full length (`30:00`), however much stoppage the first half had (§6.4).
  - **Stoppage:** after the half's ordinary end the clock shows the ordinary end in whole minutes, a plus and the stoppage as `m:ss`: `15+2:13` in the first half, `30+10:00` ten minutes after full length. The ordinary part never grows; the stoppage part counts on. There is no space around the plus, so it fits 360px at 40px Barlow.
  - Half-time and full-time freeze the clock where the half ended (`15+2:13`, `30:00`).
  - Accessible name: the clock button says the time in words, «15 minutter pluss 2 minutter 13 sekunder overtid» (`matchLive.sideline.clock.stoppage`); the digits are hidden from assistive tech.
  - Presentation only. Elapsed time, playing time, stint rings, the time-up strip (§5.4 row 6) and the minute stored on events are unchanged.
- **Meta line:** phase and length ("1. omgang · av 25:00"). When offline, an amber wifi-off glyph replaces the status dot. "Saved" is silent.
- **Score:** condensed numerals over 13px caps team codes, in `ink`. It is a display, not a control.
- **Goal keys:** two equal 48px pills with words ("Mål for oss", "Mål for Lyn"). Ours is filled (`ink` with `canvas` text) and theirs is outlined (`control-line`, `ink` text). They are **never lime**, because a goal is not a suggestion. They are real `disabled` buttons outside `first_half`/`second_half`.
- **Menu ⋯:** a 44px icon button. It is the only route to the event history and goal correction, end half, leave, and end match.

### 5.2 Player token (one spec in setup and live)
- **Disc** with the shirt number: 44px, or 36px compact (≥ 9 on the field). It is `disc` on grass. The keeper uses `keeper` with a small "K" badge. **No shirt number → two initials.**
- **Name tag** below: `tag` fill, display name plus **total match minutes** (Inter 700, tabular). On one line up to 7v7, stacked in compact. The tag width is capped by the gap to its neighbour.
- **Stint ring (D1):** the arc shows **continuous playing time since the player last rested**, as a share of one half. It resets on coming off and **at half-time**. It is `ring-fresh` < 60 %, `ring-watch` from 60 %, `ring-act` from 75 %, with the track tinted from 85 %. The keeper's ring never escalates. The ring carries no number; the exact stint minutes appear in the strip on selection. **Total match minutes stay the prominent number.**
- **States:** selected (lime disc and tag, scale 1.08), valid target (dashed chalk halo), suggested out (2px lime outline on the tag), just swapped in (360ms land).
- **Display names:** first name; on a clash, first name + surname initial; then the shortest unique surname prefix ("Emma Han" / "Emma Hau"). Each player gets the shortest form that tells them apart, so "Emma Berg" stays "Emma B" next to them. Same surname with different middle names uses the shortest unique prefix of everything after the first name ("Ida M" / "Ida S"). Identical full names use first name + shirt number ("Emma #7" / "Emma #12"); only without a distinguishing number does a counter ("Emma (2)") appear, as a last resort. Never a bare number suffix ("Emma H2"). The ladder is built from the match squad (`buildDisplayNameMap`, `src/lib/utils/playerName.ts`) and used on pitch, bench, scorer sheet and event history; stored names and ids are unchanged. Cut order: stack first, then cut the first name ("E… Hau"), never what follows it.
- **Placement:** formation lines are spread evenly over a token-safe box, and rows never collide.

### 5.3 Bench (FP-MS2.1-B2: Alternative C, the "fairness rail")
Implementation: `src/components/live/Bench.tsx`, `benchLayout.ts` and `src/domain/benchOrder.ts`. Evidence: `design-exploration/modern-sideline/bench-review/final-c/`.

**Order.** Substitutes are shown **least-played first**, at every squad size (1 or 15 alike).
- The key is **total match minutes as displayed** on the tile (whole minutes). Hidden seconds and the stint ring are never used, so the order is explainable from what is on screen.
- Equal minutes keep **squad order** (`setup.selectedPlayerIds`), so at kick-off the bench looks as it always has. The sort is stable and deterministic and never mutates the squad.
- The guarantee for a rail: a player off-screen never has fewer minutes than a visible one (ties may straddle the edge, in squad order).

**Holding the order.** The bench never moves under the coach's finger. The order is **held** while a pitch player is selected, a bench or position drag is active, "Bytt plass" waits for its partner, an undo window (substitution or position swap) is open, or a finger is on, or the rail is still scrolling, the bench.
- While held, a player who comes off takes **the exact slot** of the player who went on; nobody else moves.
- When the hold ends, the bench re-sorts **once**, as a `base` (220ms) slide (none with reduced motion). If somebody joined or left the bench meanwhile, the rail returns to its start, where the least-played now are. It never jumps while a finger is down or the rail is moving.
- Every tap, drag and drop resolves through the player id, never a position in the list.

**Layout.** Column by column, so the least-played fill the first column from the top. In order of preference:
1. **One row** when everyone fits (5 subs on every tested phone);
2. **two rows** (three from 780px tall) when that fits, with tile sides stepping 10 → 7 → 5px before giving up (8 subs at 360 × 640 need 5px);
3. otherwise a **horizontal rail** with the most rows allowed.

The bench is never more than two rows on phones under 780px tall, so the pitch keeps or gains height against the previous bench (measured: +4 to +62px). Rows are 44px (50px on tall phones) with a 4px gap. Names are **never cut** and never ellipsised.

**Tile.** Display name (Inter 600 14, no truncation) over **total minutes** (Inter 700 14, tabular). The shirt number is in the accessible label, not on the tile. At least 44 × 44. Duplicate names use the ladder from §5.2 ("Thea So" / "Thea St"). The fair-share gap ("−6") is not shown yet.
- **States:** selected (lime fill), valid target (2px ink outline), suggested in (2px lime outline), dragging (35 % opacity), just swapped out (lime flash fading over 420ms).

**Rail.** When not everyone fits:
- The rail bleeds to the dugout edge, snaps to whole columns, and fades (40px, to `canvas`) on whichever edge hides players.
- **"+N ›"** (right) jumps to the end; **"‹ N"** (left) jumps back to the start. N is the number of substitutes that are not one tap away on that side (off-screen or under the fade). They are 32px `ink` pills with 44px hit areas, real buttons (mouse, touch, keyboard), labelled from `messages/*.json`, and shown only when N > 0. They carry no minute range.
- Measured, 7v7 on short phones: 6 substitutes stay one tap away with 9–15 subs. The last is one swipe away (9–11 subs) or three swipes (15), and always two taps with "+N".

**Touch direction lock.** On a rail, tiles allow horizontal panning (`touch-action: pan-x`, otherwise `none`). For touch and pen, the first 6px of movement decide, before the 8px drag threshold:
- mostly sideways → the gesture scrolls the rail. It never starts a drag, never drops a pitch selection, and its release never substitutes;
- mostly vertical → the existing bench-to-pitch drag.

A mouse is never locked. A bench that fits keeps today's behaviour (any move past 8px is a drag).

### 5.4 Action strip
Product name: **FairPlayr Next** (FEAT-NEXT-01). It is a feature of the live view, not the design language; Modern Sideline is the design language.

A single slot that shows exactly one message, in this priority order (copy is indicative; final strings live in `messages/*.json`):

| # | State | Small line | Main line | Button |
|---|---|---|---|---|
| 1 | Undo (5 s) | "Bytte i 17. minutt" / "Mål i 17. minutt" | "Selma inn · Maja ut" / "Mål: Frida" | **Angre 5** (outline). The strip turns club green, with a lime countdown bar. |
| 1b | Undo, position swap (5 s) | "Byttet plass" | "Emma ↔ Ola" | **Angre 5**, as row 1 (§6.1.1) |
| 1c | Dragging | the dragged player's name | "Slipp på spilleren som skal ut" (bench drag) / "Slipp på en spiller for å bytte plass" (pitch drag) | — |
| 2 | Selection | "Maja · 16′ totalt" | "Velg innbytter" / "Ingen på benken" | **Bytt plass** (secondary) + a compact ✕ (44 px, label "Avbryt valget av Maja"). Tapping the player again or the grass also cancels. With no other pitch player: Avbryt. The instruction is short so that both controls fit at 360 px without truncation. |
| 2b | Position swap | "Bytt plass med Maja" | "Trykk en spiller på banen" | Avbryt |
| 3 | Pre-kickoff | "Klar" | "Start kampen når dommeren blåser" | **Avspark** (lime) |
| 4 | Half-time | "Pause · 2–1" | "Bytt nå, uten klokke" | **Start 2. omgang** (lime) |
| 5 | Full-time | "Slutt · 2–1" | "Kampen er ferdig" | Ferdig |
| 6 | Time up | "25:00 er spilt" | "Tiden er ute" | Avslutt omgang (outline → confirm) |
| 7 | Suggestion | "Forslag · 4′ mot 16′ spilt" | "Selma inn for Maja" | **Velg** (lime): selects the outgoing player; the coach then taps the substitute (§6.2) |
| 8 | Idle | "Tallet er total spilletid. Ringen er tid siden siste hvile." | "Trykk en spiller, så en på benken" | — |

With an empty bench, the idle line reads "Ingen innbyttere".

### 5.5 Sheets
- They slide up with a `canvas` fill, a 20px top radius, a grab handle and a 20/600 title. They are `role="dialog"`, labelled, take focus, and return focus to the invoking control.
- Menu rows are 54px in **three separated groups**: match actions; leaving; and the dangerous "end match now". Destructive actions never sit next to routine ones.
- **Confirmation:** the primary action states the outcome ("Ja, avslutt omgangen"), and the secondary is always "Fortsett å spille". **Ending the match** (from the menu, or from the strip in the last half) uses the same sheet with the score and the clock in the lede ("Stillingen er 2–1 ved 30+1:05. Spilletiden stopper og kampen lagres."), a destructive "Ja, avslutt kampen" and "Fortsett å spille"; it is never a native browser dialog (UI-A11Y-02).
- **Event history** (⋯ → Hendelser) uses the event timeline (§7.2), newest first.
- **Scorer sheet:** the existing production rules apply (only when reports are enabled; scorer, then assist; auto-advance after 10 s, shown with the same drain bar as undo). Two columns of 52px pills, outfield first and the keeper last, plus "Hopp over". Tapping the scrim does not dismiss it.

### 5.6 Notice band (U5, transient)
A small, discreet, temporary message for exceptions that the coach should know about but not act on at once: "the app was closed for 7 min, the clock kept running" (OFF-01a B9), or a storage problem.
- **Placement:** over the top edge of the pitch, directly under the scoreboard. It **never covers critical match controls**: the scoreboard (clock, score, goal keys, menu), the action strip and the bench stay fully visible and tappable. It may cover grass, and the token closest to the top edge must stay tappable (the band shrinks or the message moves into the menu rather than cover it).
- **Look:** `surface` fill with a 1px `rule`, 10px radius, Inter 500 14 in `ink`; a glyph plus words (never colour only); `warn-text` glyph for warnings. No lime (it is not an action), no shadow, no blur.
- **Behaviour:** one at a time; `role="status"` (polite), errors `role="alert"`; enters with `quick` (140ms fade), and with reduced motion it simply appears. It never takes the strip's place: the strip remains the only "what now".
- **Dismissal:** only passive info (info or success tone, no action, also available elsewhere, such as "the app was closed for 7 min") goes away after 8 s, with the timer paused while hovered or focused. **Warnings, errors (a storage failure, a persistent sync error) and notices that ask for an action never go away on their own**: they stay until the condition is resolved or the coach dismisses them. `Notice` enforces this (`autoDismissMs` is ignored for them).
- A condition that must keep speaking until it is resolved (for example a failed save) also keeps a glyph in the scoreboard meta line and an explanation in the menu after the coach has dismissed the band.

### 5.7 Buttons
- Pills, 52px (or 44px small). **Primary:** lime fill with `on-lime`. **Secondary:** 1.5px `control-line` outline with ink text, drawn as an inset ring (`box-shadow`) over a transparent border: Chromium snaps border widths to whole CSS pixels, so a 1.5px border renders 1px at every density, and the transparent border keeps an outline in forced-colors mode (UI-BORDER-01). **Destructive:** red fill with white text, only inside its confirmation.
- **Disabled:** `surface-2` fill with `ink-2` text, and a real `disabled` attribute.
- Pressed state: `scale(.97)` for 90ms. Hover applies only on pointer devices and is a fill shift, never a scale-up.

---

## 6. Interactions

### 6.1 Substitution
- Tap pitch → bench, **or** bench → pitch. Valid counterparts are marked. Tapping the same player again, or Avbryt, cancels. Tapping another player on the same side moves the selection.
- **Drag-to-swap is preserved as a secondary path (D4).** From a bench rail, start the drag upwards: a sideways start scrolls the rail instead (§5.3, direction lock).
- After a swap: the token lands, the bench tile flashes, both stint rings reset, and the strip shows the 5 s undo.
- **Starting another selection during the undo window confirms the previous substitution and begins the new one (D3).** The coach never waits for the countdown, dismisses it, or confirms anything extra:
  - What starts a new interaction: a tap on a pitch player (that same tap selects it), or a bench or pitch drag once it has passed its drag threshold. The same holds in a position-swap undo window (row 1b).
  - What does not: pressing without moving, a sideways rail swipe, a tap on the grass, and the click a browser fires after a drag or swipe ends. These leave the window and its countdown untouched.
  - The new change opens its own 5 s window. Only the most recent change can be undone; every confirmed substitution stays in the event history and keeps its minutes. Undo stays targeted (it never restores a snapshot) and the 5 s deadline is hard.
  - The bench order stays held from the first change to the end of the last window, then re-sorts once (§5.3).

### 6.1.1 Position swap (B1)
Two players on the pitch exchange positions. **It is not a substitution**: no event is logged, total minutes and the stint ring are unchanged, and nobody goes to or from the bench. Both methods below are approved and **neither is optional (D7)**.

1. **Tap:** tap a pitch player → **Bytt plass** in the strip (the ✕ beside it cancels the selection) → every other pitch player gets the dashed target halo (the bench does not) → tap one of them. Tapping the source again, the grass or **Avbryt** cancels; a bench tap does nothing in this mode.
2. **Drag:** press a pitch player and drag (touch or mouse; it starts after a 12px move, so ordinary taps are unaffected). The player follows the finger as the lime ghost, its own token dims, every other pitch player shows the dashed target halo, and the one under the finger gets a solid lime halo. Release on another pitch player to swap. Releasing on grass, the bench, the player's own slot, or anywhere else cancels with no change, and the release never also selects a player.

- **One domain operation.** Both methods call the same `swapLivePositions` (`src/domain/positionSwap.ts`): both slots must be in the current formation and hold on-field players, otherwise nothing changes. It works in every format, and swapping into the first slot makes that player the keeper (the K badge moves with the slot).
- **Undo.** The strip shows the 5 s undo (row 1b) and both tokens land. Undo is **targeted**: it reverses those two slots only, and only while they still hold the swapped pair. A goal or clock change made inside the window is kept.
- **Persistence.** The swap is saved on the device like any live change, offline too. Slot assignments travel with the debounced runtime-state sync; there is no server event to reconcile.
- **Routing a drag by what it is dropped on:** pitch player → occupied pitch slot = position swap; bench → pitch = substitution (unchanged); pitch → bench = no change (not a substitution path); pitch → empty or invalid area = no change.

### 6.2 Fairness suggestion (D2)
- **Out:** the outfield player with the most total time (the keeper is excluded: the player in the formation's first slot; 3v3 has no keeper). **In:** the bench player with the least total time.
- It is shown **only when the gap is at least 4 minutes**: the outgoing player's total time minus the incoming player's total time, the two numbers the strip shows ("Forslag · 4′ mot 16′ spilt"). So there is never a suggestion right after kick-off (0′ vs 0′). The threshold is a configurable parameter (`minGapSeconds`, `DEFAULT_SUGGESTION_MIN_GAP_SECONDS` = 240 in `src/domain/substitutionSuggestion.ts`); there is no settings UI for it yet. (Fair share, field slots × elapsed time ÷ available squad, is the bench tile's "−6" gap in §5.3 and §9, not this threshold.)
- The strip button is **Velg**, not a one-tap **Bytt**. Tapping it selects the suggested outgoing player (exactly as if the coach had tapped that token). The coach then taps the substitute, the suggested one or any other, and the normal substitution and 5 s undo follow. **This deliberately differs from the one-tap flows elsewhere** (undo, half-time, position swap): the coach decides and the app suggests (AGENTS.md §2), so a suggestion never performs a substitution by itself (decision 2026-10-20).

### 6.3 Goals and goal correction
The scoreboard, goal attribution, stored match events and cloud sync must agree at all times. **The score is derived from goal events.** It is never edited as an independent counter.

1. **Quick actions.** "Mål for oss" records a goal immediately (offline too), rolls the digit, and opens the scorer sheet when reports are enabled. "Mål for <motstander>" records the goal and goes straight to undo.
2. **Undo last goal.** After any goal, the strip offers **Angre** for 5 s. Undo removes that specific goal event (by id) locally *and* on the server, along with its scorer and assist.
3. **Correct older goals through the event history.** ⋯ → **Hendelser** lists goals (and substitutions) with minute, side, scorer and assist. Each goal can be **re-attributed** (scorer and assist) or **removed** after a confirmation that states the result ("Fjern målet i 17. minutt? Stillingen blir 1–1"). Corrections are always explicit and per event.
4. **Rejected:** free score steppers ("Korriger resultat" ±). They let the score drift from the events and from the report.
5. **Offline:** every correction applies locally at once and is queued for the server. Queued creates, patches and deletes are replayed in order and idempotently when connectivity returns.

> Implementation status: today's `handleTeamScore(-1)` / `handleOpponentScore(-1)` remove only the *local* event and leave the server event row in place. Goal events created offline are never sent. Goal correction must not ship until server reconciliation exists; see the foundation report.

### 6.4 Clock and halves
- Pre-kickoff is a state: the clock waits, the goal keys are disabled, and the strip offers **Avspark**.
- End half: ⋯ or the strip → confirmation → half-time. The clock freezes, the goal keys are disabled, substitutions still work, and the strip offers **Start 2. omgang**.
- The second-half display clock starts at the half length (20:00 for 2 × 20), even when the first half had stoppage, and stoppage shows as ordinary time plus stoppage (§5.1). This is presentation only; accounting is unchanged.
- One-period matches are supported.

### 6.5 Offline
The live screen behaves identically offline. The only visible change is the amber glyph in the scoreboard meta line, and the menu explains it in words.

---

## 7. Other screens
- **Home:** quiet lists plus **one** club-green fixture panel (with a faint centre-circle arc at 14 % stroke, the only decorative geometry in the system) and a lime CTA. Season stats are inline numbers, not hero-metric cards.
- **Setup:** see §7.1.
- **Lists:** hairline-separated rows on `surface`, with no nested cards.
- **Bottom nav:** four tabs (Hjem, Spillere, Kamp, Historikk) with a lime pill on the active one. **Settings live under the profile menu**, not in a tab (U8). It is absent on Live.
- **Team in the header (C2-F2):** with one team the header shows the team name as plain text (no picker); the picker appears from two teams.
- **Header on narrow screens (BRAND-01):** the 150px logo never shrinks. Next to it the team name stops at two lines, and below `sm` the offline indicator is the amber glyph alone (the word stays in its live region for screen readers), so a long team name, the offline state and the profile button fit at 360px.
- **Live state screens (UI-LIVE-03):** loading, error, recovery and "no match" on `/match/live` use the same full-screen canvas as Live (no header, no bottom nav), a centred column, 20/600 title, 16px body in `ink-2`, errors at 16px in `danger-text` with a glyph, and pill buttons (§5.7). Loading is a quiet skeleton, never a spinner over the pitch.

### 7.1 Setup (UI-MS-01a, revised by UI-MS-01d and C1-F1, 2026-10-25)
The order is what the coach decides first: **the match, then who is here, then the lineup.**
1. **Kamp** card: one summary line ("7v7 · 2-3-1 · 2 × 18 min · Oppsummering på") with **Endre**. Opened, it shows format, formation, halves and duration, and the report switch. Team defaults fill it, so most matches never open it.
2. **Hvem er med i dag?** compact attendance: one 44px name chip per player, wrapping several per row (no disc, so 11 players fit in about three rows at 375px). Present: `surface`, 1.5px inset `control-line` outline, a lime check disc before the name. Absent: `surface-2`, name in `ink-2` followed by «Borte» in words; the accessible name is «Ida, borte» (C1-F6). The name ladder runs over the whole team. «Velg alle» and «Tøm» stay.
3. **Startoppstilling:** the setup pitch (same token, markings and orientation as Live, FP-PITCH-01) and the bench of present players who are not on the pitch, right under it, so a tap on the bench and a tap on the pitch are on one screen.
4. **Sticky bar:** one row above the bottom nav: squad and pitch count (two short lines, with "Klar"/"Ikke klar" as glyph plus word) on the left and **Start kamp** (52px pill) on the right. The reason Start is locked is its description; while the match starts, focus moves to the bar's status line ("Starter kampen …") so it never falls to the page (C1-F2).
- **Squad preselection (U9):** when appropriate (for example a new setup for the active team), the whole squad starts as present, so the coach only removes who is absent. Attendance stays visible and editable until **Start kamp**; nobody accrues playing time before the match is started, and only the players in the started squad are in it. A preselected player who is absent must never get minutes by accident.
- **Duration (UI-DURATION-01):** "Omganger" (2 omganger / 1 periode), preset chips, and a custom field with a visible label: **«Minutter per omgang»** with two halves (2 × 18 is typed as 18) or **«Minutter»** with one period. The field keeps exactly what the coach types; a whole number in range (3–120 per half, 5–240 for one period; the match is always 5–240 minutes) is applied at once, anything else shows an inline error under the field and is not applied. Leaving the field with an invalid entry restores the last applied value. Switching halves keeps the total.
- **Planner fields (C1-F4):** every text field has a visible 13px caps label above it; placeholders are examples only.

### 7.2 Event timeline (UI-EVENTS-01, 2026-10-25)
One presentation for the live event history (§5.5) and the match-details timeline. It replaces the neutral, icon-free rows from C4.
- **Sides:** the minute leads every row (Inter 600 14 tabular, "17′", a 44px column); our events follow it on the left, start-aligned, and the opponent's sit at the right edge, end-aligned. A centred minute was tried and rejected: at 360px it left about 105px per side and broke long names mid-word. Substitutions are always ours.
- **Icons and words:** a 20px glyph (§8) before the words: a goal net for goals, a two-way arrow for substitutions. The words carry the meaning; the icon only speeds up scanning.
- **Weight:** goals are Inter 700 15 (`ink`); substitutions are Inter 400 14 (`ink-2`). A goal without a registered scorer says "Mål" in the same weight.
- **Scorer and assist on one line:** "**Frida** · assist Ida". The opponent's goal says "**Mål** · Lyn". A substitution puts "Thea inn" and "Maja ut" on two lines, so a long name wraps within its own line.
- **Long names wrap** at word boundaries inside their side (`overflow-wrap: anywhere` only as a last resort); they are never truncated, ellipsised or allowed to overflow at 360px. Names use the ladder (§5.2) where the squad is known.
- **Order:** chronological. Live lists newest first (the latest goal is the one most often corrected); match details lists from kick-off.
- **Accessibility:** each row has one text alternative in reading order ("17. minutt, mål for oss: Frida, assist Ida"); the visual columns are hidden from assistive tech. An editable row (our goals in match details) is one button with the pencil glyph on the free side and the label "Rediger".
- **Goal minute (C4-F5):** editing a goal accepts an empty minute or a whole number from 0 up; there is no upper limit, because stoppage is legitimate. Anything else is an inline error, and nothing is saved.

---

## 8. Iconography
A 24 grid with 1.75 stroke and round caps and joins (lucide-compatible). Icons only appear next to a word, except ⋯, play/pause and the offline glyph, which have `aria-label`s. In the event timeline (§7.2) a type glyph sits before the names (lucide `Goal` for a goal, `ArrowLeftRight` for a substitution); the row's text alternative names the type in words.

---

## 9. Accessibility and viewports
- **Validated live viewport: 375 × 667 portrait (D6).** 390 × 844 is the reference design size. **360 × 640 Android is an explicit follow-up that must pass before broad release.** Below 360 wide is best-effort.
- Hit areas are at least 44px, live text is at least 13px and names at least 14px, with no horizontal overflow at any supported size.
- One persistent `aria-live="polite"` announcer gets one message per action. The score has its own polite region in the scoreboard, so a goal or a removed goal is said as the new score ("Stilling: oss 2, dem 1"), UI-A11Y-03. Token labels include name, keeper status, total minutes, stint minutes and a fatigue word. Bench tiles include the fair-share gap.
- Not yet validated: real sunlight, VoiceOver order, Dynamic Type and Bold Text, real devices. This needs a device pass before the live UI flag flips.

---

## 10. Decisions log

| ID | Decision |
|---|---|
| D1 | The ring is continuous playing time since last rest, reset at half-time. Total match minutes remain the prominent number. |
| D2 | A suggestion is shown only when the fairness gap is ≥ 4 minutes. The threshold is configurable. |
| D3 | Starting another selection during undo confirms the previous substitution and begins the new one. |
| D4 | Drag-to-swap is preserved as a secondary interaction. |
| D5 | Optional player nicknames are deferred. |
| D6 | 375 × 667 is the validated initial live viewport. 360 × 640 Android is a follow-up before broad release. |
| D7 | Position swaps on the pitch support **both** tap ("Bytt plass", then the other player) **and** drag-and-drop. Both use one domain operation and the same targeted 5 s undo, and never create a substitution (§6.1.1). |
| C1 | The light canvas is near-white `#F9FAF8` with white surfaces and neutral borders; beige `#F2EFE7` is no longer a surface colour. |
| C2 | Goal correction: quick goal keys, undo last goal, correct older goals via event history; the score is derived from events and kept consistent with the server. |
| U4 | Dark is the default theme; light stays fully supported (2026-10-20). Supersedes "light is the default". |
| U5 | A small transient notice band under the scoreboard (§5.6); it never covers critical match controls. |
| U8 | Four bottom-nav tabs; settings via the profile. |
| U9 | Preselect the squad where it fits, without ever giving unintended players playing time. |
| C2-F1 | Bottom-nav tab labels are 13px (600, 700 when active) and Home key figures are 20px 700 tabular; both are typography rows in §3, so 13px is no longer reserved for caps labels (2026-10-22). |
| B5 | A selected choice chip shows a check mark as well as the lime fill, in setup, team defaults and `/lineup` alike (C1-F3, 2026-10-22). |
| MATCH-09 | The suggestion never names the keeper and needs a 4′ gap between the pair (§6.2), 2026-10-20. Its button is **Velg** (selects the outgoing player), deliberately not a one-tap **Bytt**: the coach completes the substitution. |
| UI-MS-01d | Setup order is match settings, attendance, lineup (§7.1); supersedes "attendance first" from UI-MS-01a. Attendance is compact name chips, and the report switch moves into the match card (C1-F1), 2026-10-25. |
| UI-DURATION-01 | Custom duration is typed per half with two halves; the field keeps the typed text and applies only valid values. Domain limits (5–240 min) are unchanged (2026-10-25). |
| UI-EVENTS-01 | Sided event timeline with type icons, scorer and assist on one line and bold goals, in Live and match details (§7.2); supersedes C4's neutral timeline without icons (2026-10-25). |
| UI-LIVE-04 | The live clock shows ordinary time plus stoppage (`30+10:00`) and the second half starts at the half length (§5.1, §6.4). Presentation only (2026-10-25). |
| UI-LIVE-05 | The live scoreboard uses `canvas` like the dugout, in both themes; club green stays on Home and match details (2026-10-25). Lime digits for "time up" are replaced by the stoppage notation. |
| FEAT-SHARE-01 | The public match page's LIVE badge may pulse discreetly (one red dot, opacity only, 2s); the only exception to "no ambient motion" (§4), public page only, solid with reduced motion (2026-10-26). |
| B2 | Adaptive bench, Alternative C (FP-MS2.1-B2, §5.3): sorted least-played first by displayed whole minutes, ties in squad order, at every squad size; order held during interactions and re-sorted once after, with the rail back at its start; one row → two (three tall) → horizontal rail; "+N ›" / "‹ N" jump buttons with counts only; touch direction lock on the rail; tiles 44px tall (amends "≥ 60px"). |
| WEB-01b | The public website (`(marketing)` route group only) may use photography, advanced and ambient motion, CSS-3D, gradients, glow and static blur where they improve the experience, within MARKETING.md: same tokens and brand colours, Inter and Barlow Condensed, transform/opacity animation, everything off with reduced motion. The app and the public match page keep this spec unchanged (2026-10-28). |
| BRAND-01 | The FairPlayr brand (logo «Neste spiller», app icons, brand rules) is specified in BRAND.md and integrated with Modern Sideline without a redesign: the brand colours are the existing tokens, the header and the public match page show the horizontal logo (150px, club green on light, chalk on dark), and lime stays reserved for the next action (2026-10-27). |

## 11. Implementation status

| Area | State |
|---|---|
| Tokens (§2) | **In `globals.css`, used app-wide** (UI-TOKENS-01, B3). Every §2 token is a Tailwind colour (`bg-fp-club`, `text-fp-warn-text`, `border-fp-control-line`, `bg-fp-scrim`, …). The off-spec `fp-cta`, `fp-accent`, `danger` and `fp-warning` tokens are gone; lime is never text (`text-primary`/`text-accent` are not used). `src/lib/design/designGuard.test.ts` fails on glow, lime text, blur, hover scale/translate, retired tokens and hard-coded colours, with explicit, documented exceptions only. |
| Typography (§3) | **Done.** Inter everywhere (Urbanist removed); Barlow Condensed bundled and available via `.font-num`. |
| Legacy tokens | `--fp-pitch-*` (legacy live view and `/lineup`) and `src/lib/tokens.ts` (`colors` unused; `variants` still imported by 3 files) are legacy. Removal waits for UI-MS-01c and the `/lineup` decision (C6 report). `.glow-*` is removed. |
| Live screen, setup, home (§5–7) | **Done.** Live is the Modern Sideline view behind `NEXT_PUBLIC_LIVE_UI=sideline` (set in production web; verified in the production bundle 2026-10-25). Setup (C1, revised in C6) and Home (C2) follow §7. The legacy live view stays in code until UI-MS-01c. |
| Goal correction (§6.3) | Blocked on server event reconciliation. |
| Position swap (§6.1.1) | **Done in the Modern Sideline view** (FP-MS2.1-B1). The legacy live view (flag off) does not offer it. |
| Fairness suggestion (§6.2) | **Keeper exclusion and 4′ gap implemented** (MATCH-09, A1 patch, not yet committed) in both live views. The strip button is **Velg** (selects the outgoing player; the coach then taps the bench), a deliberate choice over a one-tap **Bytt** (§6.2, decided 2026-10-20). |
| Display names (§5.2) | **Ladder implemented** (FEAT-NAME-01, A1 patch, not yet committed) on live pitch, bench, scorer sheet and event history, and on the setup pitch. The player list still shows (truncated) full names (UI-TEAM-01). |
| Shared primitives (UI-FOUND-01) | **Built** (B1, not yet committed) in `src/components/ui/primitives/`: `Button`/`ButtonLink` (§5.7), `Sheet`/`ConfirmSheet` (§5.5, base-ui Dialog), `Notice` (§5.6 look; the one notice component, also for OFF-01a), `ListGroup`/`ListRow` (§7), `EmptyState`, `Skeleton`, `SegmentedChoice`. Dev gallery at `/[locale]/dev/ui`. Older `src/components/ui/*` stay until each screen is rebuilt (C1–C6). The UI guard `e2e/ui-audit.spec.ts` (STAB-06) checks targets, text floor, lime-on-light, overflow and console errors against a shrinking baseline. |
| Adaptive bench (§5.3) | **Done in the Modern Sideline view** (FP-MS2.1-B2). Verified in Chromium (Playwright, real CDP touch). **Not yet verified on iOS Safari or in the Capacitor shell.** |
| Brand (BRAND.md) | **In review** (BRAND-01): `BrandLogo` in the header and on the public match page, brand favicon, PWA and iOS icons and splash (the splash approved as design direction, 2026-10-27). Not yet verified in the Capacitor shell. |
