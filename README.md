# FairPlayr

FairPlayr is a mobile-first matchday assistant for grassroots football. It is built for volunteer coaches, parent coaches, and team managers who need fast decisions on the sideline without digging through heavy admin tools.

The product focuses on practical matchday flow: squad selection, starting lineup, bench/field overview, substitutions, and fair playtime distribution. It is designed for quick use on a phone, with a modern UI, low friction navigation, and a clear in-match workflow.

Today, FairPlayr combines local matchday state (for speed and reliability during a game) with cloud-backed team and integration data (for persistence and collaboration). Norwegian and English are both first-class locales, and the app is web-first with a future app packaging direction.

> FairPlayr is intentionally a sideline tool, not a full club ERP or elite analytics platform.

## Why FairPlayr

In youth and grassroots football, matchday decisions are often made under time pressure by volunteers. That leads to inconsistent substitutions, uneven playtime, and unnecessary cognitive load.

FairPlayr exists to make fair rotation and match organization easier in real time. The goal is simple: fewer spreadsheets, fewer ad hoc decisions, and more predictable fairness for players.

## Core Features

- Team and player management (local guest mode and cloud mode)
- Multi-team workspace with active team preference
- Match setup flow with format, formation, duration, squad, and starters
- Live match control with timer, score, substitutions, and fairness suggestions
- Dedicated lineup builder view
- Match planner with manual match creation (cloud)
- Match details view for imported/manual matches
- Auth with Google OAuth, magic link, and email/password
- Locale support for English and Norwegian via route-aware i18n
- Theme and language settings
- Spond integration (beta): connect account, fetch groups, link group to team, import members, fetch events, import event to match, RSVP snapshot sync

## Product Principles

- Mobile first: optimized for one-hand, in-the-moment usage
- Fast in match situations: minimal taps and clear state transitions
- Low cognitive load: clear sections, direct actions, concise feedback
- Fairness over complexity: practical rotation support, not over-modeled tactics
- Modern but practical: polished UI choices that stay operationally useful

## Tech Stack

- Framework: Next.js 16 (App Router)
- Language: TypeScript (strict mode)
- UI: React 19, Tailwind CSS v4, custom UI components, Framer Motion
- Icons: lucide-react
- Internationalization: next-intl
- Theming: next-themes
- Backend/BaaS: Supabase (Auth + Postgres + RLS)
- Data access: @supabase/ssr and @supabase/supabase-js
- iOS packaging: Capacitor 8 (server URL mode wrapping the Vercel deployment)
- Linting: ESLint 9 + eslint-config-next

## Architecture Overview

### Frontend

- App routes are under src/app/[locale]
- Main product surfaces:
- /team for team/player and Spond beta management
- /match for planning and import flow
- /match/setup for lineup and squad prep
- /match/live for in-game control
- /lineup for dedicated lineup editing
- /settings for auth status, theme, and language
- Bottom navigation is persistent across core pages for mobile-first movement

### Backend and BaaS

- Supabase handles auth, relational data, and RLS enforcement
- API routes under src/app/api encapsulate server-side operations for matches and Spond
- Server-side integration service/provider layers under src/lib/server/integrations/spond

### Auth

- Client auth state is managed in AuthProvider
- Supabase session cookies are refreshed in middleware (src/proxy.ts + src/lib/supabase/middleware.ts)
- Auth callback route exchanges OAuth/magic-link code for session

### Data model

- Core entities: profiles, teams, team_members, players
- Match entities: matches, external_event_links
- Integration entities: integration_connections, external_team_links
- RSVP snapshot entities: match_rsvp_snapshots, match_rsvp_snapshot_entries

### Runtime state strategy

- Team data is repository-driven:
- guest-local repository for non-authenticated users
- Supabase repository for authenticated users
- Match setup/live runtime is currently local storage driven for speed during active use

## Project Structure

```text
.
├─ src/
│  ├─ app/
│  │  ├─ [locale]/
│  │  │  ├─ page.tsx                # Home
│  │  │  ├─ team/                   # Team manager + Spond beta card
│  │  │  ├─ match/                  # Match planner, setup, live, details
│  │  │  ├─ lineup/                 # Dedicated lineup builder
│  │  │  ├─ settings/               # Theme/language/auth status
│  │  │  └─ auth/                   # Sign-in, sign-up, callback
│  │  ├─ manifest.ts               # PWA manifest (/manifest.webmanifest)
│  │  ├─ serwist/[path]/route.ts    # Builds and serves the service worker (/serwist/sw.js)
│  │  └─ api/
│  │     ├─ matches/                # Match CRUD/read endpoints
│  │     └─ integrations/spond/     # Spond connect/sync/import endpoints
│  ├─ components/
│  │  ├─ match/
│  │  ├─ team/
│  │  ├─ lineup/
│  │  ├─ auth/
│  │  ├─ providers/
│  │  └─ ui/
│  ├─ sw/                           # Service worker: routing rules, caches, update gate
│  ├─ domain/                       # Match/live/team domain logic
│  ├─ i18n/                         # next-intl routing and request config
│  └─ lib/
│     ├─ server/                    # Server modules (matches, integrations)
│     ├─ supabase/                  # Browser/server/middleware clients
│     ├─ teamData/                  # Local vs cloud repository abstraction
│     └─ storage/                   # Local storage state for match/runtime
├─ supabase/
│  ├─ config.toml
│  └─ migrations/
└─ messages/                        # en.json / no.json translations
```

## Authentication

Implemented auth methods:

- Google OAuth
- Email/password sign-in and sign-up
- Magic link sign-in
- Guest mode (no account), with local team data storage

Key behavior:

- After auth callback, users are redirected to the next path (or team by default)
- User profile bootstrap is handled via ensureUserProfile on authenticated session
- Signed-in users use cloud repository mode; guests use local repository mode

## Database and Supabase

Supabase is used for:

- Authentication and session handling
- PostgreSQL data storage
- Row-Level Security for member-scoped access
- SQL migrations under supabase/migrations

Current schema areas:

- Team management: profiles, teams, team_members, players
- Match planning/import: matches, external_event_links
- Integrations: integration_connections, external_team_links
- RSVP snapshots: match_rsvp_snapshots, match_rsvp_snapshot_entries

RLS highlights:

- Membership helper functions (is_team_member / is_team_owner)
- Policies tied to authenticated access and team membership
- Managed deletion guard for imported players (source-based policy constraint)

## Integrations

### Spond [implemented + beta UX]

- Status: implemented in backend and exposed through an in-app beta card
- Provider reference: https://github.com/Olen/Spond

Implemented now:

- Connect Spond account (credentials are encrypted at rest)
- Fetch user groups
- Link one Spond group to one FairPlayr team
- Import and re-sync members conservatively
- Fetch/sync upcoming events
- Import event as FairPlayr match
- Sync RSVP snapshot for imported matches

Current maturity:

- Reliable for internal testing and iterative rollout
- Still evolving as an integration surface (intentionally marked beta in UI)

## Getting Started

### 1) Clone and install

```bash
git clone <your-repo-url>
cd FairPlayr
npm install
```

### 2) Configure environment variables

Create or update .env.local:

```bash
cat > .env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SPOND_CREDENTIALS_SECRET=your_long_random_secret
EOF
```

### 3) Set up Supabase

Use one of these workflows:

- Linked remote project:

```bash
npx supabase db push
```

- Local Supabase stack (CLI-based):

```bash
npx supabase start
npx supabase db push
```

### 4) Start the app

```bash
npm run dev
```

Open http://localhost:3000.

### 5) Optional checks

```bash
npm run lint
npm run build
```

## Environment Variables

The codebase currently reads these variables:

| Variable | Required | Used for |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Yes | Supabase project URL for browser/server clients |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Yes | Supabase anon key for app auth/data access |
| SPOND_CREDENTIALS_SECRET | Required for Spond | AES-GCM encryption key material for stored Spond credentials |
| GOOGLE_CLOUD_PROJECT | Required for AI | Google Cloud project id used by Vertex AI backend calls |
| VERTEX_AI_LOCATION | Optional (default: `global`) | Vertex AI location for model endpoint selection |
| VERTEX_AI_MODEL | Optional (default: `gemini-2.5-flash`) | Vertex AI Gemini model used by internal text generation |
| AI_HEALTHCHECK_TOKEN | Optional (recommended in prod) | Protects internal AI health endpoint in production |
| NEXT_PUBLIC_FP_SW | Optional (default: on) | `off` is the service worker kill switch, see [PWA and service worker](#pwa-and-service-worker) |
| NEXT_PUBLIC_FP_SW_DEV | Optional, local only | `1` registers the service worker under `next dev` (debugging only) |

Notes:

- If SPOND_CREDENTIALS_SECRET is missing, Spond connect/import endpoints will fail with encryption configuration errors.
- AI infrastructure setup notes are documented in `docs/ai-vertex-setup.md`.
- Do not commit production secrets.

## Development Notes

- Locale routing uses as-needed prefixing: English is default without prefix, Norwegian uses /no/* paths.
- Auth session refresh is middleware-driven via src/proxy.ts and Supabase SSR helpers.
- Team repository mode switches automatically based on authenticated user presence.
- Match setup/live state is persisted in local storage, even when cloud mode is active.
- RLS and policy changes are high-impact: validate both API behavior and policy behavior when touching migrations.
- Spond API calls run server-side in the provider/service layer; credentials are never exposed to the client after submit.

## PWA and service worker

The app ships a hand-written service worker (`src/sw/`, built by `src/app/serwist/[path]/route.ts` and served at `/serwist/sw.js` with `Cache-Control: no-cache, no-store` and `Service-Worker-Allowed: /`). It is registered in production builds only (not under `next dev`).

**What it caches.** Per build, in `fp-precache-<buildId>`: the build's `/_next/static` files (JS, CSS, fonts), the manifest, the favicon, the app icons (`/apple-icon.png`, `/icons/*.png`), and the user-independent shells `/`, `/match/setup`, `/match/live`, `/team`, `/offline` and their `/no` versions. Shells are served cache-first; other pages are network-first (8 s) and fall back to the offline page. `/` opens the last used locale's Home from the cache. Navigation responses are never stored at runtime. `/api/*`, auth paths, RSC requests, non-GET requests and other origins (Supabase) are never cached or answered by the worker. `fp-meta` holds the last locale and the update gate. Match data lives in localStorage, which the worker never touches.

**Updates during matches.** A new deploy is fetched on the next update check (page load, `online`, app back in view), but:

- while a match is active on the device, the new build's install is refused, so it can neither wait nor activate at a cold start. It installs right after the match ends;
- a build that was already waiting when the match started (the coach chose «Senere») may be activated by the browser when the app is closed, but it then keeps serving the previous build's files until the match ends, so the coach reopens the same version;
- without a match the coach sees «Oppdatering klar» and the app reloads once on «Oppdater nå». Other open tabs reload once too, unless a match is active in them;
- the one exception is «Oppdatering kreves»: data on the device is newer than the running build (it cannot save), so the newer build is activated even mid-match. If that does not help, the sheet asks the coach to close and reopen the app instead of reloading in a loop.

**Kill switch** (a broken worker in production):

1. Set `NEXT_PUBLIC_FP_SW=off` for the Production environment in Vercel and redeploy (it is a build-time variable, so a redeploy is required).
2. That build serves a worker that activates immediately, deletes every `fp-` cache and unregisters itself; pages unregister any FairPlayr worker they find. It never reloads a page, so a running match is not interrupted; localStorage (matches, teams) is untouched.
3. Users need to do nothing while online: the next update check (opening the app, coming back online) picks it up. A device that stays offline keeps the old worker until it is online again. If a page is stuck, closing and reopening the app is enough.
4. Verify on the preview deployment first, twice (the second request must not come from a cache):

   ```bash
   curl -sI https://<preview-url>/serwist/sw.js   # 200, cache-control: no-cache, no-store, must-revalidate; service-worker-allowed: /
   curl -sI https://<preview-url>/serwist/sw.js   # same headers again (no age / x-vercel-cache: HIT)
   curl -s  https://<preview-url>/serwist/sw.js | head -c 200   # banner contains "mode":"off"
   ```

5. To turn the worker back on, remove the variable (or set it to `on`) and redeploy.

The offline suite (`npm run test:e2e:offline`, `playwright.offline.config.ts`) builds the app and cuts the network with a local proxy (`e2e/offline/support/netControl.mjs`, all on `127.0.0.1`: proxy 3220, control API 3221, Supabase stub 3229, `next start` 3200).

## Security Scanning (Trivy)

This project includes continuous Trivy scanning in GitHub Actions via `.github/workflows/security-trivy.yml`.

Code scanning is also configured with CodeQL via `.github/workflows/codeql.yml`.

- Triggers:
- Push to `main` and `develop`
- All pull requests
- Nightly scheduled run (cron)
- Coverage:
- Filesystem/repository scan (`trivy-fs` job)
- Built Docker image scan (`build-and-scan-image` job)
- Reporting:
- Both jobs generate SARIF files and upload them to GitHub code scanning/security results.
- SARIF upload is controlled by the repository variable `TRIVY_UPLOAD_SARIF`.
- Set `TRIVY_UPLOAD_SARIF=true` after GitHub Code Scanning is enabled in repository settings.
- If you do not have admin rights to enable Code Scanning, keep `TRIVY_UPLOAD_SARIF=false` and scans will still run with HIGH/CRITICAL gating.
- Gating:
- A separate gating scan runs after SARIF upload in each job.
- Pipelines only fail on `HIGH` and `CRITICAL` findings.
- `ignore-unfixed=true` is enabled for both reporting and gating scans.

## Status

### Working now

- Team and player management (guest and cloud modes)
- Match setup and live match control
- Match planner with manual and Spond-backed event import paths
- Authentication (Google, password, magic link)
- Spond beta integration flow through GUI

### Out of scope for MVP right now

- Heavy analytics and advanced elite-level performance tooling
- Complex club administration systems

## Roadmap

Planned work, open bugs, ideas and the full development history live in one place: [`roadmap/roadmap.json`](roadmap/roadmap.json), with a generated overview in [`ROADMAP.md`](ROADMAP.md). How to read and maintain it: [`roadmap/README.md`](roadmap/README.md).

## iOS / Capacitor

FairPlayr is packaged as a native iOS app using Capacitor in **server URL mode**: the WKWebView loads the live Vercel deployment rather than a bundled static build. This keeps all API routes, SSR, Supabase auth, and next-intl server features working identically on web and iOS. Internet connectivity is required (Supabase auth already requires it).

### Key files

| File | Purpose |
| --- | --- |
| `capacitor.config.ts` | Capacitor config — app ID, server URL, iOS/plugin settings |
| `src/lib/native.ts` | Runtime helper: `isNative()` + `initNative()` for plugin setup |
| `src/components/layout/NativeAppShell.tsx` | Shell wrapper: native init, offline detection |
| `src/components/layout/OfflineScreen.tsx` | Localised offline fallback screen |
| `ios/` | Generated Xcode project (managed by Capacitor, do not edit manually) |

### Development workflow

```bash
# 1. Start the Next.js dev server
npm run dev

# 2. Sync Capacitor config pointing at localhost + open Xcode
npm run cap:sync:dev
npm run cap:ios
# Then press Run in Xcode (simulator or device)
```

### Configuring the server URL

`CAPACITOR_SERVER_URL` controls which URL the WKWebView loads. It is read at `cap sync` time (not at app runtime), so re-sync after changing it.

```bash
# Local development — loads from the Next.js dev server
npm run cap:sync:dev

# Production — pass your Vercel URL explicitly
CAPACITOR_SERVER_URL=https://your-app.vercel.app npm run cap:sync:prod

# No URL set — Capacitor falls back to loading from webDir (static files)
npm run cap:sync
```

There is no hardcoded URL in `capacitor.config.ts`. If `CAPACITOR_SERVER_URL` is not set, `server` is `undefined` and Capacitor uses `webDir` instead.

### iOS layout and safe areas

Safe areas are handled via CSS utility classes:

- `pt-safe` — top safe area (used by Header)
- `pb-safe` — bottom safe area (used by BottomNav)
- `pl-safe` / `pr-safe` — side safe areas (available if needed)

`viewport-fit=cover` is set in the `Viewport` export in `src/app/[locale]/layout.tsx`, which activates `env(safe-area-inset-*)` in the WKWebView.

The status bar is configured as transparent/overlay via `@capacitor/status-bar` in `NativeAppShell`, matching the `appleWebApp.statusBarStyle: "black-translucent"` metadata in the layout.

### Limitations of this setup

- The iOS app requires an internet connection (server URL mode loads content from Vercel).
- Any web-only deployment (e.g. Vercel preview branch) requires a `cap:sync` + Xcode rebuild to reach the iOS app.
- Android is not set up. Capacitor supports it, but it is explicitly out of scope for now.

---

## TestFlight Release

### App metadata (set in repo / Xcode project)

| Setting | Value |
| --- | --- |
| Bundle ID | `app.fairplayr.mobile` |
| Display name | FairPlayr |
| Version | 1.0 |
| Build | 1 |
| iOS deployment target | 15.0 |
| Orientation | Portrait only |
| Launch screen | Solid dark `#0b0f1a` (matches splash background) |

### App icon requirements

The current app icon is the **Capacitor default placeholder** and must be replaced before TestFlight.

**Spec:**
- Format: PNG, 1024 × 1024 px
- No alpha channel (App Store rejects transparent icons)
- No rounded corners (iOS applies the mask automatically)

**Where to place it:**

Replace the file at:
```
ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
```

The `Contents.json` in that folder already references this filename. Xcode generates all required size variants automatically.

### Splash screen

The native launch screen (`LaunchScreen.storyboard`) currently shows a solid dark background (`#0b0f1a`), which matches the Capacitor `SplashScreen` plugin color and prevents any white flash on startup.

To add branded splash artwork later:

1. Add a 2732 × 2732 px PNG to `ios/App/App/Assets.xcassets/Splash.imageset/`
2. Update `LaunchScreen.storyboard` to reference it as an `imageView` with `contentMode="scaleAspectFill"`

### First TestFlight release — step by step

**Before you open Xcode:**

```bash
# 1. Confirm the Vercel deployment is live and up to date
# 2. Sync Capacitor with the production URL
CAPACITOR_SERVER_URL=https://your-app.vercel.app npm run cap:sync:prod

# 3. Open Xcode
npm run cap:ios
```

**In Apple Developer (developer.apple.com):**

- [ ] Register bundle ID `app.fairplayr.mobile` under Certificates, Identifiers & Profiles
- [ ] Create or confirm you have a valid Distribution certificate

**In App Store Connect (appstoreconnect.apple.com):**

- [ ] Create a new app record
- [ ] Set bundle ID: `app.fairplayr.mobile`
- [ ] Set primary language, category (Sports), and a privacy policy URL

**In Xcode:**

- [ ] Open `ios/App/App.xcodeproj` (or use `npm run cap:ios`)
- [ ] Target → Signing & Capabilities → set your Team
- [ ] Verify bundle ID shows `app.fairplayr.mobile`
- [ ] Set version `1.0` and build number `1` (or increment as needed)
- [ ] Select target device: **Any iOS Device (arm64)**
- [ ] Replace the placeholder app icon before archiving
- [ ] Product → Archive
- [ ] In the Organizer → Distribute App → App Store Connect → Upload

**Back in App Store Connect:**

- [ ] Open TestFlight tab → your new build should appear within ~30 min
- [ ] Add internal testers (Apple ID invite) or submit for external beta review

### Subsequent releases

For each new TestFlight build after the first:

```bash
# 1. Deploy updated web app to Vercel
# 2. Sync Capacitor
CAPACITOR_SERVER_URL=https://your-app.vercel.app npm run cap:sync:prod
# 3. Open Xcode, bump build number, archive, upload
npm run cap:ios
```

In server URL mode, you may only need a new Xcode build if:
- Capacitor native config changed (plugins, app ID, server URL)
- iOS deployment target or entitlements changed
- You want to bump the build number visible in TestFlight

Pure web/UI changes deployed to Vercel are live in the app immediately without a new build.

## Contributing

Contributions are welcome.

Recommended contributor workflow:

1. Create a focused branch.
2. Keep changes scoped and aligned with existing architecture.
3. Run lint and build checks locally.
4. If changing data access rules, include migration and policy rationale.
5. Open a PR with clear context, screenshots (for UI changes), and testing notes.

## License

No license file is currently included in this repository.
