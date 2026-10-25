import { expect, test, type Page } from "@playwright/test";
import {
  Device,
  STUB_TEAM_NAME,
  STUB_USER,
  THEMES,
  goalUs,
  hideDevOverlay,
  live,
  net,
  openLive,
  scoreIs,
  signIn,
  storedMatch,
  substitute,
  waitForServiceWorker,
} from "./support/offline";
import { startMatchFromSetup, waitForUndoToClose } from "./support/flows";

// OFF-01a acceptance 2 (signed-in coach, G3/B10): a coach signed in against
// the local Supabase stub (e2e/offline/support/netControl.mjs; fake user,
// team and players, no real project) starts a match online. With the network
// cut and the browser restarted, the match is restored, the coach is still
// signed in (no switch to guest) and the team comes from the local mirror.
//
// The session is the @supabase/ssr browser cookie (support/offline.ts
// `sessionCookie`). The cold start opens the exact URL the app navigated to
// when the match started (`/no/match/live?matchId=…` once the server knows
// the match), not a hand-written one.

const USER = STUB_USER;
const TEAM_NAME = STUB_TEAM_NAME;

/** The header shows the cloud team; with one team it is text, not a picker (C2-F2). */
async function expectActiveTeam(page: Page) {
  await expect(page.locator("header").first()).toContainText(TEAM_NAME, { timeout: 30_000 });
}

async function expectSignedIn(page: Page) {
  await page.getByRole("button", { name: "Åpne profilmeny" }).click();
  await expect(page.getByText(USER.email).first()).toBeVisible();
  await page.keyboard.press("Escape");
}

for (const theme of THEMES) {
  test(`signed-in coach: cold start offline keeps the session, team and match (${theme})`, async ({}, info) => {
    const device = new Device(info);
    try {
      const context = await device.start();
      await signIn(context);
      let page = await device.page();
      await page.goto("/no", { waitUntil: "domcontentloaded" });
      await page.evaluate((theme) => {
        localStorage.setItem("theme", theme);
      }, theme);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForServiceWorker(page);
      await hideDevOverlay(page);

      // Online: the team comes from the stub, and the mirror is written.
      await expectActiveTeam(page);
      await expectSignedIn(page);
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem("fairplayr.cloudTeamMirror.v1") ?? ""))
        .toContain(TEAM_NAME);
      expect((await net.log()).some((entry) => entry.target === "supabase" && entry.url.startsWith("/rest/v1/players"))).toBe(true);

      await startMatchFromSetup(page, { pickSquad: true });
      const liveUrl = new URL(page.url());
      const livePath = `${liveUrl.pathname}${liveUrl.search}`;
      info.annotations.push({ type: "live-url", description: livePath });
      const started = await storedMatch(page);
      const out = started.onFieldPlayerIds.at(-1)!;
      const incoming = started.benchPlayerIds[0];
      await goalUs(page);
      await substitute(page, out, incoming);
      await waitForUndoToClose(page);
      const before = await storedMatch(page);

      await device.goOffline();
      await device.restart(2000);
      page = await device.page();
      expect((await openLive(page, livePath))?.fromServiceWorker()).toBe(true);
      await hideDevOverlay(page);

      const after = await storedMatch(page);
      expect(after.id).toBe(before.id);
      expect(after.events).toEqual(before.events);
      expect(after.onFieldPlayerIds).toEqual(before.onFieldPlayerIds);
      await scoreIs(page, 1, 0);
      await expect(live.token(page, incoming)).toBeVisible();
      await expect(live.bench(page, out)).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("fairplayr.authIdentity.v1"))).toContain(USER.id);

      // Home offline: still signed in, the cloud team from the mirror, not a guest team.
      await page.goto("/no", { waitUntil: "domcontentloaded" });
      await hideDevOverlay(page);
      await expectActiveTeam(page);
      await expectSignedIn(page);
      expect(await page.evaluate(() => localStorage.getItem("fairplayr.authIdentity.v1"))).toContain(USER.id);
      expect((await storedMatch(page)).events).toEqual(before.events);
    } finally {
      await device.dispose();
    }
  });
}
