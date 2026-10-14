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
- Do not stage or commit the untracked review artefacts in the repo root (`*-review.patch`, `FP-*.md`) or `design-exploration/` unless asked.

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

- Playwright uses the locally installed Google Chrome (`channel: "chrome"`) and starts `next dev` on port 3100 (override with `FP_E2E_PORT`).
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
