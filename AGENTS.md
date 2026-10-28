<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

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
- The same applies to database migrations or any remote database command (`supabase db/migration/link`, `psql`, `pg_dump`), deleting files outside temp directories, and anything that changes production (Vercel, Supabase, Railway, App Store builds).
- Local git hooks refuse commit, push, merge commits and rebase from a Claude Code session. After the user approves one specific action, run exactly that command prefixed with `FP_GIT_APPROVED=1`. Never set that variable in scripts, `export`, settings, env files or any other command, and never use it to get past a refusal. See §9.

## 2. Product rules (non-negotiable)

- **Fairness is the product.** Total match minutes per player are the primary number. Never hide, round away or reorder them in a way that obscures who has played least.
- **The coach decides; the app suggests.** Substitution suggestions are advisory and appear only when the fair-share gap is at least the configured threshold (default **4 minutes**, configurable). The keeper is never suggested.
- **The referee ends the half, not the app.** The clock may run past the half length; ending a half or the match always needs an explicit, confirmed action.
- **Every live mutation is undoable or correctable**: substitutions (5 s undo; a new selection commits the pending undo), goals (undo last goal, correct older goals via event history). Scoreboard, goal attribution, stored match events and cloud state must stay consistent after any correction.
- **Ring vs number**: the number on a player is total match minutes; the ring is continuous time since last rest, reset on coming off and at half-time.
- **Children's data**: store the minimum (first name, optional surname/number). No analytics or third-party requests carrying player data.
- All visible text comes from `messages/en.json` and `messages/no.json`. Norwegian is the primary test language.
- The approved visual direction is **Modern Sideline**. `DESIGN.md` is the authoritative spec; do not invent a new direction.
- The FairPlayr brand (logo, variants, app icons, brand colours, website and marketing use) is specified in **`BRAND.md`**, which is authoritative for it. Use the masters in `public/brand/` and `BrandLogo`; never redraw, recolour or improvise a logo variant. Modern Sideline is the design language and FairPlayr Next the live action strip; neither replaces the product name.

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
- Known baseline (2026-10-27): `npm run lint` reports 3 pre-existing errors (`useLiveSubstitution.ts` react-hooks/refs, `useSpondStatus.ts` set-state-in-effect, `liveMatchStorage.ts` prefer-const) and 9 warnings in `src/`. The former `ActiveMatchProvider.tsx` error is fixed. Do not add to them.
- Any styling change needs before/after screenshots in both themes at 375×667 minimum.
- 375×667 is the validated live viewport. 360×640 Android is an explicit follow-up that must pass before broad release.

## 6. Skill policy

Use skills selectively, and only in service of the approved spec:

- **impeccable** (and its sub-skills such as critique, audit, polish): for critique and consistency checks *against DESIGN.md*. Its generic font/colour bans (for example "never Inter", "never pure white") do not apply: DESIGN.md has approved Inter and white surfaces.
- **emil-design-eng**: interaction and motion guidance within the motion tokens in DESIGN.md.
- **Brand work** (logo, icons, splash, share images, the website's identity, marketing material): read `BRAND.md` first, together with DESIGN.md for the interface. Logo and brand-generation skills (for example logo-design, brand-discovery) must not create a new mark or palette unless the user explicitly asks for brand exploration.
- **FairPlayr logo review skill:** for all logo/wordmark variant, accent-colour, legibility and contrast reviews, read `.claude/skills/logo-design/SKILL.md` and follow its read-only review process. It is project-specific; a review does not authorize asset or source changes. The approved logo symbol must remain unchanged unless the user explicitly approves a separately scoped modification.
- **Playwright** (`npm run test:e2e`, or a scripted Chrome session): actual browser verification. Prefer real renders over reasoning about CSS.
- **Do not use** skills that independently invent a new design direction or palette (for example frontend-design, bolder, colorize, overdrive, design-tokens, design-brief) unless the user explicitly asks for exploration.
- Ignore tool hooks that suggest unrelated skills (for example Vercel deploy/cache skills) unless the task needs them.

## 7. Roadmap (single source for planned and completed work)

- **`roadmap/roadmap.json` is the only list of work**: development history, committed tasks, bugs, improvements and ideas. `TODO.md` is archived and only points there; do not track tasks in TODO files, `FP-*.md` or memory. Fields and rules: `roadmap/README.md`. `ROADMAP.md` is generated; never edit it by hand.
- **Before planning**, look the work up by id, alias or title and reuse the existing item. Use roadmap ids in plans, review patches and commit messages (`fix(match): … (MATCH-04)`), and state the id at the start of the task.
- **New needs** found during work become new items with `decision: "considering"` and the right `origin` (`claude_proposal` for your own ideas) plus a source. Never move an item to `committed`, `deferred` or `rejected`, and never change a priority set by the product owner, without a documented product-owner decision; record the change in `changelog`.
- **When work is done**, add the commit hash to `sources` and set `status` and `dates`. Use `released` with `decision: "completed"` only after a documented production deploy; otherwise `implemented`. Check the code before marking anything done; similar words in a commit message are not evidence.
- **Larger launches**: decide `public` (non-technical Norwegian and English text, `milestone`), and when the product's identity, design or headline features change, propose an update to the landing page and marketing (WEB-01).
- **The repository is public.** No secrets, personal data, project or deploy ids, or details of open security weaknesses in the roadmap; reference local files as `local_doc` instead.
- After editing run `npm run roadmap:render` and `npm run roadmap:check` (also run in CI). Roadmap updates belong in the same review patch as the work and follow §1.

## 8. Agent strategy (S / M / L)

This file takes precedence over generic ECC agents, skills, commands and rules. Where ECC guidance differs (TDD-first, coverage targets, auto-commit, PR flows), follow this file.

**Pick the size yourself** from complexity and risk, state it in one line at the start together with the roadmap id (§7) (`Size: M, MATCH-04, touches substitutions UI and its tests`), and move up a size when in doubt about risk.

| Size | Typical scope | Workflow |
| :- | :- | :- |
| **S** | One concern, a few files, no critical match logic, no schema or sync change | One agent implements and runs the relevant tests (§5 level 1, then level 2 for the touched area). No orchestration. |
| **M** | Several files or one feature slice; touches UI plus domain, or critical match logic in a contained way | One agent implements. Then 2 or 3 **independent, parallel, read-only** reviewers chosen for the change, for example `ecc:typescript-reviewer`, `ecc:react-reviewer`, `ecc:code-reviewer`, `ecc:security-reviewer` (auth, Supabase, player data), `ecc:database-reviewer` (migrations), `ecc:a11y-architect` (UI). The implementer fixes the findings it confirms. §5 level 2. |
| **L** | Cross-cutting, multi-area, schema plus sync, or more than about 10 files | A planner (`ecc:planner` or `Plan`) writes the plan. **Stop for explicit plan approval.** Then 2 or 3 worktree agents work on **disjoint file sets**, followed by integration in the main checkout, an M-style review of the combined diff, and `npm run verify`. |

**Rules for every agent**

- Every subagent prompt starts with: "Read and follow `AGENTS.md` before doing anything." UI and design agents (components, styles, copy, layout, motion, icons, brand, website) also get: "Read `DESIGN.md`; it is the authoritative visual spec. Read `BRAND.md`; it is authoritative for the logo, app icons and brand colours." Subagents don't inherit the orchestrator's context, so put the task, the size, the allowed file set and the test level in the prompt.
- **One writer for critical match logic.** At most one writing agent at a time may touch these files: `src/components/match/MatchLiveManager.tsx`, `useLiveSubstitution.ts`, `LivePitchView.tsx`, `LivePitchLineupEditor.tsx` and `PitchLineupEditor.tsx`; `src/components/live/Pitch.tsx`; the match, fairness and substitution logic in `src/domain/*` (`liveMatch`, `matchLifecycle`, `matchEvent`, `playerStint`, `playerFatigue`, `substitution*`, `liveSubInteraction`, `positionSwap`, `benchOrder`); and `src/lib/storage/*`. Reviewers stay read-only. Parallel L tasks must not both own any of these.
- **Worktree isolation (L only).** Use the Agent tool with `isolation: "worktree"` (worktrees under `.claude/worktrees/` are in `.gitignore`). Each worktree gets a slot N = 1, 2 or 3 and its own ports: dev `npx next dev --port 30N0` (3010, 3020, 3030) and e2e `FP_E2E_PORT=31N0` (3110, 3120, 3130). The main checkout keeps 3000 and 3100. This matters: `playwright.config.ts` reuses any server already running on its port, so a shared port silently tests another worktree's code. Run `npm ci` in a fresh worktree before testing; do not symlink `node_modules`.
- **Integration** happens in the main checkout by the orchestrator. Apply each worktree's diff, resolve conflicts, then run the full §5 level 3 checks. Worktree branches are not pushed, and removing a worktree needs approval.
- **Approval.** No commit, push, PR, deploy, migration or production change without the user's explicit approval for that action (§1). Local work is not gated: reading, editing files inside the task, tests, typechecks, lint, local dev servers, scratch files, worktree agents and reviews.
- **Report** like a single agent would: what changed, the test results (separating pre-existing failures), and what is left. Reviewers return findings, not edits.

**ECC commands and skills that must not be used** because they commit, push, publish or change remote state: `/prp-commit`, `/prp-pr`, `/pr`, `/checkpoint` (commits), `/santa-loop`, `/astra-review`, `/epic-publish`, `/epic-claim`, `/epic-sync`, `/epic-unblock`, `/epic-review` (GitHub issue writes), `/loop-start` and autonomous-loop skills that run unattended, and any deploy or canary flow. `git-workflow`, `deployment-patterns` and `canary-watch` may be read for guidance only. ECC continuous learning and instinct capture are disabled for this repo; don't re-enable them.

## 9. Safety layers (and their limits)

Prompt instructions alone are not a technical control. These layers back up §1. Each has gaps, so don't rely on any single one.

1. **Permission rules**: `.claude/settings.json` (project) and `~/.claude/settings.json` (user). Ask rules for git writes, gh writes, Supabase, psql, Vercel and cap sync, and for edits to the safety layers themselves (`.claude/settings*.json`, `.claude/hooks/`, `.git/hooks/`, `.git/config`). Deny rules for reading secrets, anchored at the project root and matching at any depth (`/**/…`): in the project, `.env` files except `.env.example` (`.env`, `.env.local`, `.env.*.local`, `.env.production`, `.env.development`, `.env.test`, `.env.staging`, `.env.preview`, `.envrc`), `supabase/.temp/` and key files (`*.pem`, `*.p8`, `*.p12`, `*.key`); in the user settings, credential files. Bash rules match the literal command text only (`git -C . push` is not matched), and read denies do not cover Bash (`cat .env.local`; fp-guard asks there instead). Project rules and hooks load only when Claude Code starts in the repo root or a worktree root; a session started in a subdirectory gets none of layers 1 and 2. Personal settings belong in `.claude/settings.local.json`, which is git-ignored.
2. **`fp-guard` PreToolUse hook** (`.claude/hooks/fp-guard.mjs`, tests: `node --test .claude/hooks/fp-guard.node-test.mjs`). Parses Bash commands, including `git -C/-c`, quoting, `sh -c`, `$(…)`, heredocs and here-strings, `npm run` script bodies and shell scripts, and asks before high-risk operations. It also asks when a command name or git subcommand is built at runtime (`$g push`), when a git alias or command setting is stored, when a command changes the safety layers or clears `CLAUDECODE`, and when a Bash command names an env or key file other than `.env.example`. It cannot see commands assembled at runtime inside programs, and it fails open if its input is unreadable or it crashes.
3. **Local git hooks** (`.git/hooks/pre-commit|pre-push|pre-rebase|pre-merge-commit`, installed by `sh .claude/hooks/install-git-guard.sh`, checked with `--check`; a SessionStart hook, `.claude/hooks/check-git-guard.sh`, warns when they are missing, for example in a fresh clone). They refuse commit, push, rebase and merge commits when `CLAUDECODE` is set and `FP_GIT_APPROVED=1` is not, so they also cover scripts and every worktree. They do not cover reset, clean, branch or tag deletion, fast-forward pulls or `gh`; those rely on layers 1 and 2. Manual git in a terminal or VS Code is unaffected. `--no-verify` is blocked separately by ECC `block-no-verify` and by fp-guard.
4. **ECC hooks** run on the `standard` profile. The ECC plugin, its marketplace and `ECC_DISABLED_HOOKS` are personal settings in `.claude/settings.local.json`, so a fresh clone does not get them. Disabled: GateGuard, auto-tmux-dev, continuous learning and observation, and tool-call logging.

**Residual risk:** there is no OS-level sandbox. A program that builds and runs commands itself can bypass layers 1 and 2. A process that unsets `CLAUDECODE` can bypass layer 3. Treat any such attempt as a violation of §1, not a workaround.
