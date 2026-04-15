/**
 * Native runtime helpers for Capacitor iOS shell.
 *
 * Keep this file minimal. Its only job is to give the rest of the app a clean
 * way to ask "are we running inside the native app?" and to initialise
 * lightweight native plugins (StatusBar, SplashScreen) on startup.
 *
 * Import from this file only in client components or useEffect hooks —
 * Capacitor APIs are not available during SSR.
 */

/**
 * Returns true when the app is running inside a Capacitor native shell
 * (i.e. on device or simulator), false in a regular browser.
 *
 * Safe to call server-side: returns false there.
 */
export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  // Capacitor sets this global when the native bridge is present.
  return !!(window as unknown as Record<string, unknown>)["Capacitor"];
}

/**
 * Initialise native-only behaviour on app startup.
 * Call this once from a top-level client component (e.g. a NativeInit component
 * rendered in the locale layout).
 *
 * Currently handles:
 *   - Hiding the splash screen after first render
 *   - Configuring the status bar to overlay the WebView
 */
export async function initNative(): Promise<void> {
  if (!isNative()) return;

  const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import("@capacitor/splash-screen"),
    import("@capacitor/status-bar"),
  ]);

  // Hide splash screen. launchAutoHide is true in capacitor.config.ts, but
  // calling hide() explicitly ensures it disappears even if the first paint
  // is slow.
  await SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => undefined);

  // Transparent status bar so the header background bleeds through naturally.
  await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
}
