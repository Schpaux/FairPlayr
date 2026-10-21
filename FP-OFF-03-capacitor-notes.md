# FP-OFF-03: Capacitor notes for offline-first iOS (B3, A + B)

Documentation only. Nothing in `capacitor.config.ts`, `ios/` or `Info.plist` has been changed. A new iOS build, `npx cap sync` and TestFlight each need separate approval (AGENTS.md §1).

Sources: FP-OFF-01 §2.6 and B3, `capacitor.config.ts` at `de884e8`, and the type declarations of the installed `@capacitor/cli` 8.5.3 (`node_modules/@capacitor/cli/dist/declarations.d.ts`).

## Current state

- **Server URL mode.** `server.url = CAPACITOR_SERVER_URL` (the Vercel deployment). The WKWebView loads the live site, and `webDir: "out"` is not used.
- **No app-bound domains.** WKWebView only supports service workers for domains listed in `WKAppBoundDomains`, so today the PWA service worker (stream B) **does not run in the iOS app**. The app cannot start without a network connection.
- **Splash** `backgroundColor: "#0b0f1a"` is the old indigo-era colour. FP-OFF-01 §2.5 says it should be `#121B16` (`BRAND_COLORS.canvasDark` in `src/lib/pwa/brandColors.ts`).

## A: let the service worker run in WKWebView

1. **`Info.plist`**: add `WKAppBoundDomains` (an array of at most 10 entries) containing the production host, for example `fairplayr.app` or the Vercel production domain. No scheme or path. A preview or dev host (for `cap:sync:dev` against `localhost`) has to be listed too, or that build loses the service worker as well. Capacitor's docs say `localhost` (or `server.hostname`) must also be in the list.
2. **`capacitor.config.ts`**: set `ios.limitsNavigationsToAppBoundDomains: true`. Capacitor recommends it whenever `WKAppBoundDomains` is present, because otherwise some features break.
3. **Expected result:** after **one online launch**, the service worker installs and precaches the shells (`/no`, `/no/match/setup`, `/no/match/live`, `/no/team`). Later cold starts work offline, as in the browser (§S). The first launch must always be online.
4. **Check on a device:** `navigator.serviceWorker` exists in the app, the precache is filled after the first launch, and a cold start in airplane mode shows Home and Live with the local state intact.

## Consequence: navigation outside the app-bound domains is blocked

With `limitsNavigationsToAppBoundDomains: true`, the WKWebView refuses to navigate to any host that is not in the list.

- **Supabase OAuth (Google):** `signInWithOAuth` (`src/app/[locale]/auth/sign-in/page.tsx:94`, `sign-up/page.tsx:68`) navigates to `*.supabase.co` and then `accounts.google.com`. Google rejects embedded WebViews anyway (`disallowed_useragent`). Options:
  - open the OAuth URL in `SFSafariViewController` or `ASWebAuthenticationSession` (`@capacitor/browser` with `skipBrowserRedirect: true`), and return through a custom URL scheme or universal link that the app handles with `App.addListener("appUrlOpen")`. The callback then exchanges the code (`exchangeCodeForSession`) inside the WebView. Supabase redirect URLs need the scheme or universal link added (a Supabase dashboard change, which needs approval);
  - or keep email and password only on iOS until that flow exists.
- **Supabase API calls** (`fetch` to `*.supabase.co`) are subresource requests, not navigations, so app-bound domains should not block them. Verify on a device: App-Bound Domains also limits some JavaScript and cookie APIs to the listed domains.
- **External links** (Spond, mailto, support pages) must open in the system browser, not inside the WebView.
- **`server.allowNavigation`** is marked "not intended for use in production" in the Capacitor types. Do not use it to get around this.

## B: bundled error page when the app has never been online

- `server.errorPath` (Capacitor ≥ 4, "path to a local html page to display in case of errors") points to a static file in `webDir`. The name is verified against the 8.5.3 types; the exact path resolution must still be checked on iOS.
- Proposal: `out/offline-error.html` (or a dedicated `webDir`). One self-contained HTML file with inline CSS that uses the Modern Sideline tokens as literal values (canvas `#121B16` / `#F9FAF8`, ink, the lime button). No fonts or CDN requests (AGENTS §3). Text in Norwegian and English: «Ingen forbindelse. FairPlayr må være på nett første gang appen åpnes.» and a «Prøv igjen» button that reloads `server.url`.
- The file is not translated through `messages/*.json`, because it is outside Next. Its two strings must be kept in sync by hand, or generated from the message files at build time.
- `webDir: "out"` is not built today. B needs a small step that copies the error page into `webDir` before `cap sync`, without switching to a static export.

## Not part of A + B (OFF-03 phase C, its own L task)

- A bundled static export (`output: "export"`) changes the origin to `capacitor://localhost`. localStorage from the server origin does not carry over, so data would need to be migrated, and API routes and SSR would have to move off the device. This is out of scope for OFF-01.

## Checklist for the iOS patch (when approved)

- [ ] `Info.plist`: `WKAppBoundDomains` (production host, plus localhost for dev)
- [ ] `capacitor.config.ts`: `ios.limitsNavigationsToAppBoundDomains: true`, `server.errorPath`, splash `#121B16`
- [ ] Bundled error page in `webDir`, plus a copy step before `cap sync`
- [ ] OAuth through an external browser session and a deep-link callback (or email-only on iOS)
- [ ] External links open in the system browser
- [ ] Device test: first launch online, then cold start offline; OAuth sign-in; sign-out
- [ ] Separate approval for `cap sync`, the Xcode build and TestFlight
