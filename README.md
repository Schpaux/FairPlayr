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
├─ messages/                        # en.json / no.json translations
└─ public/manifest.json             # PWA manifest
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

Notes:

- If SPOND_CREDENTIALS_SECRET is missing, Spond connect/import endpoints will fail with encryption configuration errors.
- Do not commit production secrets.

## Development Notes

- Locale routing uses as-needed prefixing: English is default without prefix, Norwegian uses /no/* paths.
- Auth session refresh is middleware-driven via src/proxy.ts and Supabase SSR helpers.
- Team repository mode switches automatically based on authenticated user presence.
- Match setup/live state is persisted in local storage, even when cloud mode is active.
- RLS and policy changes are high-impact: validate both API behavior and policy behavior when touching migrations.
- Spond API calls run server-side in the provider/service layer; credentials are never exposed to the client after submit.

## Status

### Working now

- Team and player management (guest and cloud modes)
- Match setup and live match control
- Match planner with manual and Spond-backed event import paths
- Authentication (Google, password, magic link)
- Spond beta integration flow through GUI

### Actively being built

- Deepening Spond-driven workflows around match participation and planning
- Tightening data integrity and sync ergonomics across integration surfaces

### Out of scope for MVP right now

- Heavy analytics and advanced elite-level performance tooling
- Complex club administration systems

## Roadmap

Near-term directions visible from current structure and code:

- Deeper matchday workflow continuity between planner, setup, and live modules
- Continued Spond hardening (beta to more stable flow)
- Smarter fairness guidance in live substitution decisions
- Better sharing/export patterns for practical coaching workflows
- Packaging path from web-first experience toward app-like distribution

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
