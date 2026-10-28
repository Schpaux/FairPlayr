"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { getPathname } from "@/i18n/navigation";
import { APP_HOME_PATH, PWA_SOURCE_PARAM, PWA_SOURCE_VALUE } from "@/lib/appRoutes";

type AppWindow = Window & {
  navigator: Navigator & { standalone?: boolean };
  Capacitor?: { isNativePlatform?: () => boolean };
};

/**
 * True inside an installed app: a standalone PWA, an iOS home-screen app
 * (`navigator.standalone`) or the Capacitor shell.
 */
export function isInstalledApp(win: AppWindow): boolean {
  if (win.matchMedia?.("(display-mode: standalone)").matches) return true;
  if (win.navigator.standalone === true) return true;
  return win.Capacitor?.isNativePlatform?.() === true;
}

/**
 * The fallback for an installed app that opens the website without the
 * launch marker (WEB-01d): iOS installs from before the manifest (OFF-02)
 * start at `/`, and the Capacitor shell loads the site's root. Sends them to
 * the app's Home with a full navigation, so the service worker can answer
 * offline. Renders nothing; a browser tab is never redirected.
 */
export function StandaloneRedirect() {
  const locale = useLocale();

  useEffect(() => {
    if (!isInstalledApp(window as AppWindow)) return;
    const home = getPathname({ href: APP_HOME_PATH, locale });
    window.location.replace(`${home}?${PWA_SOURCE_PARAM}=${PWA_SOURCE_VALUE}`);
  }, [locale]);

  return null;
}
