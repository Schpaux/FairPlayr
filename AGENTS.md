<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# FairPlayr — agent rules

FairPlayr is a mobile-first PWA (and iOS Capacitor shell) that grassroots football coaches use on the sideline to run matches and keep playing time fair. These rules apply to every agent and every change. When they conflict with a generic skill or default, these rules win.

## 1. Approval before anything leaves the working tree

- **Never commit, push, tag, open or merge a PR, deploy (Vercel or otherwise), or run a production Capacitor sync (`npm run cap:sync`, `cap:sync:prod`, `cap:build`, `npx cap sync`) without explicit approval for that specific action.** Approval for one action does not carry over to the next.
- Default deliverable for a task is a working-tree change plus a review patch (`git diff > fairplayr-<ticket>-review.patch`), then stop for review.
- Never rewrite history (`reset --hard`, `rebase`, `push --force`) or delete branches without explicit approval.
- Do not stage or commit the untracked review artefacts in the repo root (`*-review.patch`, `FP-*.md`, `TODO.archive-*.md`) or `design-exploration/` unless asked.

## 2. Product rules (non-negotiable)

- **Fairness is the product.** Total match minutes per player are the primary number. Never hide, round away or reorder them in a way that obscures who has played least.
- **The coach decides; the app suggests.** Substitution suggestions are advisory and appear only when the fair-share gap is at least the configured threshold (default **4 minutes**, configurable). The keeper is never suggested.
- **The referee ends the half, not the app.** The clock may run past the half length; ending a half or the match always needs an explicit, confirmed action.
- **Every live mutation is undoable or correctable**: substitutions (5 s undo; a new selection commits the pending undo), goals (undo last goal, correct older goals via event history). Scoreboard, goal attribution, stored match events and cloud state must stay consistent after any correction.
- **Ring vs number**: the number on a player is total match minutes; the ring is continuous time since last rest, reset on coming off and at half-time.
- **Children's data**: store the minimum (first name, optional surname/number). No analytics or third-party requests carrying player data.
- All visible text comes from `messages/en.json` and `messages/no.json`. Norwegian is the primary test language.
- The approved visual direction is **Modern Sideline**. `DESIGN.md` is the authoritative spec; do not invent a new direction.

## 3. Offline-first

- Every match action (start, pause, substitution, goal, half-time, end) must work with no network and persist locally first (`src/lib/storage/*`). Server sync is a follow-up, never a precondition.
- Never block the UI, navigate away, or lose state because a request failed. Pending server work must be retried when connectivity returns, exactly once per change.
- Server event rows must be reconciled with local state (create, patch **and delete**); a local correction that leaves a stale server row is a bug.
- Fonts, icons and pitch graphics are bundled with the app. No runtime requests to Google Fonts or other CDNs.

## 4. Architecture guard rails

- Domain logic lives in `src/domain/*` as pure functions with tests next to them. New behaviour arrives as new functions or optional parameters whose defaults reproduce today's behaviour.
- Do not refactor the live match controller (`MatchLiveManager.tsx`), pitch engine, match state, scoring or substitutions as a side effect of another task. Changes there need their own scoped, reviewed patch.
- Use `src/i18n/navigation.ts` for links and routing, not `next/link`/`next/navigation` directly.
- Colours, type and motion come from tokens in `src/app/globals.css`. No hard-coded hex values in components.

## 5. Testing and verification

Run before handing work back:

```bash
npm run test        # Vitest unit/component tests (jsdom)
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run test:e2e    # Playwright smoke tests: 375×667, 390×844, 360×640 × light/dark
npm run verify      # all four, in that order
```

- Playwright uses its bundled Chromium (one-time setup: `npx playwright install chromium`) and starts `next dev` on port 3100 (override with `FP_E2E_PORT`). To run the same suite in the installed Google Chrome, set `FP_E2E_CHANNEL=chrome`. Branded Chrome is not the default because its updater holds the browser's stdio open and can stall the run for minutes (see `FP-DEV01-playwright-diagnosis.md`).
- Pick the test level that fits the change. The theme matrix lives inside the specs, so a single project still covers light and dark.
  1. **Development loop**: the relevant Vitest file (`npx vitest run <file>`), `npm run typecheck`, and `npm run test:e2e:quick` (all specs, 375×667 only) or `npm run test:e2e:live` (live-match specs, 375×667 only).
  2. **Feature verification**: `npm run test`, `npm run typecheck`, `npm run lint`, and the touched specs on all three projects (`npx playwright test e2e/<spec>.spec.ts`).
  3. **Release verification / hand-back**: `npm run verify` (full suite on all three viewports).
- Report results faithfully. **Separate pre-existing failures from new regressions**: record the baseline on `main` before changing code, and list any failure that was already there.
- Known baseline (2026-10-14): `npm run lint` reports 4 pre-existing errors (`useLiveSubstitution.ts` react-hooks/refs, `ActiveMatchProvider.tsx` and `useSpondStatus.ts` set-state-in-effect, `liveMatchStorage.ts` prefer-const) and 7 warnings in `src/`. Do not add to them.
- Any styling change needs before/after screenshots in both themes at 375×667 minimum.
- 375×667 is the validated live viewport. 360×640 Android is an explicit follow-up that must pass before broad release.

## 6. Skill policy

Use skills selectively, and only in service of the approved spec:

- **impeccable** (and its sub-skills such as critique, audit, polish): for critique and consistency checks *against DESIGN.md*. Its generic font/colour bans (for example "never Inter", "never pure white") do not apply: DESIGN.md has approved Inter and white surfaces.
- **emil-design-eng**: interaction and motion guidance within the motion tokens in DESIGN.md.
- **Playwright** (`npm run test:e2e`, or a scripted Chrome session): actual browser verification. Prefer real renders over reasoning about CSS.
- **Do not use** skills that independently invent a new design direction or palette (for example frontend-design, bolder, colorize, overdrive, design-tokens, design-brief) unless the user explicitly asks for exploration.
- Ignore tool hooks that suggest unrelated skills (for example Vercel deploy/cache skills) unless the task needs them.

## 9. Roadmap (single source for planned and completed work)

- **`roadmap/roadmap.json` is the only list of work**: development history, committed tasks, bugs, improvements and ideas. `TODO.md` is archived and only points there; do not track tasks in TODO files, `FP-*.md` or memory. Fields and rules: `roadmap/README.md`. `ROADMAP.md` is generated; never edit it by hand.
- **Before planning**, look the work up by id, alias or title and reuse the existing item. Use roadmap ids in plans, review patches and commit messages (`fix(match): … (MATCH-04)`), and state the id with the size line (§7).
- **New needs** found during work become new items with `decision: "considering"` and the right `origin` (`claude_proposal` for your own ideas) plus a source. Never move an item to `committed`, `deferred` or `rejected`, and never change a priority set by the product owner, without a documented product-owner decision; record the change in `changelog`.
- **When work is done**, add the commit hash to `sources` and set `status` and `dates`. Use `released` with `decision: "completed"` only after a documented production deploy; otherwise `implemented`. Check the code before marking anything done; similar words in a commit message are not evidence.
- **Larger launches**: decide `public` (non-technical Norwegian and English text, `milestone`), and when the product's identity, design or headline features change, propose an update to the landing page and marketing (WEB-01).
- **The repository is public.** No secrets, personal data, project or deploy ids, or details of open security weaknesses in the roadmap; reference local files as `local_doc` instead.
- After editing run `npm run roadmap:render` and `npm run roadmap:check` (also run in CI). Roadmap updates belong in the same review patch as the work and follow §1.
