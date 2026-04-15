import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for FairPlayr iOS.
 *
 * FairPlayr runs as a Next.js app on Vercel. Capacitor wraps it as a native
 * iOS shell using server URL mode — the WebView loads the live Vercel deployment
 * rather than a bundled static export. This keeps all API routes, SSR, and
 * Supabase auth intact.
 *
 * Set CAPACITOR_SERVER_URL when running cap sync:
 *   CAPACITOR_SERVER_URL=http://localhost:3000 npm run cap:sync:dev   # dev
 *   CAPACITOR_SERVER_URL=https://your-app.vercel.app npm run cap:sync  # production
 *
 * If CAPACITOR_SERVER_URL is not set, Capacitor falls back to loading from
 * webDir (static files). This is the correct behaviour for production builds
 * where the URL is injected by CI rather than hardcoded here.
 */

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: "app.fairplayr.mobile",
  appName: "FairPlayr",

  // webDir is required by Capacitor. In server URL mode (when CAPACITOR_SERVER_URL
  // is set) this directory is not loaded. If you ever switch to static export,
  // run `next build` with `output: 'export'` and point this to 'out'.
  webDir: "out",

  server: serverUrl
    ? {
        url: serverUrl,
        // Allow cleartext (http://) for local dev; https is enforced in prod.
        cleartext: serverUrl.startsWith("http://"),
      }
    : undefined,

  ios: {
    // Keep native UI elements from overlapping web content.
    // Safe area insets are handled via env(safe-area-inset-*) in CSS.
    contentInset: "always",
    // Prevent the whole-page rubber-band scroll that feels wrong in an app.
    scrollEnabled: false,
    // Use WKWebView's liminal dark/light mode to match the app's theme.
    allowsLinkPreview: false,
    preferredContentMode: "mobile",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0b0f1a",
      // Splash assets go in ios/App/App/Assets.xcassets/Splash.imageset
      // Replace with your own once artwork is ready.
      showSpinner: false,
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      // Transparent status bar so the header's background bleeds through.
      // Matches appleWebApp.statusBarStyle: "black-translucent" in layout.tsx.
      overlaysWebView: true,
      style: "Dark",
      backgroundColor: "#00000000",
    },
  },
};

export default config;
