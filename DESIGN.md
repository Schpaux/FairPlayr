# FairPlayr design system: Modern Sideline

**Status:** approved visual direction, authoritative. **Version:** 1.3 (2026-10-16).
This document is the single source of truth for FairPlayr's visual and interaction design. Where it conflicts with older notes, prototypes, skills or generic design advice, this document wins. Tokens live in [`src/app/globals.css`](src/app/globals.css); design context for agents lives in [`.impeccable.md`](.impeccable.md).

Background and evidence: `design-exploration/modern-sideline/` (prototype v1.1, `FINAL-VALIDATION.md`, `IMPLEMENTATION-PLAN.md`). The prototype is reference material, not spec: where it differs from this document (for example its chalk canvas), this document is correct.

---

## 1. Direction

**"Grass, a club scoreboard and nothing else."** Modern Sideline combines:
- **Football identity on the match surfaces only:** a grass pitch, shirt-number discs and a club-green scoreboard, on Live and in the Setup lineup.
- **Quiet utility everywhere else:** Inter, hairline lists, white surfaces on a near-white canvas, and no decoration.
- **One fixed "what now" slot:** the action strip between pitch and bench always says what happens next.

The user is a volunteer coach on a sideline, outdoors, often one-handed and under mild stress. The emotional goal is **calm control**. Every decision below serves glanceability, mis-tap resistance and fairness.

### Principles
1. **Readability first.** Outdoor light, arm's length, one hand. Text on the live screen is never under 13px, and names are never under 14px.
2. **Lime means "your next action".** If it is lime, it is the thing to tap now. Nothing else is lime.
3. **Club green is identity, not action.** It is used for the scoreboard, the fixture panel and shirt discs, and is never a button fill.
4. **Calm through hierarchy.** Normal states are silent ("saved" has no indicator). Only exceptions speak.
5. **Predictable placement.** Controls do not move, and the pitch and bench never shift when the strip changes.
6. **Honest structure.** There is no decorative chrome, glow, gradient, glass or ambient motion.

---

## 2. Colour

Light is the default (daylight matches). Dark is "floodlight" mode. The scoreboard, grass, lime and club green are identical in both modes; only the surfaces change.

### 2.1 Surfaces and text

| Token (`--fp-*`) | Light | Dark | Role |
|---|---|---|---|
| `canvas` | `#F9FAF8` | `#121B16` | Page background (near-white, not beige) |
| `surface` | `#FFFFFF` | `#1A2620` | Cards, list groups, bench tiles, strip, sheets |
| `surface-2` | `#F1F3F0` | `#233229` | Pressed/quiet fills, disabled buttons |
| `surface-3` | `#E7EAE6` | `#2A3A31` | Stronger quiet fill |
| `rule` | `#E3E6E2` | `#2C3C34` | Hairlines, card borders, input borders |
| `rule-strong` | `#C9CEC8` | `#43574C` | Outlines, secondary-button borders |
| `ink` | `#111A15` | `#EEF1EA` | Text |
| `ink-2` | `#4A564F` | `#A4B3A9` | Secondary text |

**The light theme is near-white `#F9FAF8` with white surfaces and subtle neutral borders.** The earlier beige "chalk" canvas (`#F2EFE7`) is rejected as a page or surface colour. Chalk survives only as *text and lines on green* (`on-club`, `on-tag`, pitch lines), where it reads as paint on grass.

### 2.2 Identity and action

| Token | Value (both modes unless noted) | Role |
|---|---|---|
| `club` | `#0E4D33` | Scoreboard, fixture panel. Never a button fill. |
| `on-club` / `on-club-2` | `#F2EFE7` / `#B7CCBE` | Text on club green (primary / secondary; never grey) |
| `club-disc` | `#0E4D33` · dark `#1D6345` | Shirt discs off the pitch |
| `lime` / `on-lime` | `#9FE870` / `#0B2E1A` | Next action: primary button, selection, suggestion, undo countdown |
| `focus` | `#0E4D33` · dark `#9FE870` | Focus ring |

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
- **Status is never colour-only.** Fatigue uses arc length, selection uses scale and outline, and offline uses a glyph.
- **No glow, gradients, blur or glass.** The legacy `.glow-*` utilities are deprecated; remove them as components are rebuilt. The one exception is functional: the bench rail's edge fade (`transparent` → `canvas`), which shows that players continue off-screen (§5.3).

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
| Label | Inter 600 13, caps, +6 % | Section kickers, score team codes (the only 13px text) |
| Minutes | Inter 700 15 (token) / 14 (bench), tabular | Total playing time |
| Score | Barlow Condensed 600 50/0.9 (44 on short screens) | 2 – 1 |
| Clock | Barlow Condensed 600 40/0.9 (34 on short screens) | 16:20 |
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
- `prefers-reduced-motion`: all transforms and transitions go to 1ms. The undo countdown stays, because it carries information, and it also shows its seconds as a number.

---

## 5. Live screen

Full screen, with no global header or bottom nav and no scrolling. It is portrait-first. Landscape is a two-column fallback (pitch left, board and dugout right), not a design target.

```
┌ Scoreboard (club green, runs under the status bar) ┐  ~140px (~120 short)
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
- **Clock key** (left): a 44px play/pause disc plus the clock, as one button. When paused, the disc is lime, the digits are dimmed and the status dot is hollow. At half-time and full-time it shows a flag outline and is inert. When the half's time is up the digits turn lime. The clock keeps running, because **the referee ends the half, not the app**.
- **Meta line:** phase and length ("1. omgang · av 25:00"). When offline, an amber wifi-off glyph replaces the status dot. "Saved" is silent.
- **Score:** condensed numerals over 13px caps team codes. It is a display, not a control.
- **Goal keys:** two equal 48px pills with words ("Mål for oss", "Mål for Lyn"). Ours is chalk-filled and theirs is outlined. They are **never lime**, because a goal is not a suggestion. They are real `disabled` buttons outside `first_half`/`second_half`.
- **Menu ⋯:** a 44px icon button. It is the only route to the event history and goal correction, end half, leave, and end match.

### 5.2 Player token (one spec in setup and live)
- **Disc** with the shirt number: 44px, or 36px compact (≥ 9 on the field). It is `disc` on grass. The keeper uses `keeper` with a small "K" badge. **No shirt number → two initials.**
- **Name tag** below: `tag` fill, display name plus **total match minutes** (Inter 700, tabular). On one line up to 7v7, stacked in compact. The tag width is capped by the gap to its neighbour.
- **Stint ring (D1):** the arc shows **continuous playing time since the player last rested**, as a share of one half. It resets on coming off and **at half-time**. It is `ring-fresh` < 60 %, `ring-watch` from 60 %, `ring-act` from 75 %, with the track tinted from 85 %. The keeper's ring never escalates. The ring carries no number; the exact stint minutes appear in the strip on selection. **Total match minutes stay the prominent number.**
- **States:** selected (lime disc and tag, scale 1.08), valid target (dashed chalk halo), suggested out (2px lime outline on the tag), just swapped in (360ms land).
- **Display names:** first name; on a clash, first name + surname initial; then the shortest unique surname prefix ("Emma Han" / "Emma Hau"). The ladder is built from the match squad. Cut order: stack first, then cut the first name ("E… Hau"), never the distinguishing suffix.
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

**Tile.** Display name (Inter 600 14, no truncation) over **total minutes** (Inter 700 14, tabular). The shirt number is in the accessible label, not on the tile. At least 44 × 44. Duplicate names use the existing ladder ("Thea S2"). The fair-share gap ("−6") is not shown yet.
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
| 7 | Suggestion | "Forslag · 4′ mot 16′ spilt" | "Selma inn for Maja" | **Bytt** (lime) |
| 8 | Idle | "Tallet er total spilletid. Ringen er tid siden siste hvile." | "Trykk en spiller, så en på benken" | — |

With an empty bench, the idle line reads "Ingen innbyttere".

### 5.5 Sheets
- They slide up with a `canvas` fill, a 20px top radius, a grab handle and a 20/600 title. They are `role="dialog"`, labelled, take focus, and return focus to the invoking control.
- Menu rows are 54px in **three separated groups**: match actions; leaving; and the dangerous "end match now". Destructive actions never sit next to routine ones.
- **Confirmation:** the primary action states the outcome ("Ja, avslutt omgangen"), and the secondary is always "Fortsett å spille".
- **Scorer sheet:** the existing production rules apply (only when reports are enabled; scorer, then assist; auto-advance after 10 s, shown with the same drain bar as undo). Two columns of 52px pills, outfield first and the keeper last, plus "Hopp over". Tapping the scrim does not dismiss it.

### 5.6 Buttons
- Pills, 52px (or 44px small). **Primary:** lime fill with `on-lime`. **Secondary:** 1.5px `rule-strong` outline with ink text. **Destructive:** red fill with white text, only inside its confirmation.
- **Disabled:** `surface-2` fill with `ink-2` text, and a real `disabled` attribute.
- Pressed state: `scale(.97)` for 90ms. Hover applies only on pointer devices and is a fill shift, never a scale-up.

---

## 6. Interactions

### 6.1 Substitution
- Tap pitch → bench, **or** bench → pitch. Valid counterparts are marked. Tapping the same player again, or Avbryt, cancels. Tapping another player on the same side moves the selection.
- **Drag-to-swap is preserved as a secondary path (D4).** From a bench rail, start the drag upwards: a sideways start scrolls the rail instead (§5.3, direction lock).
- After a swap: the token lands, the bench tile flashes, both stint rings reset, and the strip shows the 5 s undo.
- **Starting another selection during the undo window confirms the previous substitution and begins the new one (D3).**

### 6.1.1 Position swap (B1)
Two players on the pitch exchange positions. **It is not a substitution**: no event is logged, total minutes and the stint ring are unchanged, and nobody goes to or from the bench. Both methods below are approved and **neither is optional (D7)**.

1. **Tap:** tap a pitch player → **Bytt plass** in the strip (the ✕ beside it cancels the selection) → every other pitch player gets the dashed target halo (the bench does not) → tap one of them. Tapping the source again, the grass or **Avbryt** cancels; a bench tap does nothing in this mode.
2. **Drag:** press a pitch player and drag (touch or mouse; it starts after a 12px move, so ordinary taps are unaffected). The player follows the finger as the lime ghost, its own token dims, every other pitch player shows the dashed target halo, and the one under the finger gets a solid lime halo. Release on another pitch player to swap. Releasing on grass, the bench, the player's own slot, or anywhere else cancels with no change, and the release never also selects a player.

- **One domain operation.** Both methods call the same `swapLivePositions` (`src/domain/positionSwap.ts`): both slots must be in the current formation and hold on-field players, otherwise nothing changes. It works in every format, and swapping into the first slot makes that player the keeper (the K badge moves with the slot).
- **Undo.** The strip shows the 5 s undo (row 1b) and both tokens land. Undo is **targeted**: it reverses those two slots only, and only while they still hold the swapped pair. A goal or clock change made inside the window is kept.
- **Persistence.** The swap is saved on the device like any live change, offline too. Slot assignments travel with the debounced runtime-state sync; there is no server event to reconcile.
- **Routing a drag by what it is dropped on:** pitch player → occupied pitch slot = position swap; bench → pitch = substitution (unchanged); pitch → bench = no change (not a substitution path); pitch → empty or invalid area = no change.

### 6.2 Fairness suggestion (D2)
- **Out:** the outfield player with the most total time (the keeper is excluded). **In:** the bench player with the least total time.
- It is shown **only when the fair-share gap is at least 4 minutes**. The threshold is a configurable parameter (`minGapSeconds`, default 240). Fair share = field slots × elapsed time ÷ available squad.
- One tap on **Bytt** swaps, followed by undo.

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
- The second-half display clock starts at the half length (20:00 for 2 × 20). This is presentation only; accounting is unchanged.
- One-period matches are supported.

### 6.5 Offline
The live screen behaves identically offline. The only visible change is the amber glyph in the scoreboard meta line, and the menu explains it in words.

---

## 7. Other screens
- **Home:** quiet lists plus **one** club-green fixture panel (with a faint centre-circle arc at 14 % stroke, the only decorative geometry in the system) and a lime CTA. Season stats are inline numbers, not hero-metric cards.
- **Setup:** an attendance grid of shirt discs (lime check = present; "Borte" = absent) and the setup pitch, which reuses the live token without minutes or ring and uses the same tap–tap model. A sticky footer shows squad count, readiness and **Start kamp**.
- **Lists:** hairline-separated rows on `surface`, with no nested cards.
- **Bottom nav:** four tabs with a lime pill on the active one. It is absent on Live.

---

## 8. Iconography
A 24 grid with 1.75 stroke and round caps and joins (lucide-compatible). Icons only appear next to a word, except ⋯, play/pause and the offline glyph, which have `aria-label`s.

---

## 9. Accessibility and viewports
- **Validated live viewport: 375 × 667 portrait (D6).** 390 × 844 is the reference design size. **360 × 640 Android is an explicit follow-up that must pass before broad release.** Below 360 wide is best-effort.
- Hit areas are at least 44px, live text is at least 13px and names at least 14px, with no horizontal overflow at any supported size.
- One persistent `aria-live="polite"` announcer gets one message per action. Token labels include name, keeper status, total minutes, stint minutes and a fatigue word. Bench tiles include the fair-share gap.
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
| B2 | Adaptive bench, Alternative C (FP-MS2.1-B2, §5.3): sorted least-played first by displayed whole minutes, ties in squad order, at every squad size; order held during interactions and re-sorted once after, with the rail back at its start; one row → two (three tall) → horizontal rail; "+N ›" / "‹ N" jump buttons with counts only; touch direction lock on the rail; tiles 44px tall (amends "≥ 60px"). |

## 11. Implementation status

| Area | State |
|---|---|
| Tokens (§2) | **In `globals.css`.** Light and dark surfaces are applied app-wide. Identity, pitch and status tokens are defined and exposed as Tailwind colours (`bg-fp-club`, `text-fp-warn-text`, …) but not yet used by components. |
| Typography (§3) | **Done.** Inter everywhere (Urbanist removed); Barlow Condensed bundled and available via `.font-num`. |
| Legacy tokens | `--fp-pitch-*`, `.glow-*` and `src/lib/tokens.ts` `colors` are legacy. Remove them as the live UI and setup are rebuilt. |
| Live screen, setup, home (§5–7) | Not started. Follow `design-exploration/modern-sideline/IMPLEMENTATION-PLAN.md`, behind `NEXT_PUBLIC_LIVE_UI=sideline`. |
| Goal correction (§6.3) | Blocked on server event reconciliation. |
| Position swap (§6.1.1) | **Done in the Modern Sideline view** (FP-MS2.1-B1). The legacy live view (flag off) does not offer it. |
| Adaptive bench (§5.3) | **Done in the Modern Sideline view** (FP-MS2.1-B2). Verified in Chromium (Playwright, real CDP touch). **Not yet verified on iOS Safari or in the Capacitor shell.** |
